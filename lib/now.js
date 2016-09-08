'use strict'
const https = require('https')
const EventEmitter = require('events')
const JSONStream = require('JSONStream')

module.exports = (path, token, pattern) => {
  const emitter = new EventEmitter()
  const req = https.request({
    hostname: 'api.zeit.co',
    path: `/now/${path}`,
    port: 443,
    method: 'GET',
    headers: {
      'Authorization': `Bearer: ${token}`
    }
  })
  req.on('response', res => {
    stick(res, emitter, 'error')
    stick(res, emitter, 'end')

    const parser = res.pipe(JSONStream.parse(pattern))
    stick(parser, emitter, 'data')
    stick(parser, emitter, 'error')
  })
  req.end()
  stick(req, emitter, 'error')
  emitter.abort = req.abort.bind(req)
  return emitter
}

function stick (source, target, event) {
  source.on(event, target.emit.bind(target, event))
}
