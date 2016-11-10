'use strict'

const http = require('http')
const url = require('url')

const state = require('./state')

module.exports = (port, token) => {
  if (!token) {
    token = process.env.NOW_TOKEN
  }
  if (!port) {
    port = 80
  }

  state.set({ port: 3030 })
  state.start(token)

  const server = http.createServer((request, response) => {
    response.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=4000',
      'Expires': new Date(Date.now() + 4000).toUTCString()
    })

    var result = state.registry
    const pathname = url.parse(request.url).pathname

    if (pathname === '/logs') {
      result = state.log.serialize()
    } else if (pathname === '/deployments') {
      result = state.deployments.serialize()
    } else if (pathname !== '/') {
      const name = pathname.slice(1)
      result = result.filter(d => d.name === name)
    }

    return response.end(JSON.stringify(result))
  })

  server.listen(port)

  const close = server.close
  server.close = () => {
    state.stop()
    close.apply(server, arguments)
  }
  return server
}
