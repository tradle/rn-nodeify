# rn-nodeify

Run after npm install and you can use node core modules in your React Native app.

## Usage

```bash
rn-nodeify <options>
```

## Options

```
--install     install node core shims (default: install all), 
              fix the "browser" (later "react-native") fields 
              in the package.json's of dependencies
--hack        hack individual packages that are known to make 
              the React Native packager choke
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
