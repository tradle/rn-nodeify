# rn-nodeify

Run after npm install and you can use node core modules and npm modules that use them in your React Native app.

## Usage

```bash
rn-nodeify <options>
```

## Options

```
--install     install node core shims (default: install all), fix the "browser" 
              (later "react-native") fields in the package.json's of dependencies
--hack        hack individual packages that are known to make the React Native packager choke
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

## Please note...


- rn-nodeify won't work with modules that are added using `npm link`.
- modules that contain a .babelrc will cause problems with the latest react-native version (0.20 at this time), remove them after installation (`rm node_modules/*/.babelrc`)
- when installing a package from git, the postinstall hook isn't triggered, run it manually instead (`npm run postinstall`)
- restart the react-native packager after installing a module!
- removing the packager cache helps as well sometimes (`rm -fr $TMPDIR/react-*`)

Also, see this [example React Native app](https://github.com/mvayngrib/adexample)
