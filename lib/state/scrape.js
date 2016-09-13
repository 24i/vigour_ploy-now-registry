'use strict'
const api = require('../now')
const vstamp = require('vigour-stamp')

const sort = {
  val: 'created',
  exec (a, b) {
    return a > b ? -1 : a < b ? 1 : 0
  }
}

exports.properties = {
  token: true,
  started: true,
  timeout: true
}

exports.on = {
  remove () {
    clearTimeout(this.timeout)
  }
}

var runningList = new Set()

exports.progress = {
  type: 'observable',
  child: {
    properties: {
      request (val) {
        this.clear()
        this.request = val
        this.finished = false
      },
      timeout: true,
      finished: true
    },
    define: {
      start () {
        runningList.add(this.key)

        if (this.timeout) {
          clearTimeout(this.timeout)
        }
        this.timeout = setTimeout(() => {
          this.request.emit('error', new Error('Took more than 3 seconds'))
        }, 3e3)

        this.request.end()
        this.request.once('end', () => {
          if (runningList.has(this.key)) {
            this.remove()
          }
        })
      },
      clear () {
        if (this.timeout) {
          clearTimeout(this.timeout)
        }

        if (!runningList.has(this.key)) {
          return
        }

        runningList.delete(this.key)
        this.finished = true

        if (this.request) {
          this.request.abort()
        }

        if (this.root && this.root.started) {
          runProgress(this.root)
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
        runningList.clear()
        clearTimeout(this.timeout)
      }
      this.token = token
      this.started = true
      this.progress.set({ deployments: { request: getDeployments(this) } })
      runProgress(this)
    }
  },
  stop () {
    this.started = false
    this.progress.reset()
  }
}

exports.deployments = {
  sort,
  child: {
    id: {
      on: {
        data () {
            getLinks(this.parent)
        }
      }
    },
    pkgId: {
      on: {
        data () {
          getPkg(this.parent)
        }
      }
    }
  }
}

exports.registry = {
  sort
}

function runProgress (state) {
  state.progress.each(progress => {
    if (runningList.has(progress.key) || progress.finished) {
      return
    }

    if (runningList.size >= 40) {
      return true
    }

    progress.start()
  })

  if (runningList.size === 0 && state.started) {
    calculateRegistry(state)
    state.timeout = setTimeout(() => {
      state.progress.set({ deployments: { request: getDeployments(state) } })
      runProgress(state)
    }, 3e3)
  }
}

function calculateRegistry (state) {
  const stamp = vstamp.create('calculate')
  state.registry.reset(stamp)
  state.deployments.each((d) => {
    if (!d.pkg || !d.pkg.version) {
      return
    }

    const key = [
      ('' + d.name.compute()).replace(/\./g, '-'),
      ('' + d.pkg.version.compute()).replace(/\./g, '-'),
      ('' + d.pkg.env.compute()).replace(/\./g, '-')
    ].join('@')
    const lastDeployment = state.registry.get(key, {})

    if (!lastDeployment.created) {
      lastDeployment.set({
        name: d.name.compute(),
        version: d.pkg.version.compute(),
        env: d.pkg.env.compute(),
        url: d.url.compute(),
        created: d.created.compute()
      }, stamp)
    } else if (lastDeployment.created < d.created) {
      lastDeployment.set({
        url: d.url.compute(),
        created: d.created.compute()
      }, stamp)
    }
  })
  vstamp.close()
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
        if (!pkg.version) {
          return
        }
        deployment.set({
          pkg: {
            version: pkg.version,
            env: pkg._env || '',
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
