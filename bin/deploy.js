'use strict'

const path = require('path')
const fs = require('fs')

const command = require('../lib/command')
const now = require('../lib/now')

const dir = process.cwd()

var pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json')))
pkg._now_token = process.env.NOW_TOKEN
fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2))

now.setToken(process.env.NOW_TOKEN)

command.run('now', dir)
  .then(() => now.getDeployments())
  .then(deployments => {
    const found = deployments.filter(d => d.name === pkg.name)
      .sort((d1, d2) => d1.created - d2.created)
      .pop()

    if (!found) {
      throw new Error('Could not find own deployment')
    }

    return command.run(`now alias set ${found.uid} ${process.env.REGISTRY_HOST}`, dir)
  })
  .catch(error => {
    console.error('Deployment failed due to error: %j, stack: %s', error, error ? error.stack : '(no stack)')
  })
