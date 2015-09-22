#!/usr/bin/env node

var fs = require('fs')
var path = require('path')
var semver = require('semver')
var proc = require('child_process')
var extend = require('xtend/mutable')
var deepEqual = require('deep-equal')
var find = require('findit')
var minimist = require('minimist')
var parallel = require('run-parallel')
var allShims = require('./shims.json')
var coreList = require('./coreList.json')
var browser = require('./browser.json')
var pkg = require('./package.json')
var argv = minimist(process.argv.slice(2), {
  alias: {
    e: 'extra'
  }
})

var subset
if (argv._.length) {
  subset = argv._.map(function (s) {
    return browser[s] || s
  })
} else {
  subset = Object.keys(allShims)
}

installShims(subset, function (err) {
  if (err) throw err

  hackPackageJSONs(function (err) {
    if (err) throw err

    if (argv.extra) {
      require(path.resolve(__dirname, 'pkg-hacks'))
    }
  })
})

// function shouldRemoveExclude (name) {
//   return coreList.indexOf(name) !== -1
// }

function installShims (shimNames, done) {
  var tasks = shimNames.map(function (name) {
    return function (cb) {
      var modPath = path.resolve('./node_modules/' + name)
      fs.exists(modPath, function (exists) {
        if (exists) {
          var existingVer = require(modPath + '/package.json').version
          if (semver.satisfies(existingVer, allShims[name])) {
            console.log('not reinstalling ' + name)
            return cb()
          }
        }

        proc.execSync('npm install --save ' + name + '@' + allShims[name], {
          cwd: process.cwd(),
          env: process.env,
          stdio: 'inherit'
        })

        cb()
      })
    }
  })

  tasks.push(function (cb) {
    fs.exists('./shim.js', function (exists) {
      if (exists) return cb()

      fs.readFile(path.join(__dirname, 'shim.js'), { encoding: 'utf8' }, function (err, contents) {
        if (err) return cb(err)

        fs.writeFile('./shim.js', contents, cb)
      })
    })
  })

  parallel(tasks, done)
}

function hackPackageJSONs (done) {
  fixPackageJSON('./package.json', true)

  var finder = find('./node_modules')

  finder.on('file', function (file) {
    if (!/\/package\.json$/.test(file)) return

    fixPackageJSON(file)
  })

  finder.once('end', done)
}

function fixPackageJSON (file, overwrite) {
  fs.readFile(path.resolve(file), { encoding: 'utf8' }, function (err, contents) {
    if (err) throw err

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

    coreList.forEach(function (p) {
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

