import * as process from 'process'
import * as cp from 'child_process'
import * as path from 'path'

test('no op', () => {})

// shows how the runner will run a javascript action with env / stdout protocol
// test('test runs', () => {
//   const ip = path.join(__dirname, '..', 'lib', 'main.js')
//   process.env['INPUT_TOKEN'] = ''
//   process.env['INPUT_WORKFLOW'] = 'ci-actions.yml'
//   process.env['GITHUB_RUN_ID'] = '41374869' //'33782469'
//   process.env['GITHUB_REPOSITORY'] = ''
//   //process.env['GITHUB_HEAD_REF'] = 'refs/heads/n1hility-patch-5'
//   //process.env['GITHUB_REF'] = 'refs/heads/master'
//   // process.env['GITHUB_EVENT_NAME'] = 'push'
//   process.env['GITHUB_EVENT_NAME'] = 'schedule'

//   //   process.env['GITHUB_RUN_ID'] = '35599067'
//   //   process.env['GITHUB_REPOSITORY'] = ''
//   //   process.env['GITHUB_REF'] = 'refs/heads/master'
//   //   process.env['GITHUB_EVENT_NAME'] = 'push'

//   const options: cp.ExecSyncOptions = {
//     env: process.env
//   }
//   try {
//     console.log(cp.execSync(`node ${ip}`, options).toString())
//   } catch (error) {
//     console.log('Error stdout =  ' + error.stdout.toString())
//   }
// })
