const watch = require('watch');
const fs = require('fs-extra');
const nearley = require('nearley');
const path = require('path');
const tmp = require('tmp');
const { execSync } = require('child_process');
const prettyjson = require('prettyjson');
const glob = require('glob');
const minimatch = require('minimatch');
const colors = require('colors');

module.exports = (...args) => {
  return nearleyTester(...args)
    .catch(console.log);
};

async function nearleyTester(options = {}) {
  if (!options.grammarFile && !options.rawGrammarFile) {
    throw new Error('Must provide a compiled grammar file or a raw grammar file');
  }

  if (!options.testsDir) {
    throw new Error('Must provide a directory for tests');
  }

  options.testNamePattern = options.testNamePattern || '-- ?(.*)\n';
  options.testsGlobPattern = options.testsGlobPattern || '**/*';
  options.disablePrettyJson = options.disablePrettyJson || false;

  const testNamePattern = new RegExp(options.testNamePattern, 'g');
  const testsDir = getAbsolutePath(options.testsDir);
  const grammarFilePath = getAbsolutePath(options.grammarFile ? 
    options.grammarFile : 
    options.rawGrammarFile
  );

  const tmpfile = tmp.fileSync();

  const state = {
    grammar: null,
    tests: {}
  };

  if (options.grammarFile) {
    createGrammarWatcher(
      grammarFilePath, 
      updateGrammar
    );

    await updateGrammar();
  }

  if (options.rawGrammarFile) {
    createGrammarWatcher(
      grammarFilePath, 
      updateRawGrammar
    );

    await updateRawGrammar();
  }

  const testsDirGlobFilter = (file) => minimatch(file, options.testsGlobPattern);

  createWatcher(testsDir, async (file) => {
    await updateTest(file);
    await runTests();
  }, { filter: testsDirGlobFilter });

  await updateTests();
  await runTests();

  async function updateTests() {
    console.log('Reloading tests...');
    const files = await getTestFiles();

    await Promise.all(files.map((filePath) => {
      return updateTest(filePath)
    }));
  }
  
  async function updateTest(testPath) {
    const content = await readFile(testPath);
    state.tests[testPath] = parseTestFile(content);
  }

  async function getTestFiles() {
    return globp(options.testsGlobPattern, {
      nodir: true,
      cwd: testsDir,
      absolute: true
    });
  }

  async function globp(pattern, opts) {
    return new Promise((resolve, reject) => {
      glob(pattern, opts, (err, matches) => {
        if (err) return reject(err);
        resolve(matches);
      });
    });
  }
  
  function parseTestFile(fileContent) {
    const splits = fileContent.split(testNamePattern);  
    const tests = [];
  
    for (i = 0; i < splits.length - 1; i = i + 2) {
      let code = splits[i + 2];
      const name = splits[i + 1]
  
      if (code[0] === '\n') {
        code = code.slice(1, code.length);
      }
  
      if (code[code.length - 1 ] === '\n') {
        code = code.slice(0, code.length - 1);
      }
  
      tests.push({
        name,
        code
      });
    }
  
    return tests;
  }
  
  function updateGrammar() {
    console.log('Reloading grammar...');
    state.grammar = requireUncached(grammarFilePath);
  }
  
  function updateRawGrammar() {
    console.log('Reloading (raw) grammar...');
    execSync(`nearleyc ${grammarFilePath} -o ${tmpfile.name}`);
    state.grammar = requireUncached(tmpfile.name);
  }
  
  async function readFile(_path) {
    return fs.readFile(_path, 'utf8');
  }
  
  function runTests() {
    Object.keys(state.tests).forEach((testFileName) => {
      state.tests[testFileName].forEach((test) => {
        console.log(`\nRunning: ${test.name}`.yellow);
        const results = parseCode(test.code);
        console.log(displayJSON(results));
      });
    });
  }
  
  function createGrammarWatcher(_path, updateGrammar) {
    const dir = path.dirname(_path);
    const filename = path.basename(_path);
  
    const grammarFilter = (file) => {
      return file === _path;
    };

    return createWatcher(dir, async () => {
      updateGrammar();
      await runTests();
    }, {
      filter: grammarFilter
    });
  }
  
  function createWatcher(_path, cb, watchOpts = {}) {
    watch.createMonitor(_path, watchOpts, (monitor) => {
      monitor.on('changed', cb);
      monitor.on('created', cb);
      monitor.on('removed', cb);
    });
  }
  
  function getAbsolutePath(_path) {
    if(path.isAbsolute(_path)) {
      return _path;
    }
  
    return path.join(process.cwd(), _path);  
  }

  function parseCode(code) {
    const parser = new nearley.Parser(nearley.Grammar.fromCompiled(state.grammar))
  
    try {
      parser.feed(code);
    } catch (e) {
      console.log('FAILED!');
    }
  
    return parser.results;
  }

  function displayJSON(obj) {
    if (!options.disablePrettyJson) {
      return prettyjson.render(obj);    
    }

    return JSON.stringify(obj);    
  }

  // Require caches modules by default
  function requireUncached(mod){
    delete require.cache[require.resolve(mod)]
    return require(mod)
  }
}