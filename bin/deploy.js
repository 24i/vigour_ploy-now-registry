'use strict'

const now = require('observe-now')

const command = require('../lib/command')
const pkg = require('../package.json')
const dir = process.cwd()
const timestamp = +(new Date())

command.run(`now -N -e NOW_TOKEN=${process.env.NOW_TOKEN} -e NODE_ENV="production"`, dir)
  .then(() => new Promise((resolve, reject) => {
    console.log('Deployed to now, discovering to alias...')

    now('deployments', process.env.NOW_TOKEN, 'deployments.*')
      .on('data', deployment => {
        if (deployment.name === pkg.name && deployment.created > timestamp) {
          resolve(deployment)
        }
      })
      .on('error', err => reject(err))
      .on('end', () => reject('Could not find own deployment'))
      .send()
  }))
  .then(found => {
    return command.run(`now alias set ${found.uid} ${process.env.REGISTRY_HOST}`, dir)
  })
  .catch(error => {
    console.error('Deployment failed due to error: %j, stack: %s', error, error ? error.stack : '(no stack)')
  })
