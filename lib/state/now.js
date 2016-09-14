'use strict'

const api = require('../now')

function getDeployments (state) {
  var idList = []
  var error = false

  return api('deployments', state.token, 'deployments.*')
    .on('data', deployment => {
      deployment.id = deployment.uid
      delete deployment.uid

      idList.push('' + deployment.id)
      if (!state.deployments[deployment.id]) {
        state.deployments.set({ [deployment.id]: deployment })
      }
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
exports.getDeployments = getDeployments

function getLinks (deployment) {
  const root = deployment.root
  const key = deployment.path().join('.')
  const did = deployment.id.compute()
  var error = false

  var hasPackage = false
  root.progress.set({
    [key]: {
      request: api(`deployments/${did}/links`, root.token, 'files.*')
        .on('data', file => {
          if (file.file === 'package.json') {
            hasPackage = true
            deployment.set({ pkgId: file.sha })
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
  })
}
exports.getLinks = getLinks

function getPkg (deployment) {
  const root = deployment.root
  const key = deployment.path().join('.')
  const did = deployment.id.compute()
  const fid = deployment.pkgId.compute()
  var error = false

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
        })
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
          deployment.set({ pkg: {} })
          root.progress[key].remove()
        } else {
          getPkg(deployment)
        }
      })
  }})
}
exports.getPkg = getPkg
