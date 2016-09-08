'use strict'
const s = require('vigour-state/s')
const pkg = require('../../package.json')
const title = pkg.name + '@' + pkg.version
const ts = require('monotonic-timestamp')

module.exports = s({
  title,
  inject: require('./scrape'),
  log: {
    sort: {
      val: 'key',
      exec (a, b) {
        return a > b ? -1 : a < b ? 1 : 0
      }
    }
  },
  on: {
    info (val) {
      this.set({
        log: { [ts()]: { class: 'info', val } }
      })
    },
    error (error) {
      this.set({
        log: {
          [ts()]: {
            class: 'error',
            val: error
          }
        }
      })
    }
  }
})
