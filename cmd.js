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
var yarnlock = require('@yarnpkg/lockfile')
var allShims = require('./shims')
var coreList = require('./coreList')
var browser = require('./browser')
var pkgPath = path.join(process.cwd(), 'package.json')
var pkg = require(pkgPath)
var hackFiles = require('./pkg-hacks')
var argv = minimist(process.argv.slice(2), {
  alias: {
    h: 'help',
    i: 'install',
    e: 'hack',
    o: 'overwrite',
    y: 'yarn'
  }
})

var BASE_INSTALL_LINE = argv.yarn ? 'yarn add' : 'npm install --save'

if (argv.help) {
  runHelp()
  process.exit(0)
} else {
  run()
}

function run () {
  var toShim
  if (argv.install) {
    if (argv.install === true) {
      toShim = coreList
    } else {
      toShim = argv.install.split(',')
        .map(function (name) {
          return name.trim()
        })
    }
  } else {
    toShim = coreList
  }

  if (toShim.indexOf('stream') !== -1) {
    toShim.push(
      '_stream_transform',
      '_stream_readable',
      '_stream_writable',
      '_stream_duplex',
      '_stream_passthrough',
      'readable-stream'
    )
  }

  if (toShim.indexOf('crypto') !== -1) {
    toShim.push('react-native-randombytes')
  }

  if (argv.install) {
    installShims({
      modules: toShim,
      overwrite: argv.overwrite
    }, function (err) {
      if (err) throw err

      runHacks()
    })
  } else {
    runHacks()
  }

  function runHacks () {
    hackPackageJSONs(toShim, function (err) {
      if (err) throw err

      if (argv.hack) {
        if (argv.hack === true) hackFiles()
        else hackFiles([].concat(argv.hack))
      }
    })
  }
}

function installShims ({ modules, overwrite }, done) {
  if (!overwrite) {
    modules = modules.filter(name => {
      const shimPackageName = browser[name] || name
      if (pkg.dependencies[shimPackageName]) {
        log(`not overwriting "${shimPackageName}"`)
        return false
      }

      return true
    })
  }

  var shimPkgNames = modules
    .map(function (m) {
      return browser[m] || m
    })
    .filter(function (shim) {
      return !/^_/.test(shim) && (shim[0] === '@' || shim.indexOf('/') === -1)
    })

  if (!shimPkgNames.length) {
    return finish()
  }

  // Load the exact package versions from the lockfile
  var lockfile
  if (argv.yarn) {
    if (fs.existsSync('yarn.lock')) {
      let result = yarnlock.parse(fs.readFileSync('yarn.lock', 'utf8'))
      if (result.type == 'success') {
        lockfile = result.object
      }
    }
  } else {
    var lockpath = path.join(process.cwd(), 'package-lock.json')
    if (fs.existsSync(lockpath)) {
      let result = require(lockpath)
      if (result && result.dependencies) {
        lockfile = result.dependencies
      }
    }
  }

  parallel(shimPkgNames.map(function (name) {
    var modPath = path.resolve('./node_modules/' + name)
    return function (cb) {
      fs.exists(modPath, function (exists) {
        if (!exists) return cb()

        var install = true
        if (lockfile) {
          // Use the lockfile to resolve installed version of package
          if (argv.yarn) {
            if (`${name}@${allShims[name]}` in lockfile) {
              install = false
            }
          } else {
            var lockfileVer = (lockfile[name] || {}).version
            var targetVer = allShims[name]
            if (semver.valid(lockfileVer)) {
              if (semver.satisfies(lockfileVer, targetVer)) {
                install = false
              }
            } else if (lockfileVer) {
              // To be considered up-to-date, we need an exact match,
              // after doing some normalization of github url's
              if (lockfileVer.startsWith('github:')) {
                lockfileVer = lockfileVer.slice(7)
              }
              if (lockfileVer.indexOf(targetVer) == 0) {
                install = false
              }
            }
          }
        } else {
          // Fallback to using the version from the dependency's package.json
          var pkgJson = require(modPath + '/package.json')
          if (/^git\:\/\//.test(pkgJson._resolved)) {
            var hash = allShims[name].split('#')[1]
            if (hash && pkgJson.gitHead.indexOf(hash) === 0) {
              install = false
            }
          } else {
            var existingVerNpm5 = (/\-([^\-]+)\.tgz/.exec(pkgJson.version) || [null, null])[1]
            var existingVer = existingVerNpm5 || pkgJson.version
            if (semver.satisfies(existingVer, allShims[name])) {
              install = false
            }
          }
        }

        if (!install) {
          log('not reinstalling ' + name)
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

    var installLine = BASE_INSTALL_LINE + ' '
    shimPkgNames.forEach(function (name) {
      let version = allShims[name]
      if (!version) return
      if (version.indexOf('/') === -1) {
        if (argv.yarn) {
          log('installing from yarn', name)
        } else {
          log('installing from npm', name)
        }
        installLine += name + '@' + version
      } else {
        // github url
        log('installing from github', name)
        installLine += version.match(/([^\/]+\/[^\/]+)$/)[1]
      }

      pkg.dependencies[name] = version
      installLine += ' '
    })

    fs.writeFile(pkgPath, prettify(pkg), function (err) {
      if (err) throw err

      if (installLine.trim() === BASE_INSTALL_LINE) {
        return finish()
      }

      log('installing:', installLine)
      proc.execSync(installLine, {
        cwd: process.cwd(),
        env: process.env,
        stdio: 'inherit'
      })

      finish()
    })
  })

  function finish () {
    copyShim(done)
  }
}

function copyShim (cb) {
  fs.exists('./shim.js', function (exists) {
    if (exists) {
      log('not overwriting shim.js. For the latest version, see rn-nodeify/shim.js')
      return cb()
    }

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
    if (path.basename(file) !== 'package.json') return

    fixPackageJSON(modules, file, true)
  })

  finder.once('end', done)
}

function fixPackageJSON (modules, file, overwrite) {
  if (file.split(path.sep).indexOf('react-native') >= 0) return

  var contents = fs.readFileSync(path.resolve(file), { encoding: 'utf8' })

  // var browser = pick(baseBrowser, modules)
  var pkgJson
  try {
    pkgJson = JSON.parse(contents)
  } catch (err) {
    console.warn('failed to parse', file)
    return
  }

  // if (shims[pkgJson.name]) {
  //   log('skipping', pkgJson.name)
  //   return
  // }

  // if (pkgJson.name === 'readable-stream') debugger

  var orgBrowser = pkgJson['react-native'] || pkgJson.browser || pkgJson.browserify || {}
  if (typeof orgBrowser === 'string') {
    orgBrowser = {}
    orgBrowser[pkgJson.main || 'index.js'] = pkgJson['react-native'] || pkgJson.browser || pkgJson.browserify
  }

  var depBrowser = extend({}, orgBrowser)
  for (var p in browser) {
    if (modules.indexOf(p) === -1) continue

    if (!(p in orgBrowser)) {
      depBrowser[p] = browser[p]
    } else {
      if (!overwrite && orgBrowser[p] !== browser[p]) {
        log('not overwriting mapping', p, orgBrowser[p])
      } else {
        depBrowser[p] = browser[p]
      }
    }
  }

  modules.forEach(function (p) {
    if (depBrowser[p] === false && browser[p] !== false) {
      log('removing browser exclude', file, p)
      delete depBrowser[p]
    }
  })


  const { main } = pkgJson
  if (typeof main === 'string') {
    const alt = main.startsWith('./') ? main.slice(2) : './' + main
    if (depBrowser[alt]) {
      depBrowser[main] = depBrowser[alt]
      log(`normalized "main" browser mapping in ${pkgJson.name}, fixed here: https://github.com/facebook/metro-bundler/pull/3`)
      delete depBrowser[alt]
    }
  }

  if (pkgJson.name === 'constants-browserify') {
    // otherwise react-native packager chokes for some reason
    delete depBrowser.constants
  }

  if (!deepEqual(orgBrowser, depBrowser)) {
    pkgJson.browser = pkgJson['react-native'] = depBrowser
    delete pkgJson.browserify
    fs.writeFileSync(file, prettify(pkgJson))
  }
}

function runHelp () {
  log(function () {
    /*
    Usage:
        rn-nodeify --install dns,stream,http,https
        rn-nodeify --install # installs all core shims
        rn-nodeify --hack    # run all package-specific hacks
        rn-nodeify --hack rusha,fssync   # run some package-specific hacks
    Options:
        -h  --help                  show usage
        -e, --hack                  run package-specific hacks (list or leave blank to run all)
        -i, --install               install shims (list or leave blank to install all)
        -o, --overwrite             updates installed packages if a newer version is available
        -y, --yarn                  use yarn to install packages instead of npm (experimental)

    Please report bugs!  https://github.com/mvayngrib/rn-nodeify/issues
    */
  }.toString().split(/\n/).slice(2, -2).join('\n'))
  process.exit(0)
}

function log () {
  console.log.apply(console, arguments)
}

function prettify (json) {
  return JSON.stringify(json, null, 2) + '\n'
}
