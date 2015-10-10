#!/usr/bin/env node

var fs = require('fs')
var path = require('path')
var semver = require('semver')
var proc = require('child_process')
var pick = require('object.pick')
var extend = require('xtend/mutable')
var deepEqual = require('deep-equal')
var find = require('findit')
var minimist = require('minimist')
var parallel = require('run-parallel')
var allShims = require('./shims')
var coreList = require('./coreList')
var browser = require('./browser')
var pkg = require('./package')
var argv = minimist(process.argv.slice(2), {
  alias: {
    e: 'extra'
  }
})

run()

function run () {
  var toShim
  if (argv._.length) {
    toShim = argv._
    // if (toShim.indexOf('stream') !== -1) {
    // }

    // var browserB = {}
    // toShim.forEach(function (m) {
    //   if (allShims[m]) {
    //     browserB[m] = allShims[m]
    //   }
    // })

    // browser = browserB
  } else {
    toShim = coreList
  }

  toShim = toShim.slice()
  toShim.push(
    '_stream_transform',
    '_stream_readable',
    '_stream_writable',
    '_stream_duplex',
    '_stream_passthrough'
  )

  installShims(toShim, function (err) {
    if (err) throw err

    hackPackageJSONs(toShim, function (err) {
      if (err) throw err

      if (argv.extra) {
        require(path.resolve(__dirname, 'pkg-hacks'))
      }
    })
  })
}

function installShims (modulesToShim, done) {
  var shimPkgNames = modulesToShim.map(function (m) {
      return browser[m] || m
    }).filter(function (shim) {
      return !/^_/.test(shim) && shim.indexOf('/') === -1
    })

  var existence = []
  parallel(shimPkgNames.map(function (name) {
    var modPath = path.resolve('./node_modules/' + name)
    return function (cb)  {
      fs.exists(modPath, function (exists) {
        if (!exists) return cb()

        var install = true
        var pkgJson = require(modPath + '/package.json')
        if (/^git\:\/\//.test(pkgJson._resolved)) {
          var hash = allShims[name].split('#')[1]
          if (hash && pkgJson.gitHead.indexOf(hash) === 0) {
            install = false
          }
        } else {
          var existingVer = pkgJson.version
          if (semver.satisfies(existingVer, allShims[name])) {
            install = false
          }
        }

        if (!install) {
          console.log('not reinstalling ' + name)
          shimPkgNames.splice(shimPkgNames.indexOf(name), 1)
        }

        cb()
      })
    }
  }), function (err) {
    if (err) throw err

    if (!shimPkgNames.length) {
      return finish()
    }

    var installLine = 'npm install --save '
    shimPkgNames.forEach(function (name) {
      if (allShims[name].indexOf('/') === -1) {
        console.log('installing from npm', name)
        installLine += name + '@' + allShims[name]
      } else {
        // github url
        console.log('installing from github', name)
        installLine += allShims[name].match(/([^\/]+\/[^\/]+)$/)[1]
      }

      installLine += ' '
    })

    proc.execSync(installLine, {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit'
    })

    finish()

    function finish () {
      copyShim(done)
    }
  })
}

function copyShim (cb) {
  fs.exists('./shim.js', function (exists) {
    if (exists) return cb()

    fs.readFile(path.join(__dirname, 'shim.js'), { encoding: 'utf8' }, function (err, contents) {
      if (err) return cb(err)

      fs.writeFile('./shim.js', contents, cb)
    })
  })
}

function hackPackageJSONs (modules, done) {
  fixPackageJSON(modules, './package.json', true)

  var finder = find('./node_modules')

  finder.on('file', function (file) {
    if (!/\/package\.json$/.test(file)) return

    fixPackageJSON(modules, file, true)
  })

  finder.once('end', done)
}

function fixPackageJSON (modules, file, overwrite) {
  fs.readFile(path.resolve(file), { encoding: 'utf8' }, function (err, contents) {
    if (err) throw err

    // var browser = pick(baseBrowser, modules)
    var pkgJson
    try {
      pkgJson = JSON.parse(contents)
    } catch (err) {
      console.warn('failed to parse', file)
      return
    }

    // if (shims[pkgJson.name]) {
    //   console.log('skipping', pkgJson.name)
    //   return
    // }

    // if (pkgJson.name === 'readable-stream') debugger

    var orgBrowser = pkgJson.browser || {}
    if (typeof orgBrowser === 'string') {
      orgBrowser = {}
      orgBrowser[pkgJson.main || 'index.js'] = pkgJson.browser
    }

    var depBrowser = extend({}, orgBrowser)
    for (var p in browser) {
      if (modules.indexOf(p) === -1) continue

      if (!(p in orgBrowser)) {
        depBrowser[p] = browser[p]
      } else {
        if (!overwrite && orgBrowser[p] !== browser[p]) {
          console.log('not overwriting mapping', p, orgBrowser[p])
        } else {
          depBrowser[p] = browser[p]
        }
      }
    }

    modules.forEach(function (p) {
      if (depBrowser[p] === false) {
        console.log('removing browser exclude', file, p)
        delete depBrowser[p]
      }
    })

    if (!deepEqual(orgBrowser, depBrowser)) {
      pkgJson.browser = depBrowser
      fs.writeFile(file, JSON.stringify(pkgJson, null, 2), rethrow)
    }
  })
}

function rethrow (err) {
  if (err) throw err
}
