const devSupport = require('./wnpm-dev'),
  shelljs = require('shelljs'),
  exec = require('child_process').exec,
  execSync = require('child_process').execSync,
  path = require('path'),
  objects = require('./objects'),
  diff = require('jsondiffpatch').diff,
  _ = require('lodash'),
  fs = require('fs');

module.exports = opts => {
  const dir = opts.cwd;
  const skips = new Set(opts.excludes || []);
  const allPackagesToBuild = devSupport.findListOfNpmPackagesAndLocalDependencies(dir).filter(pkg => !skips.has(pkg.npm.name));
  const changedPackages = devSupport.findChangedPackages(dir, allPackagesToBuild);
  const sortedPackagesToBuild = devSupport.sortPackagesByDependencies(allPackagesToBuild);

  const changed = toPackagePaths(changedPackages);
  const needsRebuild = toPackagePaths(devSupport.figureOutAllPackagesThatNeedToBeBuilt(allPackagesToBuild, changedPackages));
  const modules = sortedPackagesToBuild.map(pkg => {
    pkg.rootDir = dir;
    pkg.hasChanges = () => changed.has(pkg.relativePath);
    pkg.needsRebuild = () => needsRebuild.has(pkg.relativePath);
    pkg.packageJson = JSON.parse(shelljs.cat(path.join(pkg.fullPath, 'package.json')).stdout);
    pkg.inDir = fn => {
      process.chdir(pkg.fullPath);
      const res = fn();
      process.chdir(dir);
      return res;
    };
    pkg.exec = (what, verbose) => {
      const shouldChange = process.cwd() !== pkg.fullPath;
      if (shouldChange) {
        process.chdir(pkg.fullPath);
      }

      try {
        let stdout = execSync(what, {stdio: verbose ? 'inherit' : 'pipe'})

        return stdout;
      } catch (err) {
        let {stdout, stderr, status, error} = err

        if (error) {
          process.exit(1)
        }

        if (status) {
          if (verbose) {
            // no need to duplicate process output, moreover, any output we now
            // send to stdio has lost any ASNI codes it may have contained (so
            // we'll lose colors, etc.).
            throw new Error(`Exit code: ${status}`);
          } else {
            throw new Error(`Exit code: ${status}, output: ${stdout} ${stderr}`);
          }
        }

        return stdout;
      } finally {

        if (shouldChange) {
          process.chdir(dir);
        }
      }
    };

    pkg.execAsync = what => {
      return new Promise((resolve, reject) => {
        exec(what, (error, stdout, stderr) => {
          if (error === null) {
            resolve(stdout);
          } else {
            reject(new Error(`Exit code: ${error.code}, output: ${stdout} ${stderr}`));
          }
        });
      });
    };

    pkg.links = () => devSupport.npmLinks(pkg, allPackagesToBuild);

    pkg.markUnbuilt = () => devSupport.makePackagesUnbuilt([pkg.fullPath]);

    pkg.markBuilt = () => devSupport.makePackageBuilt(pkg.fullPath);

    pkg.merge = (overrides, isSave) => {
      const packageJson = JSON.parse(shelljs.cat(path.join(pkg.fullPath, 'package.json')).stdout);
      const res = objects.merge(_.cloneDeep(packageJson), overrides);
      const changes = diff(packageJson, res);

      if (isSave && changes) {
        fs.writeFileSync(path.join(pkg.fullPath, 'package.json'), JSON.stringify(res, null, 2));
      }

      return changes;
    };

    pkg.rm = (what, isSave) => {
      const packageJson = JSON.parse(shelljs.cat(path.join(pkg.fullPath, 'package.json')).stdout);
      const unset = (obj, path) => {
        const has = _.has(packageJson, path);
        _.unset(packageJson, path);
        return has ? path : null;
      };

      const removes = _(what)
        .map(path => unset(packageJson, path))
        .compact()
        .value();

      if (isSave && removes.length > 0) {
        fs.writeFileSync(path.join(pkg.fullPath, 'package.json'), JSON.stringify(packageJson, null, 2));
      }

      return removes;
    };

    return pkg;
  });

  return {
    modules: modules,
    inDir: fn => {
      const actualcwd = process.cwd();
      process.chdir(dir);
      const res = fn();
      process.chdir(actualcwd);
      return res;
    }

  }
};

function toPackagePaths(changedPackages) {
  return new Set(changedPackages.map(el => el.relativePath));
}
