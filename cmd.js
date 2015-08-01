#!/usr/bin/env node

var fs = require('fs')
var path = require('path')
var semver = require('semver')
var proc = require('child_process')
var extend = require('xtend')
var find = require('findit')
// var allShims = require('./shims.json')
// var browser = require('./browser.json')
var allShims = require('./shims-browserify.json')
var browser = require('./browser-browserify.json')
var pkg = require('./package.json')
var argv = process.argv.slice(2)

installShims(argv.length ? argv : Object.keys(allShims))
hackPackageJSONs()

function installShims (shimNames) {
  shimNames.forEach(function (name) {
    var modPath = path.resolve('./node_modules/' + name)
    fs.exists(modPath, function (exists) {
      if (exists) {
        var existingVer = require(modPath + '/package.json').version
        if (semver.satisfies(existingVer, allShims[name])) {
          console.log('not reinstalling ' + name)
          return
        }
      }

      proc.execSync('npm install --save ' + name + '@' + allShims[name], {
        cwd: process.cwd(),
        env: process.env,
        stdio: 'inherit'
      })
    })
  })

  fs.exists('./shim.js', function (exists) {
    if (exists) return

    fs.readFile(path.join(__dirname, 'shim.js'), { encoding: 'utf8' }, function (err, contents) {
      if (err) throw err

      fs.writeFile('./shim.js', contents, rethrow)
    })
  })
}

function hackPackageJSONs () {
  var finder = find('./node_modules')

  finder.on('file', function (file) {
    if (!/\/package\.json$/.test(file)) return

    fs.readFile(path.resolve(file), { encoding: 'utf8' }, function (err, contents) {
      if (err) throw err

      var pkgJson
      try {
        pkgJson = JSON.parse(contents)
      } catch (err) {
        console.warn('failed to parse', file)
        return
      }

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
          if (!orgBrowser[p]) {
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
  })
}

function rethrow (err) {
  if (err) throw err
}

