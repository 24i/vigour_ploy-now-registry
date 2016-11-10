'use strict'

const Hub = require('brisky-hub')
const ts = require('monotonic-timestamp')

const pkg = require('../../package.json')
const title = pkg.name + '@' + pkg.version

module.exports = new Hub({
  title,
  inject: [
    require('blend-state-dynamo'),
    require('./scrape')
  ],
  log: {
    sort: {
      val: 'key',
      exec (a, b) {
        return a > b ? -1 : a < b ? 1 : 0
      }
    },
    child: {
      on: {
        data () {
          if (!this.key) {
            return
          }

          if (this.parent.keys().length >= 200) {
            this.parent[this.parent.keys().pop()].remove()
          }
        }
      }
    }
  },
  on: {
    info (info) {
      this.set({ log: { [ts()]: { class: 'info', info } } })
    },
    error (error) {
      this.set({ log: { [ts()]: { class: 'error', error } } })
    }
  }
})
