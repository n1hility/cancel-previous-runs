# cancel-previous-runs 

This is just a fork from `n1hility/cancel-previous-runs`, extended to allow additional events be permitted to cancel a run.

This action cancels previous runs for one or more branches/prs associated with a workflow, effectively limiting the resource consumption of the workflow to one per branch.

<p><a href="https://github.com/actions/typescript-action/actions"><img alt="typescript-action status" src="https://github.com/actions/typescript-action/workflows/build-test/badge.svg"></a>

## Usage

The easiest and most complete approach to utilize this action, is to create a separate schedule event triggered workflow, which is directed at the workflow you wish to clear duplicate runs. At each cron interval all branches and all PRs executing for either push or pull_request events will be processed and limited to one run per branch/pr.

Additionally this action can be placed as an early step in your workflow (e.g. after checkout), so that it can abort the other previously running jobs immediately, in case most resources are tied up. Unfortunately this approach is a no-op when a pull request uses a fork for a source branch. This is because the GITHUB_TOKEN provided to runs with a fork source branch specifies reed-only permissions for security reasons. write permissions are required to be able to cancel a job. Therefore, it's a good idea to only rely on this approach as a fallback in-addition to the previously described scheduling model. 

### Inputs

token - The github token passed from `${{ secrets.GITHUB_TOKEN }}`. Since workflow files are visible in the repository, **DO NOT HARDCODE A TOKEN ONLY USE A REFERENCE**. 
workflow - The filename of the workflow to limit runs on (only applies to schedule events) 
events - list of additional events (in addition to the default events of `push` and `pull_request`, e.g. you may add `workflow_dispatch` and/or `repository_dispatch`)

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
      - uses: n1hility/cancel-previous-runs@v2
        with: 
          token: ${{ secrets.GITHUB_TOKEN }}
          workflow: my-heavy-workflow.yml
```


### Alternate/Fallback Example

```yaml
  test: 
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v1
    - uses: n1hility/cancel-previous-runs@v2
      with: 
        token: ${{ secrets.GITHUB_TOKEN }}
```

## License
The scripts and documentation in this project are released under the [MIT License](LICENSE)
