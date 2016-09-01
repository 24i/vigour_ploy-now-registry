'use strict'

const now = require('./now')

var all = []

exports.get = (token) => {
  var list = []
  var newAll = []

  now.setToken(token)
  return now.getDeployments()
    .then(deployments => Promise.all(deployments.map(deployment => {
      const existing = all.find(d => d.uid === deployment.uid)

      return (existing ? Promise.resolve(existing) : now.getPkg(deployment.uid))
        .then(pkg => {
          if (!pkg.version) {
            return
          }

          deployment.version = pkg.version
          deployment.env = pkg.env || pkg._env || ''

          newAll.push(deployment)

          const found = list.find(
            d => d.name === deployment.name && d.version === deployment.version && d.env === deployment.env
          )

          if (!found) {
            let {name, version, env, url, created} = deployment
            list.push({name, version, env, url, created})
          }

          if (found && found.created < deployment.created) {
            found.url = deployment.url
            found.created = deployment.created
          }
        })
    })))
    .then(() => {
      all = newAll
      return list
    })
    .catch((err) => {
      all = newAll
      throw err
    })
}
