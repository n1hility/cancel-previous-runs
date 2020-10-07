import * as core from '@actions/core'
import * as github from '@actions/github'
import * as treemap from 'jstreemap'
import Octokit from '@octokit/rest'

function createRunsQuery(
  octokit: github.GitHub,
  owner: string,
  repo: string,
  workflowId: string,
  status: string,
  branch?: string,
  event?: string
): Octokit.RequestOptions {
  const request =
    branch === undefined
      ? {
          owner,
          repo,
          // eslint-disable-next-line @typescript-eslint/camelcase
          workflow_id: workflowId,
          status
        }
      : {
          owner,
          repo,
          // eslint-disable-next-line @typescript-eslint/camelcase
          workflow_id: workflowId,
          status,
          branch,
          event
        }

  return octokit.actions.listWorkflowRuns.endpoint.merge(request)
}

async function cancelDuplicates(
  token: string,
  selfRunId: string,
  owner: string,
  repo: string,
  workflowId?: string,
  branch?: string,
  event?: string
): Promise<void> {
  const octokit = new github.GitHub(token)

  // Determine the workflow to reduce the result set, or reference another workflow
  let resolvedId = ''
  if (workflowId === undefined) {
    const reply = await octokit.actions.getWorkflowRun({
      owner,
      repo,
      // eslint-disable-next-line @typescript-eslint/camelcase
      run_id: Number.parseInt(selfRunId)
    })

    resolvedId = reply.data.workflow_url.split('/').pop() || ''
    if (!(resolvedId.length > 0)) {
      throw new Error('Could not resolve workflow')
    }
  } else {
    resolvedId = workflowId
  }

  core.info(`Workflow ID is: ${resolvedId}`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sorted = new treemap.TreeMap<number, any>()
  for (const status of ['queued', 'in_progress']) {
    const listRuns = createRunsQuery(
      octokit,
      owner,
      repo,
      resolvedId,
      status,
      branch,
      event
    )
    for await (const item of octokit.paginate.iterator(listRuns)) {
      // There is some sort of bug where the pagination URLs point to a
      // different endpoint URL which trips up the resulting representation
      // In that case, fallback to the actual REST 'workflow_runs' property
      const elements =
        item.data.length === undefined ? item.data.workflow_runs : item.data

      for (const element of elements) {
        sorted.set(element.run_number, element)
      }
    }
  }

  // If a workflow was provided process everything
  let matched = workflowId !== undefined
  const heads = new Set()
  for (const entry of sorted.backward()) {
    const element = entry[1]
    core.info(
      `${element.id} : ${element.event} : ${element.workflow_url} : ${element.status} : ${element.run_number}`
    )

    if (!matched) {
      if (element.id.toString() !== selfRunId) {
        // Skip everything up to this run
        continue
      }

      matched = true
      core.info(`Matched ${selfRunId}`)
    }

    if (
      'completed' === element.status.toString() ||
      !['push', 'pull_request'].includes(element.event.toString())
    ) {
      continue
    }

    // This is a set of one in the non-schedule case, otherwise everything is a candidate
    const head = `${element.head_repository.full_name}/${element.head_branch}`
    if (!heads.has(head)) {
      core.info(`First: ${head}`)
      heads.add(head)
      continue
    }

    core.info(`Cancelling: ${head}`)

    await cancelRun(octokit, owner, repo, element.id)
  }
}

async function run(): Promise<void> {
  try {
    const token = core.getInput('token')

    core.info(token)

    const selfRunId = getRequiredEnv('GITHUB_RUN_ID')
    const repository = getRequiredEnv('GITHUB_REPOSITORY')
    const eventName = getRequiredEnv('GITHUB_EVENT_NAME')

    const [owner, repo] = repository.split('/')
    const branchPrefix = 'refs/heads/'
    const tagPrefix = 'refs/tags/'

    if ('schedule' === eventName) {
      const workflowId = core.getInput('workflow')
      if (!(workflowId.length > 0)) {
        throw new Error('Workflow must be specified for schedule event type')
      }
      await cancelDuplicates(token, selfRunId, owner, repo, workflowId)
      return
    }

    if (!['push', 'pull_request', 'repository_dispatch', 'schedule'].includes(eventName)) {
      core.info('Skipping unsupported event')
      return
    }

    const pullRequest = 'pull_request' === eventName

    let branch = getRequiredEnv(pullRequest ? 'GITHUB_HEAD_REF' : 'GITHUB_REF')
    
    if (!pullRequest && !branch.startsWith(branchPrefix)) {
      if (branch.startsWith(tagPrefix)) {
        core.info(`Skipping tag build`)
        return
      }
      const message = `${branch} was not an expected branch ref (refs/heads/).`
      throw new Error(message)
    }
    branch = branch.replace(branchPrefix, '')

    core.info(
      `Branch is ${branch}, repo is ${repo}, and owner is ${owner}, and id is ${selfRunId}`
    )

    cancelDuplicates(
      token,
      selfRunId,
      owner,
      repo,
      undefined,
      branch,
      eventName
    )
  } catch (error) {
    core.setFailed(error.message)
  }
}

async function cancelRun(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  octokit: any,
  owner: string,
  repo: string,
  id: string
): Promise<void> {
  let reply
  try {
    reply = await octokit.actions.cancelWorkflowRun({
      owner,
      repo,
      // eslint-disable-next-line @typescript-eslint/camelcase
      run_id: id
    })
    core.info(`Previous run (id ${id}) cancelled, status = ${reply.status}`)
  } catch (error) {
    core.info(
      `[warn] Could not cancel run (id ${id}): [${error.status}] ${error.message}`
    )
  }
}

function getRequiredEnv(key: string): string {
  const value = process.env[key]
  if (value === undefined) {
    const message = `${key} was not defined.`
    throw new Error(message)
  }
  return value
}

run()
