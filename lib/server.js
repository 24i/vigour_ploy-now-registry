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

  hub.set({
    deployments: {
      child: {
        labels: {
          on: {
            data (val, stamp) {
              if (!val) { return }
              const parsed = vstamp.parse(stamp)
              if (parsed.type === 'label') {
                slackbot.set({
                  out: {
                    [parsed.val]: {
                      to: '#publish',
                      text: `Deployed to ${this.keys().join(', ')}\nhttps://${this.parent.get('url').compute()}`
                    }
                  }
                })
              }
            }
          }
        }
      }
    }
  })

  return hub
}
