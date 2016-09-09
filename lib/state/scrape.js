'use strict'
const api = require('../now')
const vstamp = require('vigour-stamp')
const is = require('vigour-is')

const sort = {
  val: 'created',
  exec (a, b) {
    return a > b ? -1 : a < b ? 1 : 0
  }
}

exports.properties = {
  token: true,
  rescrapeTimer: true
}

exports.on = {
  remove () {
    clearTimeout(this.timeout)
  }
}

exports.progress = {
  type: 'observable',
  inject: is,
  child: {
    properties: {
      request (val) {
        this.clear()
        this.request = val
        this.timeout = setTimeout(() => {
          this.request.emit('error', new Error('Took more than 5 seconds'))
          this.remove()
        }, 5e3)
        this.request.on('end', this.remove.bind(this))
      },
      timeout: true
    },
    define: {
      clear () {
        if (this.timeout) {
          clearTimeout(this.timeout)
        }
        if (this.request) {
          this.request.abort()
        }
      }
    },
    on: {
      remove () {
        this.clear()
      }
    }
  }
}

exports.define = {
  inProgess () {
    return this.progress.keys().length > 0
  },
  start (token) {
    if (!this.inProgess() || this.token !== token) {
      if (this.inProgess()) {
        this.progress.reset()
      }
      this.token = token
      this.progress.set({ deployments: { request: getDeployments(this) } })
    }
  },
  stop () {
    this.stopped = true
    this.progress.reset()
    if (this.rescrapeTimer) {
      clearTimeout(this.rescrapeTimer)
    }
    setTimeout(() => {
      delete this.stopped
    }, 1000)
  }
}

exports.deployments = {
  sort,
  child: {
    id: {
      on: {
        data () {
          const id = this.compute()
          const deployment = this.parent
          const key = deployment.path().join('.')

          if (!deployment.pkg || !deployment.pkg.compute()) {
            getLinks(deployment, id, key)
          }
        }
      }
    }
  }
}

function getDeployments (state) {
  var idList = []
  console.log('here i start')
  return api('deployments', state.token, 'deployments.*')
    .on('data', deployment => {
      deployment.id = deployment.uid
      delete deployment.uid

      idList.push(deployment.id)
      const stamp = vstamp.create('deployment')
      if (!state.deployments[deployment.id]) {
        state.deployments.set({ [deployment.id]: deployment }, stamp)
      }
      vstamp.close(stamp)
    })
    .on('error', err => {
      console.log('error!')
      if (state.progress.deployments) {
        state.progress.deployments.remove()
      }
      state.emit('error', Object.assign(err, { apiPath: 'deployments' }))
      rescrape(state)
    })
    .on('end', () => {
      console.log('found deployments', idList.length)
      console.log('existing deployments', state.deployments.keys().length)
      /*
      state.deployments.keys().forEach(id => {
        if (idList.indexOf(id) === -1) {
          state.deployments[id].remove()
        }
      })
      */
      rescrape(state)
    })
}

function getLinks (deployment, id, key) {
  const root = deployment.root

  var hasPackage = false
  root.progress.set({
    [key]: {
      request: api(`deployments/${id}/links`, root.token, 'files.*')
        .on('data', file => {
          if (file.file === 'package.json') {
            hasPackage = true
            getPkg(deployment, file.sha, key)
          }
        })
        .on('error', err => {
          root.emit('error', Object.assign(err, {
            apiPath: `deployments/${id}/links`
          }))
          console.log('will retry links', id)
          setTimeout(getLinks, 2e3, deployment, id, key)
        })
        .on('end', () => {
          if (!hasPackage) {
            root.emit('error', new Error(`Deployment without package.json ${id}`))
            deployment.set({pkg: {}})
          }
        })
    }
  })
}

function getPkg (deployment, id, key) {
  const root = deployment.root

  root.progress.set({[key]: {
    request: api(`deployments/${deployment.id.compute()}/files/${id}`, root.token)
      .on('data', pkg => {
        deployment.set({
          pkg: {
            version: pkg.version,
            env: pkg._env,
            routes: pkg._routes
          }
        })
      })
      .on('error', err => {
        if (!deployment.id) {
          console.log('no deployment id', deployment.id)
          return
        }
        root.emit('error', Object.assign(err, {
          apiPath: `deployments/${deployment.id.compute()}/files/${id}`
        }))
        console.log('will retry pkg', id)
        setTimeout(getPkg, 1e3, deployment, id, key)
      })
  }})
}

function rescrape (state) {
  if (state.progress.deployments && state.progress.deployments.val !== null) {
    state.progress.deployments.remove()
  }
  state.progress.is(() => {
    return state.progress.keys().length < 2
  }, () => {
    if (!state.stopped) {
      state.timeout = setTimeout(
        () => !state.stopped && state.progress.set({ deployments: { request: getDeployments(state) } }),
        3e3
      )
    }
  })
}
