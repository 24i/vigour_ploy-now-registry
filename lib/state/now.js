'use strict'

const api = require('observe-now')

function getDeployments (state) {
  var idList = []

  return api('deployments', state.token, 'deployments.*')
    .on('data', deployment => {
      if (!deployment) { return }
      deployment.id = deployment.uid
      delete deployment.uid

      idList.push(String(deployment.id))
      if (!state.deployments[deployment.id]) {
        state.deployments.set({ [deployment.id]: deployment })
      }
    })
    .on('error', err => {
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

  var hasPackage = false
  root.progress.set({
    [key]: {
      request: api(`deployments/${did}/links`, root.token, 'files.*')
        .on('data', file => {
          if (!file) { return }
          if (file.file === 'package.json') {
            hasPackage = true
            deployment.set({ pkgId: file.sha })
          }
        })
        .on('error', err => {
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

  root.progress.set({[key]: {
    request: api(`deployments/${did}/files/${fid}`, root.token, false)
      .on('data', pkg => {
        if (!pkg || !pkg.version) {
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
        root.emit('error', Object.assign(err, {
          apiPath: `deployments/${did}/files/${fid}`
        }))
        deployment.set({pkgRetry: (+deployment.pkgRetry || 0) + 1})
        if (/^Invalid JSON/.test(err.message)) {
          deployment.set({ pkg: {} })
          root.progress[key].remove()
        } else {
          getPkg(deployment)
        }
      })
  }})
}
exports.getPkg = getPkg
