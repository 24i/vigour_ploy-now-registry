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
  var start = +new Date()
  var list = []

  const server = http.createServer((request, response) => {
    response.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${pkg.interval}`,
      'Expires': new Date(Date.now() + pkg.interval).toUTCString()
    })

    var result = list
    const pathname = url.parse(request.url).pathname

    if (pathname !== '/') {
      const name = path.parse(pathname).base
      result = list.filter(d => d.name === name)
    } else {
      result = state.registry.serialize()
    }

    return response.end(JSON.stringify(result))
  })

  server.running = false

  state.subscribe({ registry: { val: true} }, (val, type) => {
    var newList = []
    state.registry.each(d => {
      newList.push(d.serialize())
    })
    list = newList
    if (type === 'update' && !server.running) {
      server.running = true
      console.log('list is ready!', ~~((+new Date() - start) / 1000))
      server.listen(port)
    }
  })

  const close = server.close
  server.close = () => {
    state.stop()
    close.apply(server, arguments)
  }
  return server
}
