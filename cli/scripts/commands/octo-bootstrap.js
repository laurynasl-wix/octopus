#!/usr/bin/env node
const log = require('../../lib/logger')(),
  forCommand = require('../../lib/commands').forCommand,
  engines = require('../../lib/engines');

exports.command = 'bootstrap';
exports.desc = 'npm install and link all modules';
exports.builder = yargs => {
  return yargs
    .usage('\nUsage: octo bootstrap [options]')
    .option('a', {
      alias: 'all',
      describe: 'execute for all modules regardless of current build status',
      type: 'boolean'
    })
    .option('n', {
      alias: 'no-build',
      describe: 'do not mark modules as built',
      type: 'boolean'
    })
    .option('c', {
      alias: 'clean',
      describe: 'execute octopus.json clean script before bootstrapping each module',
      type: 'boolean'
    })
    .option('v', {
      alias: 'verbose',
      describe: 'verbose output',
      type: 'boolean'
    });
};

exports.handler = forCommand('octo bootstrap', (octo, config, opts) => {
  const engine = engines(config);
  const forAll = opts.all;
  const noBuild = opts.noBuild;
  const verbose = opts.verbose;
  const clean = opts.clean;

  if (forAll) {
    log.warn('marking modules with changes as unbuilt');
    octo.modules.forEach(module => module.markUnbuilt());
  }

  const modules = octo.modules.filter(module => forAll === true ? module : module.needsRebuild());
  const count = modules.length;

  if (count === 0) {
    log.warn(forAll ? 'no modules found' : 'no modules with changes found');
  } else {
    modules.forEach((module, i) => module.inDir(() => {
      let cleanScript;
      if (clean) {
        if (config.scripts && config.scripts.clean) {
          cleanScript = config.scripts.clean;
        } else {
          log.warn('-c provided, but no scripts.clean present in octopus.json - ignoring');
        }
      }

      log.for(`${module.npm.name} (${module.relativePath}) (${i + 1}/${count})`, () => {
        const cmd = engine.bootstrap(module.links());
        log.for(`install/link (${cmd})`, () => {
          if (cleanScript) {
            log.warn(`Running clean script with command: "${cleanScript}"`);
            module.exec(cleanScript, verbose);
          }

          module.exec(cmd, verbose);
          if (!noBuild) {
            module.markBuilt();
          }
        });
      });
    }));
  }
});