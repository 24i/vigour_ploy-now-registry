'use strict'

const now = require('observe-now')

const registry = now.deployment(process.env.NOW_TOKEN)
  .deploy(process.cwd(), {
    NOW_TOKEN: process.env.NOW_TOKEN,
    AMAZON_ID: process.env.AMAZON_ID,
    AMAZON_SECRET: process.env.AMAZON_SECRET,
    SLACKBOT_HOST: process.env.SLACKBOT_HOST
  })
  .on('deployed', () => {
    console.log(registry.id.compute(), registry.url.compute())
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
