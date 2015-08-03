#!/usr/bin/env node

var fs = require('fs')
var path = require('path')
var semver = require('semver')
var proc = require('child_process')
var extend = require('xtend')
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

installShims(argv._.length ? argv._ : Object.keys(allShims), function (err) {
  if (err) throw err

  hackPackageJSONs(function (err) {
    if (err) throw err

    if (argv.extra) {
      require(path.resolve(__dirname, 'pkg-hacks'))
    }
  })
})

function shouldRemoveExclude (name) {
  return coreList.indexOf(name) !== -1
}

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
  fixPackageJSON('./package.json')

  var finder = find('./node_modules')

  finder.on('file', function (file) {
    if (!/\/package\.json$/.test(file)) return

    fixPackageJSON(file)
  })

  finder.once('end', done)
}

function fixPackageJSON (file) {
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

    var orgBrowser = pkgJson.browser
    var depBrowser = extend(browser)
    var save
    if (typeof orgBrowser === 'string') {
      depBrowser[pkgJson.main] = pkgJson.browser
      save = true
    } else {
      if (typeof orgBrowser === 'object') {
        depBrowser = extend(depBrowser, orgBrowser)
      } else {
        save = true
      }
    }

    if (!save) {
      for (var p in depBrowser) {
        if (orgBrowser[p] === false) {
          if (shouldRemoveExclude(p)) {
            save = true
            console.log('removing browser exclude', file, p)
            delete depBrowser[p]
          }
        } else if (!orgBrowser[p]) {
          save = true
        } else if (depBrowser[p] !== browser[p]) {
          console.log('not overwriting mapping', p, orgBrowser[p])
        }
      }
    }

    if (save) {
      pkgJson.browser = depBrowser
      fs.writeFile(file, JSON.stringify(pkgJson, null, 2), rethrow)
    }
  })
}

function rethrow (err) {
  if (err) throw err
}

