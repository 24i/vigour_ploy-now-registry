'use strict'

const now = require('observe-now')
const concurrent = require('concurrent-task')

exports.properties = {
  token: true,
  started: true,
  timeout: true,
  registry: true
}

exports.define = {
  start (token) {
    this.token = token
    this.started = true
    this.getDeployments()
  },
  stop () {
    this.started = false
    clearTimeout(this.timeout)
  },
  getDeployments () {
    clearTimeout(this.timeout)

    const root = this

    var idList = []
    var tasks = {}

    const get = now.get('list', root.token, 'deployments.*')
      .on('data', deployment => {
        if (!deployment) { return }
        deployment.id = String(deployment.uid)
        delete deployment.uid

        idList.push(deployment.id)
        if (!root.deployments[deployment.id] || !root.deployments[deployment.id].pkg) {
          tasks[deployment.id] = {}
          root.deployments.set({ [deployment.id]: deployment })
        }
      })
      .on('error', error => {
        root.emit('error', Object.assign(error, { apiPath: 'list' }))
      })
      .on('end', () => {
        root.emit('info', `${Object.keys(tasks).length} new deployments found`)

        root.deployments.keys().forEach(id => {
          if (idList.indexOf(id) === -1) {
            root.deployments[id].remove()
            root.emit('info', `Deployment removed: ${id}`)
          }
        })
        get.remove()
        setImmediate(this.getPackages.bind(this), tasks)

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
      setImmediate(this.calculateRegistry.bind(this))
      if (this.started) {
        this.timeout = setTimeout(this.getDeployments.bind(this), 2000)
      }
      return
    }

    const root = this
    const runner = concurrent(20)

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
            const fid = data['0-result'] && data['0-result'].compute()

            if (!fid) {
              root.deployments[data.key].set({ pkg: {} })
              return resolve()
            }

            const apiPath = `deployments/${data.key}/files/${fid}`

            const get = now.get(apiPath, root.token, false)
              .on('data', pkg => {
                if (pkg && pkg.version) {
                  resolve({
                    version: pkg.version,
                    env: pkg._env || '',
                    routes: pkg._routes
                  })
                } else {
                  resolve()
                }
              })
              .on('error', error => {
                if (/^Invalid JSON/.test(error.message)) {
                  root.deployments[data.key].set({ pkg: {} })
                  return resolve()
                }

                reject(Object.assign(error, { apiPath }))
              })
              .once('end', () => {
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
        const pkg = runner.tasks[key]['1-result'] && runner.tasks[key]['1-result'].serialize()

        if (pkg) {
          root.deployments[key].set({ pkg })
        }
        root.emit('info', `Deployment scraped: ${key}`)
        root.emit('info', runner.status())
      })
      .on('complete', () => {
        setImmediate(this.calculateRegistry.bind(this))
        if (root.started) {
          root.timeout = setTimeout(root.getDeployments.bind(root), 1000)
        }
        runner.remove()
      })
      .run()
  },
  calculateRegistry () {
    var newRegistry = []

    this.deployments.each((dep) => {
      if (!dep.pkg || !dep.pkg.version) {
        return
      }

      const deployment = {
        name: dep.name.compute(),
        version: dep.pkg.version.compute(),
        env: dep.pkg.env.compute(),
        url: dep.url.compute(),
        created: dep.created.compute()
      }

      const found = newRegistry.find(
        d => d.name === deployment.name && d.version === deployment.version && d.env === deployment.env
      )

      if (!found) {
        newRegistry.push(deployment)
      }
    })

    this.registry = newRegistry
  }
}

exports.deployments = {
  type: 'base',
  sort: {
    val: 'created',
    exec (a, b) {
      return a > b ? -1 : a < b ? 1 : 0
    }
  }
}

exports.registry = []
