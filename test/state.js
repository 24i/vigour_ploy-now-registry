'use strict'

const test = require('tape')
const proxyquire = require('proxyquire')
const sinon = require('sinon')

const now = { api: () => {} }

test('list - generate', t => {
  const nowApi = sinon.stub(now, 'api')
  nowApi['@global'] = true
  const state = proxyquire('../lib/state', { '../now': nowApi })

  var cbs = {}
  var emitter = {
    on: (e, cb) => {
      cbs[e] = cb
      return emitter
    },
    once: (e, cb) => {
      cbs[e] = cb
      return emitter
    },
    send: () => {
      cbs['data']({ uid: 1, name: 's1', url: 'u1.sh', created: 11 })
      cbs['data']({ uid: 2, name: 's1', url: 'u2.sh', created: 12 })
      cbs['data']({ uid: 3, name: 's1', url: 'u3.sh', created: 13 })
      cbs['data']({ uid: 4, name: 's1', url: 'u4.sh', created: 21 })
      cbs['data']({ uid: 5, name: 's1', url: 'u5.sh', created: 22 })
      cbs['data']({ uid: 6, name: 's2', url: 'u6.sh', created: 11 })
      cbs['data']({ uid: 7, name: 's2', url: 'u7.sh', created: 21 })
      cbs['data']({ uid: 8, name: 's2', url: 'u8.sh', created: 22 })
      cbs['data']({ uid: 9, name: 's3', url: 'u9.sh', created: 11 })
      cbs['data']({ uid: 10, name: 's4', url: 'u10.sh', created: 11 })
      cbs['data']({ uid: 99, name: 's10', url: 'u99.sh', created: 11 })
      cbs['end']()
      return emitter
    }
  }

  nowApi
    .withArgs('deployments', 'API-TOKEN', 'deployments.*')
    .returns(emitter)

  state.start('API-TOKEN')

  /*
  getDeployments.returns(Promise.resolve([
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

  getPkg.withArgs(6).returns(Promise.resolve({ version: '1', _env: 'c=d' }))
  getPkg.withArgs(7).returns(Promise.resolve({ version: '2', _env: 'a=b' }))
  getPkg.withArgs(8).returns(Promise.resolve({ version: '2', _env: 'a=b&c=d' }))
  getPkg.withArgs(9).returns(Promise.resolve({ version: '1', _env: 'a=b&c=d' }))
  getPkg.withArgs(10).returns(Promise.resolve({ version: '1', _env: 'a=b&c=d' }))
  getPkg.withArgs(99).returns(Promise.resolve({}))

  list.get('API-TOKEN')
    .then(list => {
      t.deepEqual(list, [
        {name: 's1', version: '1', env: 'a=b', url: 'u3.sh', created: 13},
        {name: 's1', version: '1', env: 'a=c', url: 'u2.sh', created: 12},
        {name: 's1', version: '2', env: 'c=d', url: 'u4.sh', created: 21},
        {name: 's1', version: '2', env: 'a=b&c=d', url: 'u5.sh', created: 22},
        {name: 's2', version: '1', env: 'c=d', url: 'u6.sh', created: 11},
        {name: 's2', version: '2', env: 'a=b', url: 'u7.sh', created: 21},
        {name: 's2', version: '2', env: 'a=b&c=d', url: 'u8.sh', created: 22},
        {name: 's3', version: '1', env: 'a=b&c=d', url: 'u9.sh', created: 11},
        {name: 's4', version: '1', env: 'a=b&c=d', url: 'u10.sh', created: 11}
      ], 'list is as expected')
      t.end()

      now.getDeployments.restore()
      now.getPkg.restore()
    })
  */
})
