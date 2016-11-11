'use strict'

const now = require('observe-now')

const registry = now.deploy(process.cwd(), {
  NOW_TOKEN: process.env.NOW_TOKEN,
  AMAZON_ID: process.env.AMAZON_ID,
  AMAZON_SECRET: process.env.AMAZON_SECRET
}, process.env.NOW_TOKEN)
  .on('deployed', () => {
    console.log('Deployed to now, waiting until ready...')
  })
  .on('ready', () => {
    console.log('Deployment ready, aliasing...')
    registry.alias(process.env.REGISTRY_HOST)
  })
  .on('aliased', () => {
    console.log('Alias successful!')
  })
  .on('error', error => {
    console.error('Deployment failed due to error: %j, stack: %s', error, error ? error.stack : '(no stack)')
  })
  .deploy()
