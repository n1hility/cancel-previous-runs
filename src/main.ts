import * as github from '@actions/github'
import * as core from '@actions/core'

async function run(): Promise<void> {
  try {
    const token = core.getInput('token')

    const selfRunId = getRequiredEnv('GITHUB_RUN_ID')
    const repository = getRequiredEnv('GITHUB_REPOSITORY')
    const eventName = getRequiredEnv('GITHUB_EVENT_NAME')

    const [owner, repo] = repository.split('/')
    const branchPrefix = 'refs/heads/'
    const tagPrefix = 'refs/tags/'

    if (!['push', 'pull_request'].includes(eventName)) {
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

    const octokit = new github.GitHub(token)
    const listRuns = octokit.actions.listRepoWorkflowRuns.endpoint.merge({
      owner,
      repo,
      branch,
      event: pullRequest ? 'pull_request' : 'push'
    })

    let matched = false
    let workflow = ''
    let headRepoName = ''
    for await (const item of octokit.paginate.iterator(listRuns)) {
      // There is some sort of bug where the pagination URLs point to a
      // different endpoint URL which trips up the resulting representation
      // In that case, fallback to the actual REST 'workflow_runs' property
      const elements =
        item.data.length === undefined ? item.data.workflow_runs : item.data

      for (const element of elements) {
        core.info(
          `${element.id} : ${element.workflow_url} : ${element.status} : ${element.run_number}`
        )

        if (!matched) {
          if (element.id.toString() === selfRunId) {
            matched = true
            workflow = element.workflow_url
            headRepoName = pullRequest ? element.head_repository.full_name : ''
          }
          // Skip everything up to and matching this run
          continue
        }

        // Only cancel jobs with the same workflow
        if (
          workflow === element.workflow_url &&
          element.status.toString() !== 'completed' &&
          (!pullRequest || headRepoName === element.head_repository.full_name)
        ) {
          await cancelRun(octokit, owner, repo, element.id)
        }
      }
    }
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
