'use strict'

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

  return hub
}
