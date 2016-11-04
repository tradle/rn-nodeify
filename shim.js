if (typeof __dirname === 'undefined') global.__dirname = '/'
if (typeof __filename === 'undefined') global.__filename = ''
if (typeof process === 'undefined') {
  global.process = require('process')
} else {
  const bProcess = require('process')
  for (var p in bProcess) {
    if (!(p in process)) {
      process[p] = bProcess[p]
    }
  }
}

process.browser = false
if (typeof Buffer === 'undefined') global.Buffer = require('buffer').Buffer

// global.location = global.location || { port: 80 }
const isDev = typeof __DEV__ === 'boolean' && __DEV__
process.env['NODE_ENV'] = isDev ? 'development' : 'production'
if (typeof localStorage !== 'undefined') {
  localStorage.debug = isDev ? '*' : ''
}

if (require('./package.json').dependencies['react-native-crypto']) {
  const algos = require('browserify-sign/algos')
  if (!algos.sha256) {
    algos.sha256 = {
      "sign": "ecdsa",
      "hash": "sha256",
      "id": new Buffer("")
    }
  }

  if (typeof window === 'object') {
    const wCrypto = window.crypto = window.crypto || {}
    wCrypto.getRandomValues = wCrypto.getRandomValues || getRandomValues
  }

  const crypto = require('crypto')
  const randomBytes = crypto.randomBytes
  crypto.randomBytes = function (size, cb) {
    if (cb) return randomBytes.apply(crypto, arguments)

    const arr = new Buffer(size)
    getRandomValues(arr)
    return arr
  }

  crypto.getRandomValues = crypto.getRandomValues || getRandomValues

  function getRandomValues (arr) {
    // console.warn('WARNING: generating insecure psuedorandom number')
    for (var i = 0; i < arr.length; i++) {
      arr[i] = Math.random() * 256 | 0
    }

    return arr
  }
}
