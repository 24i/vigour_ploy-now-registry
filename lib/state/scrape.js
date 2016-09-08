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
  timeout: true
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
          this.remove()
        }, 5e3)
      },
      timeout: true
    },
    define: {
      clear () {
        clearTimeout(this._progress)
        if (this.timeout) { clearTimeout(this.timeout) }
        if (this.request) { this.request.abort() }
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
      this.progress.set({ deployments: { request: deployments(this) } })
    }
  },
  stop () {
    this.stopped = true
    this.progress.reset()
    clearTimeout(this.timeout)
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
          const root = this.root
          const id = this.compute()
          const key = this.parent.path().join('.')
          var found
          if (this.parent._progress) {
            clearTimeout(this.parent._progress)
          }
          // clean this up
          this.parent._progress = setTimeout(() => {
            root.progress.set({
              [key]: {
                request: api(
                  `deployments/${id}/links`, // private api, lot faster the files
                  root.token,
                  'files.*'
                )
                  .on('data', val => {
                    if (val.file === 'package.json') {
                      found = true
                      root.progress.set({ [key]: { request: pkg(this.parent, val.sha, key) } })
                    }
                  })
                  .on('error', err => {
                    err.method = 'links'
                    err.id = id
                    err.api = `deployments/${id}/links`
                    err.path = this.parent.path().join('/')
                    err.name = this.parent.key
                    err.url = this.parent.url.compute()
                    err.created = this.parent.compute()
                    root.emit('error', err)
                    // clean this up
                    clearTimeout(this.parent._progress)
                    this.parent._progress = setTimeout(() => this.emit('data'), 2e3)
                  })
                  .on('end', () => {
                    if (!found) {
                      root.emit('error', { message: 'complete! but no pkg???' })
                    }
                  })
              }
            })
          }, 500)
        }
      }
    },
    previous: { sort }
  }
}

function pkg (state, uid, key) {
  return api(
    `deployments/${state.id.compute()}/files/${uid}`,
    state.root.token
  )
    .on('data', val => {
      state.set({
        pkg: {
          routes: val._routes,
          env: val._env,
          version: val.version
        }
      })

      if (!val._routes && (!state.pkg.retry || state.pkg.retry.compute() < 5)) {
        state.pkg.set({ retry: (state.pkg.retry ? state.pkg.retry.compute() : 0) + 1 })
        clearTimeout(state._progress)
        state._progress = setTimeout(() => { state.id.emit('data') }, 5e3)
      }

      if (state.root.progress[key]) {
        state.root.progress[key].remove()
      }
    })
    .on('error', err => {
      err.method = 'package'
      err.id = state.id.compute()
      err.api = `deployments/${state.id.compute()}/files/${uid}`
      err.path = state.path().join('/')
      err.name = state.key
      err.url = state.url.compute()
      err.created = state.created.compute()
      state.root.emit('error', err)
      clearTimeout(state._progress)
      state._progress = setTimeout(() => { state.id.emit('data') }, 2e3)
    })
}

function deployments (state) {
  return api(
    'deployments',
    state.token,
    'deployments.*'
  )
    .on('data', val => {
      const stamp = vstamp.create('deployment')
      val = {
        name: val.name,
        created: Number(val.created),
        url: val.url,
        id: val.uid
      }
      const deployment = state.get([ 'deployments', val.name ], {})
      if (deployment.get('created', 0).compute() < val.created) {
        if (deployment.created.compute() > 0) {
          deployment.set({
            previous: {
              [deployment.id.compute()]: {
                id: deployment.id.compute(),
                created: deployment.created.compute(),
                url: deployment.url.compute(),
                name: deployment.name.compute(),
                pkg: deployment.pkg ? deployment.pkg.serialize() : false
              }
            }
          }, stamp)
        }
        state.deployments.set({ [val.name]: val }, stamp)
      } else {
        deployment.set({ previous: { [val.id]: val } }, stamp)
      }
      vstamp.close(stamp)
    })
    .on('error', err => {
      if (state.progress.deployments) {
        state.progress.deployments.remove()
      }
      err.api = err.method = 'deployments'
      state.emit('error', err)
      rescrape(state)
    })
    .on('end', () => { rescrape(state) })
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
        () => !state.stopped && state.progress.set({ deployments: { request: deployments(state) } }),
        1000
      )
    }
  })
}
