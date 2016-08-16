'use strict'

const http = require('http')

const list = require('./list')

var deployments

http.createServer((request, response) => {
  response.writeHead(200, {'Content-Type': 'application/json'})
  response.write(JSON.stringify(deployments))
  response.end()
}).listen(8080)

function getList () {
  list.get()
    .then((list) => {
      deployments = list
    })
    .catch((error) => {
      console.error('Could not get the list due to error: %j, stack: %s', error, error ? error.stack : '(no stack)')
    })

  setTimeout(getList, 5000)
}

getList()
