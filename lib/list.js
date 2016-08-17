'use strict'

const now = require('./now')

exports.get = (token) => {
  var list = []

  now.setToken(token)
  return now.getDeployments()
    .then(deployments => Promise.all(deployments.map(deployment => {
      return now.getPkg(deployment.uid)
        .then(pkg => {
          if (!pkg.version) {
            return
          }

          const found = list.find(
            d => d.name === deployment.name && d.version === pkg.version && d.env === (pkg._env || '')
          )

          if (!found) {
            list.push({
              name: deployment.name,
              version: pkg.version,
              env: pkg._env || '',
              url: deployment.url,
              created: deployment.created
            })
          }

          if (found && found.created < deployment.created) {
            found.url = deployment.url
            found.created = deployment.created
          }
        })
    })))
    .then(() => {
      return list
    })
}
