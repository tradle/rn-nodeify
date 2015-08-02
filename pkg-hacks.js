#!/usr/bin/env node

// shelljs.exec('force-dedupe-git-modules')
var proc = require('child_process')
var fs = require('fs-extra')
var find = require('findit')
var path = require('path')
// var thisPkg = require('./package.json')

// var otrPath = path.resolve('./node_modules/tim/otr')
var raisedOtrPath = path.resolve('./node_modules/otr')

// function loadDeps() {
//   var pkgs = []
//   loadPkg('./package.json')

//   function loadPkg(pkgPath) {
//     var pkg = require(pkgPath)
//     for (var dep in pkg.dependencies) {
//       if (!allDeps[dep]) {
//         allDeps[dep] = true
//         pkgs.push.apply(pkgs, Object.keys(pkg.dependencies).map(function(name) {
//           return path.join(pkgPath, 'node_modules/' + name)
//         }))
//       }
//     }
//   }
// }

// loadDeps(hackFiles)

var hackers = [
  // don't need this as soon as react native
  // stops ignoring webtorrent/package.json "browser": "./lib/fs-storage.js": false
  {
    name: 'fssync',
    regex: [
      /webtorrent\/lib\/fs-storage\.js/
    ],
    hack: function(file, contents) {
      contents = contents.toString()
      var fixed = contents.replace(/fs\.existsSync\([^\)]*\)/g, 'false')
      return contents === fixed ? null : fixed
    }
  },
  {
    name: 'bufferequal',
    regex: [/rudp\/lib\/bufferEqual\.js/],
    hack: function (file, contents) {
      var hacked = "module.exports = require('buffer-equal')"
      if (contents !== hacked) return hacked
    }
  },
  {
    name: 'non-browser',
    regex: [
      /level-jobs\/package\.json$/
    ],
    hack: function(file, contents) {
      var pkg
      try {
        pkg = JSON.parse(contents)
      } catch (err) {
        console.log('failed to parse:', file)
        return
      }

      if (pkg.browser) {
        delete pkg.browser
        return JSON.stringify(pkg, null, 2)
      }
    }
  },
  {
    name: 'browser_field',
    regex: [
      /package\.json$/
    ],
    hack: function (file, contents) {
      var pkg
      try {
        pkg = JSON.parse(contents)
      } catch (err) {
        console.log('failed to parse:', file)
        return
      }

      if (pkg.browser && typeof pkg.browser === 'object') {
        var fixed
        for (var left in pkg.browser) {
          if (left[0] === '.' && !/\.[a-z]{0,4}$/i.test(left)) {
            fixed = true
            pkg.browser[left + '.js'] = pkg.browser[left]
            delete pkg.browser[left]
          }
        }

        if (fixed) return JSON.stringify(pkg, null, 2)
      }
    }
  },
  {
    name: 'webtorrent stuff',
    regex: [
      /\/torrent\-discovery\/package.json$/,
      /\/webtorrent\/package.json$/,
    ],
    hack: function (file, contents) {
      var pkg = JSON.parse(contents)
      var browser = pkg.browser
      var toDel = [
        'bittorrent-dht',
        'bittorrent-dht/client',
        'bittorrent-tracker',
        'bittorrent-tracker/client',
        'bittorrent-swarm'
      ]

      var save
      toDel.forEach(function (p) {
        if (p in browser) {
          delete browser[p]
          save = true
        }
      })

      if (save) {
        return JSON.stringify(pkg, null, 2)
      }
    }
  },
  {
    name: 'depgraph (rn 0.6)',
    regex: [
      /react\-packager\/.*\/DependencyGraph\/index\.js/
    ],
    hack: function (file, contents) {
      var evil = 'var id = sansExtJs(name);'
      if (contents.indexOf(evil) !== -1) {
        return contents.replace(evil, 'var id = name;')
      }
    }
  },
  {
    name: 'ecurve',
    regex: [
      /ecurve\/lib\/names\.js/
    ],
    hack: function (file, contents) {
      var evil = 'var curves = require(\'./curves\')'
      if (contents.indexOf(evil) !== -1) {
        return contents.replace(evil, 'var curves = require(\'./curves.json\')')
      }
    }
  },
  {
    name: 'assert',
    regex: [
      /assert\/assert.js$/
    ],
    hack: function (file, contents) {
      var evil = 'var util = require(\'util/\');'
      if (contents.indexOf(evil) !== -1) {
        return contents.replace(evil, 'var util = require(\'util\');')
      }
    }
  },
  // {
  //   name: 'net',
  //   regex: [
  //     /bittorrent-swarm\/package\.json$/,
  //     /portfinder\/package\.json$/
  //   ],
  //   hack: function (file, contents) {
  //     var pkg
  //     try {
  //       pkg = JSON.parse(contents)
  //     } catch (err) {
  //       console.log('failed to parse:', file)
  //       return
  //     }

  //     rewireMain(pkg)
  //     if (pkg.browser.net !== 'utp') {
  //       pkg.browser.net = 'utp'
  //       return JSON.stringify(pkg, null, 2)
  //     }
  //   }
  // },
  {
    name: 'unzip-response',
    regex: [
      /unzip\-response\/index\.js$/
    ],
    hack: function (file, contents) {
      var hack = ';res.headers = res.headers || {};'
      if (contents.indexOf(hack) !== -1) return

      var orig = "if (['gzip', 'deflate'].indexOf(res.headers['content-encoding']) !== -1) {"
      return contents.replace(
        orig,
        hack + orig
      )
    }
  },
  {
    name: 'rn-packager',
    regex: [
      /DependencyResolver\/Package\.js/
    ],
    hack: function (file, contents) {
      var hack = body(function () {
      /*
        if (browser[name] === false) return false
        if (!browser[name]) return name

        // HACK!
        name = browser[name]
        if (name[0] === '.') {
          return '.' + name
        }

        return name
      */
      })

      var evil = 'return browser[name] || name'
      if (contents.indexOf(evil) !== -1) {
        return contents.replace(evil, hack)
      }
    }
  },
  {
    name: 'crypto-browserify',
    regex: [
      /\/crypto-browserify\/rng\.js$/
    ],
    hack: function (file, contents) {
      var hack = body(function () {
        /*
        // react-native-hack
        try {
          _crypto = (
            g.crypto || g.msCrypto || require('crypto')
          )
        } catch (err) {
          _crypto = {}
        }
        */
      })

      if (contents.indexOf('react-native-hack') !== -1) return

      return contents.replace(/_crypto\s+=\s+\(\s+g\.crypto\s+\|\|\s+g.msCrypto\s+\|\|\s+require\('crypto'\)\s+\)/, hack)
    }
  }
]

function hackFiles () {
  var finder = find('./node_modules')
  var otrSrcPath
  var movedOTR = fs.existsSync(raisedOtrPath)
  var toRemove = []

  finder.on('directory', function (file) {
    file = path.resolve(file)
    if (/node_modules\/otr$/.test(file)) {
      if (!otrSrcPath && /\/zlorp\/|\/tim\//.test(file)) {
        otrSrcPath = file
      } else {
        if (file !== raisedOtrPath) {
          return toRemove.push(file)
        }
      }
    }
  })

  finder.on('end', function () {
    if (!otrSrcPath && !movedOTR) {
      throw new Error('no canonical otr installation found')
    }

    if (!movedOTR) {
      console.log('moving', otrSrcPath, 'to', raisedOtrPath)
      fs.move(otrSrcPath, raisedOtrPath, rethrow)
    }

    toRemove.forEach(function (file) {
      console.log('removing', file)
      fs.remove(file, rethrow)
    })
  })

  finder.on('file', function (file) {
    if (!/\.(js|json)$/.test(file)
      || /\/tests?\//.test(file)) return

    // var parts = file.split('/')
      // var idx = 0
      // // var idx = parts.indexOf(path.basename(__dirname))
      // while ((idx = parts.indexOf('node_modules', idx)) !== -1) {
      //   var dep = parts[idx + 1]
      //   var parentPkgPath = idx === 0 ? './package.json' :
      //     path.join(parts.slice(0, idx).join('/'), 'package.json')
      //   parentPkgPath = path.resolve(parentPkgPath)
      //   var parentPkg = require(parentPkgPath)
      //   if (!(dep in parentPkg.dependencies)) return

    //   parts.unshift() // node_modules
      //   parts.unshift() // dep
      // }

    var matchingHackers = hackers.filter(function (hacker) {
      return hacker.regex.some(function (regex) {
        return regex.test(file)
      })
    })

    if (!matchingHackers.length) return

    file = path.resolve(file)
    // if (/\.json$/.test(file)) {
    //   try {
    //     var json = JSON.parse(require(file))
    //     onread(null, json)
    //   } catch (err) {
    //     console.warn('failed to parse:', file)
    //   }
    // }
    // else {
    fs.readFile(file, { encoding: 'utf8' }, onread)
    // }

    function onread (err, str) {
      if (err) throw err

      var hacked = matchingHackers.reduce(function (hacked, hacker) {
        return hacker.hack(file, hacked || str) || hacked
      }, str)

      if (hacked && hacked !== str) {
        console.log('hacking', file)
        fs.writeFile(file, hacked)
      }
    }
  })
}

function rewireMain (pkg) {
  if (typeof pkg.browser === 'string') {
    var main = pkg.browser || './index.js'
    pkg.browser = {}
    pkg.browser[pkg.main] = main
  }
  else if (typeof pkg.browser === 'undefined') {
    pkg.browser = {}
  }
}

// if (fs.existsSync(otrPath)) {
//   debugger
//   fs.move(otrPath, raisedOtrPath, function (err) {
//     if (err) throw err

//     hackFiles()
//   })
// }
// else hackFiles()

// function raise (dep) {
//   var raised = './node_modules/' + path.basename(dep)
//   if (fs.existsSync(raised)) fs.remove(dep)
//   else fs.move(dep, raised)
// }

function rethrow (err) {
  if (err) throw err
}

function body (fn) {
  return fn.toString().split(/\n/).slice(2, -2).join('\n').trim()
}

hackFiles()
