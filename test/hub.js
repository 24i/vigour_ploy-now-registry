'use strict'

const test = require('tape')
const sinon = require('sinon')
const proxyquire = require('proxyquire')
const now = require('observe-now')

test('list - generate', t => {
  t.plan(1)

  const hub = proxyquire('../lib/hub', {
    'blend-state-dynamo': {
      '@noCallThru': true,
      properties: {
        db: {
          define: {
            load: () => {
              hub.set({
                deployments: {
                  8: { id: 8, name: 's2' }
                }
              })
              return Promise.resolve()
            }
          }
        }
      }
    }
  })
  const nowApi = sinon.stub(now, 'get')

  nowApi
    .withArgs('list', 'API-TOKEN', 'deployments.*')
    .returns(generateEmitter([
      { uid: 1, name: 's1', url: 'u1.sh', created: 11 }, // v1
      { uid: 2, name: 's1', url: 'u2.sh', created: 12 }, // v1
      { uid: 3, name: 's1', url: 'u3.sh', created: 13 }, // v1
      { uid: 4, name: 's1', url: 'u4.sh', created: 21 }, // v2
      { uid: 5, name: 's1', url: 'u5.sh', created: 22 }, // v2
      { uid: 6, name: 's2', url: 'u6.sh', created: 11 }, // v1
      { uid: 7, name: 's2', url: 'u7.sh', created: 21 }, // v2
      { uid: 8, name: 's2', url: 'u8.sh', created: 22 }, // v2
      { uid: 9, name: 's3', url: 'u9.sh', created: 11 }, // v1
      { uid: 10, name: 's4', url: 'u10.sh', created: 11 }, // v1
      { uid: 99, name: 's10', url: 'u99.sh', created: 11 } // no v
    ]))

  nowApi
    .withArgs('deployments/1/links', 'API-TOKEN', 'files.*')
    .returns(generateEmitter([ { file: 'package.json', sha: 1 } ]))
  nowApi
    .withArgs('deployments/1/files/1', 'API-TOKEN', false)
    .returns(generateEmitter([ { version: '1', _env: 'a=b' } ]))

  nowApi
    .withArgs('deployments/2/links', 'API-TOKEN', 'files.*')
    .returns(generateEmitter([ { file: 'package.json', sha: 2 } ]))
  nowApi
    .withArgs('deployments/2/files/2', 'API-TOKEN', false)
    .returns(generateEmitter([ { version: '1', _env: 'a=c' } ]))

  nowApi
    .withArgs('deployments/3/links', 'API-TOKEN', 'files.*')
    .returns(generateEmitter([ { file: 'package.json', sha: 3 } ]))
  nowApi
    .withArgs('deployments/3/files/3', 'API-TOKEN', false)
    .returns(generateEmitter([ { version: '1', _env: 'a=b' } ]))

  nowApi
    .withArgs('deployments/4/links', 'API-TOKEN', 'files.*')
    .returns(generateEmitter([ { file: 'package.json', sha: 4 } ]))
  nowApi
    .withArgs('deployments/4/files/4', 'API-TOKEN', false)
    .returns(generateEmitter([ { version: '2', _env: 'c=d' } ]))

  nowApi
    .withArgs('deployments/5/links', 'API-TOKEN', 'files.*')
    .returns(generateEmitter([ { file: 'package.json', sha: 5 } ]))
  nowApi
    .withArgs('deployments/5/files/5', 'API-TOKEN', false)
    .returns(generateEmitter([ { version: '2', _env: 'a=b&c=d' } ]))

  nowApi
    .withArgs('deployments/6/links', 'API-TOKEN', 'files.*')
    .returns(generateEmitter([ { file: 'package.json', sha: 6 } ]))
  nowApi
    .withArgs('deployments/6/files/6', 'API-TOKEN', false)
    .returns(generateEmitter([ { version: '1', _env: 'c=d' } ]))

  nowApi
    .withArgs('deployments/7/links', 'API-TOKEN', 'files.*')
    .returns(generateEmitter([ { file: 'package.json', sha: 7 } ]))
  nowApi
    .withArgs('deployments/7/files/7', 'API-TOKEN', false)
    .returns(generateEmitter([ { version: '2', _env: 'a=b' } ]))

  nowApi
    .withArgs('deployments/8/links', 'API-TOKEN', 'files.*')
    .returns(generateEmitter([ { file: 'package.json', sha: 8 } ]))
  nowApi
    .withArgs('deployments/8/files/8', 'API-TOKEN', false)
    .returns(generateEmitter([ { version: '2', _env: 'a=b&c=d' } ]))

  nowApi
    .withArgs('deployments/9/links', 'API-TOKEN', 'files.*')
    .returns(generateEmitter([ { file: 'package.json', sha: 9 } ]))
  nowApi
    .withArgs('deployments/9/files/9', 'API-TOKEN', false)
    .returns(generateEmitter([ { version: '1', _env: 'a=b&c=d' } ]))

  nowApi
    .withArgs('deployments/10/links', 'API-TOKEN', 'files.*')
    .returns(generateEmitter([ { file: 'package.json', sha: 10 } ]))
  nowApi
    .withArgs('deployments/10/files/10', 'API-TOKEN', false)
    .returns(generateEmitter([ { version: '1', _env: 'a=b&c=d' } ]))

  nowApi
    .withArgs('deployments/99/links', 'API-TOKEN', 'files.*')
    .returns(generateEmitter([ { file: 'package.json', sha: 99 } ]))
  nowApi
    .withArgs('deployments/99/files/99', 'API-TOKEN', false)
    .returns(generateEmitter(null, new Error('Invalid JSON')))

  hub.start('API-TOKEN')

  hub.on('refresh', () => {
    t.deepEqual(hub.deployments.serialize(), {
      1: { id: '1', name: 's1', url: 'u1.sh', created: 11, pkg: { version: '1', env: 'a=b', routes: {}, wrapper: {} } },
      2: { id: '2', name: 's1', url: 'u2.sh', created: 12, pkg: { version: '1', env: 'a=c', routes: {}, wrapper: {} } },
      3: { id: '3', name: 's1', url: 'u3.sh', created: 13, pkg: { version: '1', env: 'a=b', routes: {}, wrapper: {} } },
      4: { id: '4', name: 's1', url: 'u4.sh', created: 21, pkg: { version: '2', env: 'c=d', routes: {}, wrapper: {} } },
      5: { id: '5', name: 's1', url: 'u5.sh', created: 22, pkg: { version: '2', env: 'a=b&c=d', routes: {}, wrapper: {} } },
      6: { id: '6', name: 's2', url: 'u6.sh', created: 11, pkg: { version: '1', env: 'c=d', routes: {}, wrapper: {} } },
      7: { id: '7', name: 's2', url: 'u7.sh', created: 21, pkg: { version: '2', env: 'a=b', routes: {}, wrapper: {} } },
      8: { id: '8', name: 's2', url: 'u8.sh', created: 22, pkg: { version: '2', env: 'a=b&c=d', routes: {}, wrapper: {} } },
      9: { id: '9', name: 's3', url: 'u9.sh', created: 11, pkg: { version: '1', env: 'a=b&c=d', routes: {}, wrapper: {} } },
      10: { id: '10', name: 's4', url: 'u10.sh', created: 11, pkg: { version: '1', env: 'a=b&c=d', routes: {}, wrapper: {} } },
      99: { id: '99', name: 's10', url: 'u99.sh', created: 11, pkg: {} }
    }, 'registry is as expected')
    hub.stop()
    nowApi.restore()
  })
})

function generateEmitter (data, error) {
  var cbs = {}

  return {
    on (e, cb) {
      cbs[e] = cb
      return this
    },
    once (e, cb) {
      cbs[e] = cb
      return this
    },
    send () {
      setImmediate(() => {
        if (data) {
          data.forEach(d => cbs['data'](d))
        }
        if (error && cbs.error) {
          cbs.error(error)
        }
        if (cbs.end) {
          cbs.end()
        }
      })
      return this
    },
    abort () {
      cbs = {}
    },
    remove () {

    }
  }
}
