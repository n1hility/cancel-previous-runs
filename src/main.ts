import * as github from '@actions/github'
import * as core from '@actions/core'
import Octokit from '@octokit/rest'
import * as treemap from 'jstreemap'

function createListRunsQueryForAllRuns(
  octokit: github.GitHub,
  owner: string,
  repo: string,
  workflowId: string,
  status: string,
): Octokit.RequestOptions {
  const request = {
    owner,
    repo,
    // eslint-disable-next-line @typescript-eslint/camelcase
    workflow_id: workflowId,
    status
  }
  return octokit.actions.listWorkflowRuns.endpoint.merge(request)
}

function createListRunsQueryForSelfRun(
    octokit: github.GitHub,
    owner: string,
    repo: string,
    workflowId: string,
    status: string,
    branch: string,
    eventName: string
): Octokit.RequestOptions {
  const request = {
    owner,
    repo,
    // eslint-disable-next-line @typescript-eslint/camelcase
    workflow_id: workflowId,
    status,
    branch,
    event: eventName
  }
  return octokit.actions.listWorkflowRuns.endpoint.merge(request)
}

function createJobsForWorkflowRunQuery(
    octokit: github.GitHub,
    owner: string,
    repo: string,
    runId: number,
): Octokit.RequestOptions {
  const request = {
    owner,
    repo,
    // eslint-disable-next-line @typescript-eslint/camelcase
    run_id: runId,
  }
  return octokit.actions.listJobsForWorkflowRun.endpoint.merge(request)
}

async function cancelOnFailFastJobsFailed(
    octokit: github.GitHub,
    owner: string,
    repo: string,
    runId: number,
    head: string,
    failFastJobNames: string[]
): Promise<void> {
  const listJobs = createJobsForWorkflowRunQuery(
      octokit,
      owner,
      repo,
      runId,
  )
  core.info(`Cancelling runId ${runId} in case one of the ${failFastJobNames} failed`)
  for await (const item of octokit.paginate.iterator(listJobs)) {
    for (const job of item.data.jobs) {
      core.info(`The job name: ${job.name}, Conclusion: ${job.conclusion}`)
      if (job.conclusion == 'failure' &&
          failFastJobNames.some(jobNameRegexp => job.name.match(jobNameRegexp) )) {
        core.info(`Job ${job.name} has failed and it matches one of the ${failFastJobNames} regexps`)
        core.info(`Cancelling the workflow run: ${runId}, head: ${head}`)
        await cancelRun(octokit, owner, repo, runId)
        return
      }
    }
  }
}

async function getSelfWorkflowId(
    octokit: github.GitHub,
    selfRunId: string,
    owner: string,
    repo: string) {
  let workflowId: string
  const reply = await octokit.actions.getWorkflowRun({
    owner,
    repo,
    // eslint-disable-next-line @typescript-eslint/camelcase
    run_id: Number.parseInt(selfRunId)
  })
  workflowId = reply.data.workflow_url.split('/').pop() || ''
  if (!(workflowId.length > 0)) {
    throw new Error('Could not resolve workflow')
  }
  return workflowId
}

async function getSortedWorkflowRuns(
    octokit: github.GitHub,
    createListRunQuery: CallableFunction,
  ): Promise<treemap.TreeMap<number, Octokit.ActionsListWorkflowRunsResponseWorkflowRunsItem>>{
  const sortedWorkflowRuns = new treemap.TreeMap<number, any>()
  for (const status of ['queued', 'in_progress']) {
    const listRuns = await createListRunQuery(status)
    for await (const item of octokit.paginate.iterator(listRuns)) {
      // There is some sort of bug where the pagination URLs point to a
      // different endpoint URL which trips up the resulting representation
      // In that case, fallback to the actual REST 'workflow_runs' property
      const elements =
          item.data.length === undefined ? item.data.workflow_runs : item.data

      for (const element of elements) {
        sortedWorkflowRuns.set(element.run_number, element)
      }
    }
  }
  core.info(`Found runs: ${Array.from(sortedWorkflowRuns.backward()).map(t => t[0])}`)
  return sortedWorkflowRuns
}

function shouldRunBeSkipped(runItem: Octokit.ActionsListWorkflowRunsResponseWorkflowRunsItem) {
  if ('completed' === runItem.status.toString()) {
    core.info(`Skip completed run: ${runItem.id}`)
    return true
  }

  if (!['push', 'pull_request'].includes(runItem.event.toString())) {
    core.info(`Skip run: ${runItem.id} as it is neither push nor pull_request (${runItem.event}`)
    return true
  }
  return false
}

async function cancelRun(
    octokit: github.GitHub,
    owner: string,
    repo: string,
    id: number,
): Promise<void> {
  let reply
  try {
    reply = await octokit.actions.cancelWorkflowRun({
      owner: owner,
      repo: repo,
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


// Kills past runs for my own workflow.
async function findAndCancelPastRunsForSelf(
    octokit: github.GitHub,
    selfRunId: string,
    owner: string,
    repo: string,
    branch: string,
    eventName: string,
): Promise<void> {
  core.info(`findAndCancelPastRunsForSelf:  ${selfRunId}, ${owner}, ${repo}, ${branch}, ${eventName}`)
  const workflowId = await getSelfWorkflowId(octokit, selfRunId, owner, repo)
  core.info(`My own workflow ID is: ${workflowId}`)
  const sortedWorkflowRuns = await getSortedWorkflowRuns(
      octokit,function(status: string) {
        return createListRunsQueryForSelfRun(octokit, owner, repo, workflowId,
            status, branch, eventName )
      }
  )
  let matched = false
  const headsToRunIdMap = new Map<string, number>()
  for (const [key, runItem] of sortedWorkflowRuns.backward()) {
    core.info(
      `Run number: ${key}, RunId: ${runItem.id}, URL: ${runItem.workflow_url}. Status ${runItem.status}`
    )
    if (!matched) {
      if (runItem.id.toString() !== selfRunId) {
        core.info(`Skip run ${runItem.id} as it was started before my own id: ${selfRunId}`)
        continue
      }
      matched = true
      core.info(`Matched ${selfRunId}. Reached my own ID, now looping through all remaining runs/`)
      core.info("I will cancel all except the first for each 'head' available")
    }
    if (shouldRunBeSkipped(runItem)){
      continue
    }
    // Head of the run
    const head = `${runItem.head_repository.full_name}/${runItem.head_branch}`
    if (!headsToRunIdMap.has(head)) {
      core.info(`First run for the head: ${head}. Skipping it. Next ones with same head will be cancelled.`)
      headsToRunIdMap.set(head, runItem.id)
      continue
    }
    core.info(`Cancelling run: ${runItem.id}, head ${head}.`)
    core.info(`There is a later run with same head: ${headsToRunIdMap.get(head)}`)
    await cancelRun(octokit, owner, repo, runItem.id)
  }
}

// Kills past runs for my own workflow.
async function findAndCancelPastRunsForSchedule(
    octokit: github.GitHub,
    workflowId: string,
    owner: string,
    repo: string,
    failFastJobNames?: string[],
): Promise<void> {
  core.info(`findAndCancelPastRunsForSchedule: ${owner}, ${workflowId}, ${repo}`)

  const sortedWorkflowRuns = await getSortedWorkflowRuns(
      octokit,function(status: string) {
        return createListRunsQueryForAllRuns(octokit, owner, repo, workflowId, status)
      }
  )

  const headsToRunIdMap = new Map<string, number>()
  for (const [key, runItem] of sortedWorkflowRuns.backward()) {
    core.info(
        ` ${key} ${runItem.id} : ${runItem.workflow_url} : ${runItem.status} : ${runItem.run_number}`
    )

    if (shouldRunBeSkipped(runItem)){
      continue
    }

    // Head of the run
    const head = `${runItem.head_repository.full_name}/${runItem.head_branch}`
    if (!headsToRunIdMap.has(head)) {
      core.info(`First run for the head: ${head}. Next runs with the same head will be cancelled.`)
      headsToRunIdMap.set(head, runItem.id)
      if (failFastJobNames !== undefined) {
        core.info("Checking if the head run failed in specified jobs")
        await cancelOnFailFastJobsFailed(octokit, owner, repo, runItem.id, head, failFastJobNames)
      } else {
        core.info("Skipping the head run.")
      }
      continue
    }
    core.info(`Cancelling run: ${runItem.id}, head ${head}.`)
    core.info(`There is a later run with same head: ${headsToRunIdMap.get(head)}`)
    await cancelRun(octokit, owner, repo, runItem.id)
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


async function runScheduledRun(octokit: github.GitHub, owner: string, repo: string) {
  const workflowId = core.getInput('workflow')
  if (!(workflowId.length > 0)) {
    core.setFailed('Workflow must be specified for schedule event type')
    return
  }
  const failFastJobNames =
      JSON.parse(core.getInput('failFastJobNames'))
  if (failFastJobNames !== undefined) {
    core.info(`Checking also if last run failed in one of the jobs: ${failFastJobNames}`)
  }

  await findAndCancelPastRunsForSchedule(octokit, workflowId, owner, repo, failFastJobNames)
  return
}

async function runRegularRun(
    octokit: github.GitHub,
    selfRunId: string,
    owner:string,
    repo:string,
    eventName: string) {
  const pullRequest = 'pull_request' === eventName
  const branchPrefix = 'refs/heads/'
  const tagPrefix = 'refs/tags/'

  let branch = getRequiredEnv(pullRequest ? 'GITHUB_HEAD_REF' : 'GITHUB_REF')
  if (!pullRequest && !branch.startsWith(branchPrefix)) {
    if (branch.startsWith(tagPrefix)) {
      core.info(`Skipping tag build`)
      return
    }
    core.setFailed(`${branch} was not an expected branch ref (refs/heads/).`)
    return
  }
  branch = branch.replace(branchPrefix, '')

  core.info(
      `Branch is ${branch}, repo is ${repo}, and owner is ${owner}, and id is ${selfRunId}`
  )

  await findAndCancelPastRunsForSelf(octokit, selfRunId, owner, repo, branch, eventName)

}

async function run(): Promise<void> {
  const token = core.getInput('token')
  const octokit = new github.GitHub(token)
  core.info(`Starting checking for workflows to cancel`)
  const selfRunId = getRequiredEnv('GITHUB_RUN_ID')
  const repository = getRequiredEnv('GITHUB_REPOSITORY')
  const eventName = getRequiredEnv('GITHUB_EVENT_NAME')

  const [owner, repo] = repository.split('/')

  if ('schedule' === eventName) {
    await runScheduledRun(octokit, owner, repo);
  } else if (!['push', 'pull_request'].includes(eventName)) {
    core.info('Skipping unsupported event')
    return
  } else {
    await runRegularRun(octokit, selfRunId, owner, repo, eventName)
  }
}

run().then(() => core.info("Cancel complete")).catch(e => core.setFailed(e.message))
