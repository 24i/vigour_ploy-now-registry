'use strict'

const http = require('http')

const list = require('./list')
const pkg = require('../package.json')

var deployments

module.exports = port => {
  if (!port) {
    port = 80
  }

  return http.createServer((request, response) => {
    response.writeHead(200, {'Content-Type': 'application/json'})
    response.end(JSON.stringify(deployments))
  }).listen(port)
}

function getList () {
  list.get(pkg._now_token)
    .then((list) => {
      deployments = list
    })
    .catch((error) => {
      console.error('Could not get the list due to error: %j, stack: %s', error, error ? error.stack : '(no stack)')
    })

  setTimeout(getList, 5000)
}

getList()
