if (typeof __dirname === 'undefined') global.__dirname = '/'
if (typeof __filename === 'undefined') global.__filename = ''
if (typeof process === 'undefined') {
  global.process = require('process')
  process.browser = false
}
if (typeof Buffer === 'undefined') global.Buffer = require('buffer').Buffer

global.location = global.location || { port: 80 }
