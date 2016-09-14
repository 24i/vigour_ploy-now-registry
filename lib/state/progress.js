'use strict'

const vstamp = require('vigour-stamp')
const now = require('./now')

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

        this.request.send()
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
      this.progress.set({ deployments: { request: now.getDeployments(this) } })
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
        data () { now.getLinks(this.parent) }
      }
    },
    pkgId: {
      on: {
        data () { now.getPkg(this.parent) }
      }
    }
  }
}

exports.registry = { sort }

function runProgress (state) {
  state.progress.each(progress => {
    if (runningList.has(progress.key) || progress.finished) {
      return
    }

    if (runningList.size >= 10) {
      return true
    }

    progress.start()
  })

  if (runningList.size === 0 && state.started) {
    calculateRegistry(state)
    state.timeout = setTimeout(() => {
      state.progress.set({ deployments: { request: now.getDeployments(state) } })
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
    const lastDeployment = state.registry.get(key, {}, stamp)

    if (!lastDeployment.created) {
      lastDeployment.set({
        name: d.name.compute(),
        version: d.pkg.version.compute(),
        env: d.pkg.env.compute(),
        url: d.url.compute(),
        created: d.created.compute()
      }, stamp)
    }
  })
  vstamp.close(stamp)
}
