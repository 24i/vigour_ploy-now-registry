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
    var tasks = {}

    const get = now.get('list', root.token, 'deployments.*')
      .on('data', deployment => {
        if (!deployment || !deployment.url) { return }
        const id = String(deployment.uid)
        delete deployment.uid

        idList.push(id)
        if (!root.get(['deployments', id, 'pkg'])) {
          const stamp = vstamp.create('list')
          tasks[id] = deployment
          root.set({ deployments: { [id]: deployment } }, stamp)
          vstamp.close(stamp)
        }
      })
      .on('error', error => {
        root.emit('error', Object.assign(error, { apiPath: 'list' }))
      })
      .on('end', () => {
        root.emit('info', `${Object.keys(tasks).length} new deployments found`)

        /*
        if (idList.length > 0) {
          root.get('deployments').keys().forEach(id => {
            if (idList.indexOf(id) === -1) {
              root.deployments[id].remove()
              root.emit('info', `Deployment removed: ${id}`)
            }
          })
        }
        */

        get.remove()
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

    if (Object.keys(tasks).length < 1) {
      this.emit('refresh')
      if (this.started) {
        this.timeout = setTimeout(this.getDeployments.bind(this), 2000)
      }
      return
    }

    const root = this
    const runner = concurrent(10)

    runner.set({
      steps: {
        getPkgId: {
          timeout: 5 * 1000,
          tryCount: 20,
          run (data, resolve, reject) {
            const apiPath = `deployments/${data.key}/links`

            const get = now.get(apiPath, root.token, 'files.*')
              .on('data', file => {
                if (file && file.file === 'package.json') {
                  resolve(file.sha)
                }
              })
              .on('error', error => {
                reject(Object.assign(error, { apiPath }))
              })
              .once('end', () => {
                resolve()
                get.remove()
              })
              .send()

            return get.abort.bind(get)
          }
        },
        getPkg: {
          timeout: 3 * 1000,
          tryCount: 20,
          run (data, resolve, reject) {
            const fid = data.getPkgId && data.getPkgId.compute()

            if (!fid) {
              return resolve()
            }

            const apiPath = `deployments/${data.key}/files/${fid}`

            const get = now.get(apiPath, root.token, false)
              .on('data', pkg => {
                if (!pkg) { return }

                if (!pkg.version) {
                  // no version give up
                  root.emit('error', new Error(`Found deployment with no version: ${JSON.stringify(data.serialize())}`))
                  return resolve({})
                }

                resolve({
                  version: pkg.version,
                  env: pkg._env || '',
                  envName: pkg._envName || '',
                  branch: pkg._branch || '',
                  prNr: pkg._prNr || '',
                  wrapper: pkg._wrapper
                })
              })
              .on('error', error => {
                if (/^Invalid JSON/.test(error.message)) {
                  if (data.created.compute() > +new Date() - 7200 * 1000) {
                    // young invalid json try again next turn
                    return resolve()
                  } else {
                    // old invalid json give up
                    root.emit('error', new Error(`Found half uploaded deployment: ${JSON.stringify(data.serialize())}`))
                    return resolve({})
                  }
                }

                reject(Object.assign(error, { apiPath }))
              })
              .once('end', () => {
                resolve()
                get.remove()
              })
              .send()

            return get.abort.bind(get)
          }
        }
      },
      tasks
    })

    runner
      .on('error', (key, error) => {
        root.emit('error', Object.assign(error, { id: key }))
      })
      .on('task-done', key => {
        const pkg = runner.get(['tasks', key, 'getPkg'])

        if (pkg) {
          const stamp = vstamp.create('pkg')
          root.set({ deployments: { [key]: { pkg: pkg.serialize() } } }, stamp)
          vstamp.close(stamp)
        }

        root.emit('info', `Deployment scraped: ${key}`)
        root.emit('info', runner.status())
      })
      .on('complete', () => {
        root.emit('refresh')
        if (root.started) {
          root.timeout = setTimeout(root.getDeployments.bind(root), 1000)
        }
        runner.remove()
      })
      .run()
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
