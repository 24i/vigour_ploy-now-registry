'use strict'

const command = require('../lib/command')
const now = require('../lib/now')

const pkg = require('../package.json')
const dir = process.cwd()

now.setToken(process.env.NOW_TOKEN)

command.run(`now -e NOW_TOKEN=${process.env.NOW_TOKEN}`, dir)
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
