'use strict'

const http = require('http')
const url = require('url')
const path = require('path')

const list = require('./list')
const pkg = require('../package.json')

var deployments = []

module.exports = port => {
  if (!port) {
    port = 80
  }

  return http.createServer((request, response) => {
    response.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=5000',
      'Expires': new Date(Date.now() + 5000).toUTCString()
    })

    var result = deployments
    const pathname = url.parse(request.url).pathname

    if (pathname !== '/') {
      const name = path.parse(pathname).base
      result = result.filter(d => d.name === name)
    }

    return response.end(JSON.stringify(result))
  }).listen(port)
}

function getList () {
  list.get(pkg._now_token)
    .then((list) => {
      deployments = list

      setTimeout(getList, 5000)
    })
    .catch((error) => {
      console.error('Could not get the list due to error: %j, stack: %s', error, error ? error.stack : '(no stack)')

      setTimeout(getList, 5000)
    })
}

getList()
