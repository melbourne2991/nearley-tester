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
    state.grammar = require(grammarFilePath);
  }
  
  function updateRawGrammar() {
    console.log('Reloading grammar...');
    execSync(`nearleyc ${grammarFilePath} -o ${tmpfile.name}`);
    state.grammar = require(tmpfile.name);
  }
  
  async function readFile(_path) {
    return fs.readFile(_path, 'utf8');
  }
  
  function runTests() {
    Object.keys(state.tests).forEach((testFileName) => {
      state.tests[testFileName].forEach((test) => {
        console.log(`\nRunning: ${test.name}`.yellow);
        const results = parseCode(state.grammar, test.code);
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
      runTests();
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

  function parseCode(grammar, code) {
    const parser = new nearley.Parser(nearley.Grammar.fromCompiled(grammar))
  
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
}

// module.exports = function nearleyTester(options = {}) {
//   if (!options.grammarFile && !options.rawGrammarFile) {
//     throw new Error('Must provide a compiled grammar file or a raw grammar file');
//   }

//   options.directory = options.directory || path.join(process.cwd());
//   options.testNamePattern = options.testNamePattern || '--(.*)\n';

//   const testNamePattern = new RegExp(options.testNamePattern, 'g');
//   const pathToGrammar = getGrammarFilePath();
//   const grammar = require(pathToGrammar);

//   watchFiles(options.testsDir, readFile);

//   function readFile(filePath) {
//     if(!fs.lstatSync(filePath).isDirectory()) {
//       const file = fs.readFileSync(filePath, 'utf-8');
//       parseTests(file);
//     }
//   }

//   function watchFiles(dir, cb) {
//     watch.watchTree(dir, { interval: 1 }, (f, curr, prev) => {
//       if (typeof f === 'string') {
//         return cb(f);
//       }
    
//       Object.keys(f).forEach(cb);
//     });
//   }

//   function getGrammarFilePath(_path) {
//     if (options.grammarFile) {
//       if(path.isAbsolute(options.grammarFile)) {
//         return options.grammarFile
//       }
    
//       return path.join(process.cwd(), options.grammarFile);  
//     }

//     const tmpfile = tmp.fileSync();
//     execSync(`nearleyc ${options.rawGrammarFile} -o ${tmpfile.name}`);
//     return tmpfile.name;
//   }

//   function parseTests(file) {
//     const splits = file.split(testNamePattern);
  
//     for (i = 0; i < splits.length - 1; i = i + 2) {
//         let code = splits[i + 2];
//         const name = splits[i + 1]
  
//         if (code[0] === '\n') {
//           code = code.slice(1, code.length);
//         }
  
//         if (code[code.length - 1 ] === '\n') {
//           code = code.slice(0, code.length - 1);
//         }
  
//         console.log(`Testing: ${name}\n`);
//         const results = parseIt(code);
//         console.log(`Results:\n${prettyjson.render(results)}\n`);
//     }
//   }
  
//   function parseIt(code) {
//     const parser = new nearley.Parser(nearley.Grammar.fromCompiled(grammar))
  
//     try {
//       parser.feed(code);
//     } catch (e) {
//       console.log('FAILED!');
//     }
  
//     return parser.results;
//   }
// }

