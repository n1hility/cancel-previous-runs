# cancel-workflow-runs
This action cancels runs for one or more branches/prs associated with a workflow,
effectively limiting the resource consumption of the workflow to one per branch.

It also cancels workflows from the latest workflow run if specified jobs failed.
That allows to further limit the resource usage of running workflows, without
impacting the elapsed time of successful workflow runs. Typical behaviour of
the Github Actions Workflow is that the success/failure propagation between the jobs
happens through job dependency graph (needs: in the GA yaml). However, there are cases
where you want to start some jobs without waiting for other jobs to succeed, yet if
the other jobs fail, you want to cancel the whole workflow. It's similar to
fail-fast behaviour of the matrix builds.

Since cancelling workflow does not work from "fork" pull requests for security reasons,
the capability of canceling the workflows should be built in the scheduled task.

<p><a href="https://github.com/actions/typescript-action/actions">
<img alt="typescript-action status"
    src="https://github.com/actions/typescript-action/workflows/build-test/badge.svg"></a>

I based the implementation of this action on the
[n1hility action](https://github.com/n1hility/cancel-previous-runs) to cancel the previous runs only.

## Usage

The easiest and most complete approach to utilize this action, is to create a separate schedule event
triggered workflow, which is directed at the workflow you wish to clear duplicate runs.
At each cron interval all branches and all PRs executing for either push or pull_request events
will be processed and limited to one run per branch/pr.

Additionally, this action can be placed as an early step in your workflow (e.g. after the checkout), so
that it can abort the other previously running jobs immediately, in case the workflows tie up most resources.
Unfortunately this approach is a no-op when a pull request uses a fork for a source branch.
This is because the GITHUB_TOKEN provided to runs with a fork source branch specifies reed-only
permissions for security reasons. You need write permissions to be able to cancel a job.
Therefore, it's a good idea to only rely on this approach as a fallback in-addition to the previously
described scheduling model.

### Inputs

* token - The github token passed from `${{ secrets.GITHUB_TOKEN }}`. Since workflow files are visible
  in the repository, **DO NOT HARDCODE A TOKEN ONLY USE A REFERENCE**.
* workflow - The filename of the workflow to limit runs on (only applies to schedule events)
* failFastJobNames - optional array of job name regexps. If a job name that matches any of the regexp fails
  in the most recent run, this causes a fail-fast of the run. This can be used if you want to run jobs
  in parallel but kill them as soon as some of those jobs fail - effectively turning them into "fail-fast"
  type of jobs. Note these are job names after interpolation of workflow variables - so you have to make sure that
  you use the name as displayed in the status of the workflow or use regexp to
  match the names.

### Schedule Example

```yaml
name: Cleanup Duplicate Branches and PRs
on:
  schedule:
    - cron:  '*/15 * * * *'
cancel-runs:
  # Prevent forks from running this to be nice
  if: github.repository == 'foo-org/my-repo'
  runs-on: ubuntu-latest
    steps:
      - uses: potiuk/cancel-workflow-runs@v1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          workflow: my-heavy-workflow.yml
```


### Schedule Example with fail-fast

This kills all previous runs of the workflow, and also latest run if one of the jobs
matching `^Static checks$` and `^Build docs^` or `^Build prod image .*` regexp failed in it.

```yaml
name: Cleanup Duplicate Branches and fail-fast errors
on:
  schedule:
    - cron:  '*/15 * * * *'
cancel-runs:
  # Prevent forks from running this to be nice
  if: github.repository == 'foo-org/my-repo'
  runs-on: ubuntu-latest
    steps:
      - uses: potiuk/cancel-workflow-runs@v1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          workflow: my-heavy-workflow.yml
          failFastJobNames: '["^Static checks$", "^Build docs$", "^Build prod image.*"]'
```


### Alternate/Fallback Example

```yaml
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v1
    - uses: potiuk/cancel-workflow-runs@v1
      with:
        token: ${{ secrets.GITHUB_TOKEN }}
```

## License
[MIT License](LICENSE) covers the scripts and documentation in this project.
