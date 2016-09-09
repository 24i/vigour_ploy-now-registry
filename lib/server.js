'use strict'

const http = require('http')
const url = require('url')
const path = require('path')

const state = require('./state')
const pkg = require('../package.json')

module.exports = (port, token) => {
  if (!token) {
    token = process.env.NOW_TOKEN
  }
  if (!port) {
    port = 80
  }

  state.start(token)

  const server = http.createServer((request, response) => {
    response.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${pkg.interval}`,
      'Expires': new Date(Date.now() + pkg.interval).toUTCString()
    })

    var result
    const pathname = url.parse(request.url).pathname

    if (pathname === '/') {
      result = state.deployments.serialize()
    } else {
      const name = path.parse(pathname).base
      result = state.deployments.serialize()
    }

    return response.end(JSON.stringify(result))
  })

  state.progress.is(() => {
    return state.progress.keys().length < 2
  }, () => {
    server.listen(port)
  })

  const close = server.close
  server.close = () => {
    state.stop()
    close.apply(server, arguments)
  }
  return server
}
