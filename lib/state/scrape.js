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

exports.progress = {
  type: 'observable',
  inject: is,
  child: {
    properties: {
      request (val) {
        this.clear()
        this.request = val
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

function runProgress (state) {
  var chunk = 0
  state.progress.each(progress => {
    if (progress.timeout || !progress.request) {
      return false
    }

    if (++chunk >= 5) {
      return true
    }

    progress.timeout = setTimeout(() => {
      progress.request.emit('error', new Error('Took more than 5 seconds'))
      progress.remove()
    }, 5e3)
    progress.request.end()
  })

  if (state.runTimer) {
    clearTimeout(state.runTimer)
  }
  state.runTimer = setTimeout(runProgress, 200, state)
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
      runProgress(this)
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

function getLinks (deployment) {
  const root = deployment.root
  const key = deployment.path().join('.')
  const did = deployment.id.compute()

  var hasPackage = false
  root.progress.set({
    [key]: {
      request: api(`deployments/${did}/links`, root.token, 'files.*')
        .on('data', file => {
          if (file.file === 'package.json') {
            hasPackage = true
            deployment.set({ pkgId: file.sha })
            setTimeout(getPkg, 1e3, deployment)
          }
        })
        .on('error', err => {
          root.emit('error', Object.assign(err, {
            apiPath: `deployments/${did}/links`
          }))
          deployment.set({linkRetry: (+deployment.linkRetry || 0) + 1})
          setTimeout(getLinks, 3e3, deployment)
        })
        .on('end', () => {
          if (!hasPackage) {
            root.emit('error', new Error(`Deployment without package.json ${did}`))
            deployment.set({ pkg: true })
          }
        })
    }
  })
}

function getPkg (deployment) {
  const root = deployment.root
  const key = deployment.path().join('.')
  const did = deployment.id.compute()
  const fid = deployment.pkgId.compute()

  root.progress.set({[key]: {
    request: api(`deployments/${did}/files/${fid}`, root.token)
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
          return
        }
        root.emit('error', Object.assign(err, {
          apiPath: `deployments/${did}/files/${fid}`
        }))
        deployment.set({pkgRetry: (+deployment.pkgRetry || 0) + 1})
        setTimeout(getPkg, 3e3, deployment)
      })
      .on('end', () => {
        root.progress[key].remove()
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
      state.rescrapeTimer = setTimeout(
        () => !state.stopped && state.progress.set({ deployments: { request: getDeployments(state) } }),
        2e3
      )
    }
  })
}
