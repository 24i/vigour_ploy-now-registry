'use strict'

const path = require('path')
const fs = require('fs')

const dir = process.cwd()
var pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json')))
pkg._now_token = process.env.NOW_TOKEN
fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
