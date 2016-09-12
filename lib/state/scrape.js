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
  rescrapeTimer: true,
  runTimer: true
}

exports.on = {
  remove () {
    clearTimeout(this.timeout)
  }
}

var runningList = new Set()

exports.progress = {
  type: 'observable',
  inject: is,
  child: {
    properties: {
      request (val) {
        this.finish()
        this.request = val
        this.set({finished: false})
      },
      timeout: true,
      finished: true
    },
    define: {
      start () {
        console.log('starting', this.key)
        runningList.add(this.key)

        if (this.timeout) {
          clearTimeout(this.timeout)
        }
        this.timeout = setTimeout(() => {
          this.request.emit('error', new Error('Took more than 3 seconds'))
        }, 3e3)

        this.request.end()
        this.request.once('end', () => this.finish())
      },
      finish () {
        if (this.timeout) {
          clearTimeout(this.timeout)
        }

        if (!runningList.has(this.key)) {
          return
        }

        this.set({finished: true})
        this.timeout = setTimeout(() => {
          this.remove()
        }, 3e3)

        this.request.abort()

        runningList.delete(this.key)
        if (this.root.runProgress) {
          this.root.runProgress()
        }
      }
    },
    on: {
      remove () {
        if (this.timeout) {
          clearTimeout(this.timeout)
        }
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
      this.runProgress()
    }
  },
  runProgress () {
    this.progress.each(progress => {
      if (runningList.has(progress.key) || progress.finished) {
        return
      }

      if (runningList.size >= 20) {
        return true
      }

      progress.start()
    })

    if (runningList.size === 0) {
      this.progress.set({ deployments: { request: getDeployments(this) } })
      this.runProgress()
    }
  },
  stop () {
    this.stopped = true
    this.progress.reset()
    if (this.rescrapeTimer) {
      clearTimeout(this.rescrapeTimer)
    }
    if (this.runTimer) {
      clearTimeout(this.runTimer)
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
          const deployment = this.parent

          if (!deployment.pkgId) {
            getLinks(deployment)
          } else if (!deployment.pkg) {
            getPkg(deployment)
          }
        }
      }
    }
  }
}

function getDeployments (state) {
  var idList = []
  var error = false

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
      if (error) {
        return
      }
      error = true
      state.emit('error', Object.assign(err, { apiPath: 'deployments' }))
    })
    .on('end', () => {
      state.deployments.keys().forEach(id => {
        if (idList.indexOf(id) === -1) {
          state.deployments[id].remove()
        }
      })
    })
}

function getLinks (deployment) {
  const root = deployment.root
  const key = deployment.path().join('.')
  const did = deployment.id.compute()
  var error = false

  const stamp = vstamp.create('links')
  var hasPackage = false
  root.progress.set({
    [key]: {
      request: api(`deployments/${did}/links`, root.token, 'files.*')
        .on('data', file => {
          if (file.file === 'package.json') {
            hasPackage = true
            deployment.set({ pkgId: file.sha }, stamp)
            getPkg(deployment)
          }
        })
        .on('error', err => {
          if (deployment.pkgId || error) {
            return
          }
          error = true
          root.emit('error', Object.assign(err, {
            apiPath: `deployments/${did}/links`
          }))
          deployment.set({linkRetry: (+deployment.linkRetry || 0) + 1})
          getLinks(deployment)
        })
        .once('end', () => {
          if (!hasPackage) {
            root.emit('error', new Error(`Deployment without package.json ${did}`))
            deployment.set({ pkg: {} })
          }
        })
    }
  }, stamp)
  vstamp.close()
}

function getPkg (deployment) {
  const root = deployment.root
  const key = deployment.path().join('.')
  const did = deployment.id.compute()
  const fid = deployment.pkgId.compute()
  var error = false

  const stamp = vstamp.create('pkg')
  root.progress.set({[key]: {
    request: api(`deployments/${did}/files/${fid}`, root.token, false)
      .on('data', pkg => {
        deployment.set({
          pkg: {
            version: pkg.version,
            env: pkg._env,
            routes: pkg._routes
          }
        }, stamp)
      })
      .on('error', err => {
        if (!deployment.id || error) {
          return
        }
        error = true
        root.emit('error', Object.assign(err, {
          apiPath: `deployments/${did}/files/${fid}`
        }))
        deployment.set({pkgRetry: (+deployment.pkgRetry || 0) + 1})
        if (/JSON/.test(err.message)) {
          deployment.set({ pkg: {} }, stamp)
          root.progress[key].remove()
        } else {
          getPkg(deployment)
        }
      })
  }}, stamp)
  vstamp.close()
}
