const fs = require('fs')
const path = require('path')
const vm = require('vm')
const required = ['project.config.json', 'game.json', 'game.js']
let ok = true
for (const file of required) {
  const p = path.join(__dirname, '..', file)
  if (!fs.existsSync(p)) {
    console.error(`missing ${file}`)
    ok = false
  }
}
for (const file of ['project.config.json', 'game.json', 'package.json']) {
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'))
}
new vm.Script(fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8'), { filename: 'game.js' })
console.log(ok ? 'CHECK_OK' : 'CHECK_FAILED')
process.exit(ok ? 0 : 1)
