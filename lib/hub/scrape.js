'use strict'

const now = require('observe-now')
const concurrent = require('concurrent-task')
const vstamp = require('vigour-stamp')

exports.properties = {
  token: true,
  started: true,
  timeout: true
}

exports.define = {
  start (token) {
    const root = this
    root.token = token
    root.stop()
    root.set({
      db: {
        id: process.env.AMAZON_ID,
        secret: process.env.AMAZON_SECRET,
        table: root.id
      }
    })
    root.db.load('false')
      .then(() => {
        this.fixDataIntegrity()
        root.started = true
        root.getDeployments()
      })
      .catch(this.emit.bind(this, 'error'))
  },
  stop () {
    this.started = false
    clearTimeout(this.timeout)
  },
  fixDataIntegrity () {
    const stamp = vstamp.create('integrity')
    const keys = this.get('deployments').keys()

    this.emit('info', `Deployments loaded: ${keys.length}`)

    const toRemove = keys
      .filter(key => {
        var rem = false
        ;[ 'created', 'name', 'url', ['pkg', 'version'], ['pkg', 'env'] ].every(path => {
          const val = this.get(['deployments', key].concat(path))
          if (val || val === '') {
            return true
          }
          rem = true
          return false
        })
        return rem
      })

    this.emit('info', `Deployments to remove: ${toRemove.length}`)

    toRemove
      .forEach(key => {
        this.set({ deployments: { [key]: { pkg: null } } }, stamp)
      })
    vstamp.close(stamp)
  },
  getDeployments () {
    clearTimeout(this.timeout)

    const root = this

    var idList = []
    var tasks = []
    var errored = false

    const get = now.get('list', root.token, 'deployments.*')
      .on('response', deployment => {
        if (!deployment || !deployment.url) { return }
        const id = String(deployment.uid)
        delete deployment.uid

        idList.push(id)
        if (!root.get(['deployments', id, 'pkg'])) {
          const stamp = vstamp.create('list')
          tasks.push(Object.assign({}, deployment, { id }))
          root.set({ deployments: { [id]: deployment } }, stamp)
          vstamp.close(stamp)
        }
      })
      .on('error', error => {
        root.emit('error', Object.assign(error, { apiPath: 'list' }))
        errored = true
        get.abort()
      })
      .on('end', () => {
        root.emit('info', `${Object.keys(tasks).length} new deployments found`)

        if (errored) {
          idList = []
          tasks = []
        }

        if (idList.length > root.get('deployments').keys().length * 0.95) {
          root.get('deployments').keys().forEach(id => {
            if (idList.indexOf(id) === -1) {
              root.deployments[id].remove()
              root.emit('info', `Deployment removed: ${id}`)
            }
          })
        }

        get.set(null)
        setImmediate(root.getPackages.bind(root), tasks)

        idList = null
        tasks = null
      })
      .send()
  },
  getPackages (tasks) {
    if (!this.started) {
      return
    }

    if (tasks.length < 1) {
      this.emit('refresh')
      if (this.started) {
        this.timeout = setTimeout(this.getDeployments.bind(this), 1000)
      }
      return
    }

    const root = this
    const runner = concurrent([
      {
        timeout: 5 * 1000,
        tryCount: 20,
        run (dep, resolve, reject) {
          const apiPath = `deployments/${dep.id}/links`

          const get = now.get(apiPath, root.token, 'files.*')
            .on('response', file => {
              if (file && file.file === 'package.json') {
                resolve({ [dep.id]: { pkgId: file.sha } })
              }
            })
            .on('error', error => {
              reject(Object.assign(error, { apiPath }))
            })
            .on('end', () => {
              resolve()
              get.set(null)
            })
            .send()

          return get.abort.bind(get)
        }
      },
      {
        timeout: 3 * 1000,
        tryCount: 20,
        run (dep, resolve, reject) {
          const pkgId = runner.results(dep.id).pkgId

          if (!pkgId) {
            // no package id try again next turn
            return resolve()
          }

          const apiPath = `deployments/${dep.id}/files/${pkgId}`

          const get = now.get(apiPath, root.token, false)
            .on('response', pkg => {
              if (!pkg) { return }

              if (!pkg.version) {
                // no version give up
                root.emit('error', new Error(`Found deployment with no version: ${JSON.stringify(dep)}`))
                return resolve({ [dep.id]: { pkg: {} } })
              }

              resolve({ [dep.id]: { pkg: {
                version: pkg.version,
                env: pkg._env || '',
                envName: pkg._envName || '',
                branch: pkg._branch || '',
                prNr: pkg._prNr || '',
                wrapper: pkg._wrapper
              } } })
            })
            .on('error', error => {
              if (/^Invalid JSON/.test(error.message)) {
                if (dep.created > +new Date() - 7200 * 1000) {
                  // young invalid json try again next turn
                  return resolve()
                } else {
                  // old invalid json give up
                  root.emit('error', new Error(`Found half uploaded deployment: ${JSON.stringify(dep)}`))
                  return resolve({ [dep.id]: { pkg: {} } })
                }
              }

              reject(Object.assign(error, { apiPath }))
            })
            .on('end', () => {
              resolve()
              get.set(null)
            })
            .send()

          return get.abort.bind(get)
        }
      }
    ])

    runner.addTask(tasks)

    runner
      .on('error', (dep, error) => {
        root.emit('error', Object.assign(error, { dep }))
      })
      .on('task-done', dep => {
        const pkg = runner.results([dep.id, 'pkg'])

        if (pkg) {
          const stamp = vstamp.create('pkg')
          root.set({ deployments: { [dep.id]: { pkg } } }, stamp)
          vstamp.close(stamp)
        }

        root.emit('info', `Deployment scraped: ${JSON.stringify(dep)}`)
        root.emit('info', runner.status())
      })
      .on('complete', () => {
        root.emit('refresh')
        if (root.started) {
          root.timeout = setTimeout(root.getDeployments.bind(root), 1000)
        }
        runner.set(null)
      })
      .run(10)
  }
}

exports.deployments = {
  sort: {
    val: 'created',
    exec (a, b) {
      return a > b ? -1 : a < b ? 1 : 0
    }
  }
}
