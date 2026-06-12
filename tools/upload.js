const path = require('path')
const ci = require('miniprogram-ci')

const root = path.resolve(__dirname, '..')
const appid = 'wxcafe441891f7a49f'
const version = process.env.VERSION || require('../package.json').version
const desc = process.env.DESC || `体验版：元气小鸡跳跳 v${version}`

const project = new ci.Project({
  appid,
  type: 'miniGame',
  projectPath: root,
  privateKeyPath: path.join(root, `private.${appid}.key`),
  ignores: [
    'node_modules/**/*',
    '.git/**/*',
    'private.*.key',
    'tools/**/*',
    'package.json',
    'package-lock.json',
    'README.md'
  ]
})

ci.upload({
  project,
  version,
  desc,
  setting: {
    es6: true,
    minify: true,
    autoPrefixWXSS: false
  },
  onProgressUpdate: (info) => {
    if (typeof info === 'string') console.log(info)
    else console.log(JSON.stringify(info))
  }
}).then((res) => {
  console.log('UPLOAD_OK')
  console.log(JSON.stringify(res, null, 2))
}).catch((err) => {
  console.error('UPLOAD_FAILED')
  console.error(err && (err.stack || err.message) || err)
  process.exit(1)
})
