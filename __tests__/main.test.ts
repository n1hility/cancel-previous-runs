import * as process from 'process'
import * as cp from 'child_process'
import * as path from 'path'

test('no op', () => {})

// shows how the runner will run a javascript action with env / stdout protocol
// test('test runs', () => {
//   const ip = path.join(__dirname, '..', 'lib', 'main.js')
//   process.env['INPUT_TOKEN'] = ''
//   process.env['GITHUB_RUN_ID'] = '33782469'
//   process.env['GITHUB_REPOSITORY'] = 'n1hility/cancel-previous-runs'
//   process.env['GITHUB_REF'] = 'refs/heads/master'
//   const options: cp.ExecSyncOptions = {
//     env: process.env
//   }
//   try {
//     console.log(cp.execSync(`node ${ip}`, options).toString())
//   } catch (error) {
//     console.log('Error stdout =  ' + error.stdout.toString())
//   }
// })
