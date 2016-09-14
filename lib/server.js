'use strict'

const http = require('http')
const url = require('url')

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
      const name = pathname.slice(1)
      result = list.filter(d => d.name === name)
    }

    return response.end(JSON.stringify(result))
  })

  server.listen(port)

  state.subscribe({ registry: { val: true } }, (val, type) => {
    if (type === 'update') {
      var newList = []
      val.each(d => {
        newList.push(d.serialize())
      })
      list = newList
    }
  })

  const close = server.close
  server.close = () => {
    state.stop()
    close.apply(server, arguments)
  }
  return server
}
