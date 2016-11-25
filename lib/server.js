'use strict'

const Hub = require('brisky-hub')
const vstamp = require('vigour-stamp')
const hub = require('./hub')

module.exports = (port, token) => {
  if (!token) {
    token = process.env.NOW_TOKEN
  }
  if (!port) {
    port = 80
  }

  hub.set({ port })
  hub.start(token)

  const slackbot = new Hub({
    id: +new Date(),
    url: `wss://${process.env.SLACKBOT_HOST}`,
    context: false
  })

  hub.subscribe({ deployments: { $any: { val: true } } }, dep => {
    if (dep.get('labels')) {
      const parsed = vstamp.parse(dep.stamp)
      if (parsed.type === 'label') {
        dep = hub.get(['deployments', dep.key])
        const text = `Deployed to ${dep.get('labels').keys().join(', ')}` +
          `\nVersion: ${dep.get(['pkg', 'version']).compute()}, Env: ${dep.get(['pkg', 'env']).compute()}` +
          `\nhttps://${dep.get('url').compute()}`

        slackbot.set({
          out: { [parsed.val]: { to: '#publish', text } }
        })
      }
    }
  })

  process.on('uncaughtException', error => {
    slackbot.set({
      out: {
        [+new Date()]: {
          to: '#error',
          text: `Registry exception: ${error && error.message}\nStack:\`\`\`${error && error.stack}\`\`\``
        }
      }
    })

    setTimeout(() => {
      process.exit(1)
    }, 1e3)
  })

  hub.on('error', error => {
    if (!error) {
      return
    }

    var text = `Registry error: ${error.message}`

    if (error.apiPath) {
      text += `\nAPI Path: ${error.apiPath}`
    }

    if (error.stack) {
      text += `\nStack:\`\`\`${error.stack}\`\`\``
    }

    slackbot.set({
      out: { [+new Date()]: { to: '#error', text } }
    })
  })

  return hub
}
