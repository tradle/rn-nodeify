# rn-nodeify

Run after npm install and you can use node core modules and npm modules that use them in your React Native app.

## What is solves

If your project has no non-React-Native dependencies, you don't need this module, and you should just check out ['./shims.js'](./shims.js) for the core node modules to use individually.

However, with bigger projects that don't reimplement every wheel from scratch, somewhere in your dependency tree, something uses a core node module. I found myself building this because in my React Native app, I wanted to use [bitcoinjs-lib](https://github.com/bitcoinjs/bitcoinjs-lib), [levelup](https://github.com/Level/levelup), [bittorrent-dht](https://github.com/feross/bittorrent-dht), and lots of fun crypto. If that sounds like you, keep reading.

## What it does

`rn-nodeify --install`
installs shims for core node modules, see ['./shims.js'](./shims.js) for the current mappings. It recurses down `node_modules` and modifies all the `package.json`'s in there to add/update the `browser` and `react-native` fields. It sounds scary because it is. However, it does work.

`rn-nodeify --hack`
Now that you're scared, I should also mention that there are some package-specific hacks (see ['./pkg-hacks.js'](./pkg-hacks.js)), for when the React Native packager choked on something that Webpack and Browserify swallowed.

If you're looking for a saner approach, check out [ReactNativify](https://github.com/philikon/ReactNativify). I haven't tested it myself, but I think [philikon](https://github.com/philikon) will be happy to help.

## Usage

```bash
rn-nodeify <options>
```

## Options

```
--install     install node core shims (default: install all), fix the "browser"
              and "react-native" fields in the package.json's of dependencies
--hack        hack individual packages that are known to make the React Native packager choke
--yarn        use yarn instead of npm
```

### Examples

```bash
# install all shims and run package-specific hacks
rn-nodeify --install --hack
```

```bash
# install specific shims
rn-nodeify --install "fs,dgram,process,path,console"
```

```bash
# install specific shims and hack
rn-nodeify --install "fs,dgram,process,path,console" --hack
```

It is recommended to add this command to the "postinstall" script in your project's package.json

```json
"scripts": {
  "start": "node node_modules/react-native/local-cli/cli.js start",
  "postinstall": "rn-nodeify --install fs,dgram,process,path,console --hack"
}
```

rn-nodeify will create a `shim.js` file in your project root directory. The first line in index.ios.js / index.android.js should be to `import` it (NOT `require` it!)

```js
import './shim'
```

If you are using the crypto shim, you will need to manually uncomment the line to `require('crypto')` in `shim.js`, this is because as of react-native 0.49, dynamically requiring a library is no longer allowed.

Some shims may require linking libraries, be sure to run `react-native link` after installing new shims if you run into problems.

### Example Apps / Workflows

* the [react-native-crypto](https://github.com/tradle/react-native-crypto) package has an example workflow for using crypto in a React Native app
* this [example React Native app](https://github.com/mvayngrib/adexample) shows how you can use [levelup](https://github.com/Level/levelup) in React Native

### Example Workflow

copied from [react-native-crypto](https://github.com/tradle/react-native-crypto)

1. Install and shim
  ```sh
  npm i --save react-native-crypto
  # install peer deps
  npm i --save react-native-randombytes
  react-native link react-native-randombytes
  # install latest rn-nodeify
  npm i --save-dev rn-nodeify@latest
  # install node core shims and recursively hack package.json files
  # in ./node_modules to add/update the "browser"/"react-native" field with relevant mappings
  ./node_modules/.bin/rn-nodeify --hack --install
  ```

2. `rn-nodeify` will create a `shim.js` in the project root directory
  ```js
  // index.ios.js or index.android.js
  // make sure you use `import` and not `require`!
  import './shim.js'
  // ...the rest of your code
  import crypto from 'crypto'
  // use crypto
  console.log(crypto.randomBytes(32).toString('hex'))
  ```

## Please note...

- rn-nodeify won't work with modules that are added using `npm link`.
- modules that contain a .babelrc will cause problems with the latest react-native version (0.20 at this time), remove them after installation (`rm node_modules/*/.babelrc`)
- when installing a package from git, the postinstall hook isn't triggered, run it manually instead (`npm run postinstall`)
- restart the react-native packager after installing a module!
- removing the packager cache helps as well sometimes (`rm -fr $TMPDIR/react-*`)
- use `npm@3`. `npm@5` has some issues that cause `node_modules` to disappear. See:
  - https://github.com/tradle/rn-nodeify/issues/42
  - https://github.com/infinitered/ignite/issues/1101
  - https://github.com/npm/npm/issues/16839
