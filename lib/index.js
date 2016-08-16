'use strict'

const http = require('http')

const now = require('./now')

var list = []

http.createServer((request, response) => {
  response.writeHead(200, {'Content-Type': 'application/json'})
  response.write(JSON.stringify(list))
  response.end()
}).listen(8080)

function getList () {
  now.getDeployments()
    .then((deployments) => {

    })
    .catch((error) => {

    })

  setTimeout(getList, 5000)
}

getList()
