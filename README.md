# cancel-previous-runs 

This action cancels all previous runs on the same branch, effectively limiting the resource consumption of the workflow using this action to one run per branch. 

<p><a href="https://github.com/actions/typescript-action/actions"><img alt="typescript-action status" src="https://github.com/actions/typescript-action/workflows/build-test/badge.svg"></a>

## Usage

This action should be placed as an early step in your workflow (e.g. after chekout), so that it can abort the other running jobs before consuming additional capacity. Additionally, it requires that the running Github Action token (located in the secrets context) be passed as an input parameter so that it can list and cancel workflow runs associated with the workflow's repository.

### Inputs

token - The github token passed from `${{ secrets.GITHUB_TOKEN }}`. Since workflow files are visible in the repository, **DO NOT HARDODE A TOKEN ONLY USE A REFERENCE**. 

### Example

```yaml
  test: 
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v1
    - uses: n1hility/cancel-previous-runs@v1
      with: 
        token: ${{ secrets.GITHUB_TOKEN }}
```

## License
The scripts and documentation in this project are released under the [MIT License](LICENSE)
