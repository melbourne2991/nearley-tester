const fs = require("fs-extra");
const nearley = require("nearley");
const path = require("path");
const tmp = require("tmp");
const { execSync } = require("child_process");
const prettyjson = require("prettyjson");
const glob = require("glob");
const Watchpack = require("watchpack");
const clearRequire = require("clear-require");

module.exports = (...args) => {
  return nearleyTester(...args).catch(console.log);
};

async function nearleyTester(options = {}) {
  if (!options.grammarFile && !options.rawGrammarFile) {
    throw new Error(
      "Must provide a compiled grammar file or a raw grammar file"
    );
  }

  if (!options.testsGlobPattern) {
    throw new Error("Must provide a glob pattern for tests");
  }

  options.testNamePattern = options.testNamePattern || "-- ?(.*)\n";
  options.disablePrettyJson = options.disablePrettyJson || false;

  const testNamePattern = new RegExp(options.testNamePattern, "g");

  const grammarFilePath = getAbsolutePath(
    options.grammarFile ? options.grammarFile : options.rawGrammarFile
  );

  const wp = new Watchpack();

  // clean up on uncaught exceptions
  tmp.setGracefulCleanup();

  const tmpfile = tmp.fileSync({
    // so that node_modules resolves relative to grammar source.
    dir: path.dirname(grammarFilePath),
    postfix: ".js",
    prefix: "tmp-parser-"
  });

  // handle ctrl-c gracefully
  process.on("SIGINT", () => {
    process.exit();
  });

  const state = {
    grammar: null,
    tests: {},
    watchFiles: []
  };

  const testFiles = await getFilesFromGlob(options.testsGlobPattern);
  const grammarUpdater = options.grammarFile ? updateGrammar : updateRawGrammar;

  createGrammarWatcher(grammarFilePath, grammarUpdater);
  grammarUpdater();

  if (options.watchGlobPatterns) {
    const files = await getFilesFromGlobs(options.watchGlobPatterns);
    createWatcher(files, async () => {
      grammarUpdater();
      await runTests();
    });
  }

  createWatcher(testFiles, async file => {
    await updateTest(file);
    await runTests();
  });

  await updateTests();
  await runTests();

  startWatchers();

  async function updateTests() {
    console.log("Reloading tests...");

    await Promise.all(
      testFiles.map(filePath => {
        return updateTest(filePath);
      })
    );
  }

  async function updateTest(testPath) {
    const content = await readFile(testPath);
    state.tests[testPath] = parseTestFile(content);
  }

  async function getFilesFromGlobs(patterns) {
    const files = [];

    const arr = await Promise.all(
      patterns.map(pattern => {
        return getFilesFromGlob(pattern);
      })
    );

    arr.forEach(_files => {
      files.push(..._files);
    });

    return files;
  }

  async function getFilesFromGlob(pattern) {
    return globp(pattern, {
      nodir: true,
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
      const name = splits[i + 1];

      if (code[0] === "\n") {
        code = code.slice(1, code.length);
      }

      if (code[code.length - 1] === "\n") {
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
    console.log("Reloading grammar...");
    state.grammar = requireUncached(grammarFilePath);
  }

  function updateRawGrammar() {
    console.log("Reloading (raw) grammar...");
    execSync(`nearleyc ${grammarFilePath} -o ${tmpfile.name}`);
    state.grammar = requireUncached(tmpfile.name);
  }

  async function readFile(_path) {
    return fs.readFile(_path, "utf8");
  }

  function runTests() {
    Object.keys(state.tests).forEach(testFileName => {
      state.tests[testFileName].forEach(test => {
        console.log(`\nRunning: ${test.name}`);
        const results = parseCode(test.code);
        console.log(displayJSON(results));
      });
    });
  }

  function createGrammarWatcher(_path, updateGrammar) {
    const handleWatch = async () => {
      updateGrammar();
      await runTests();
    };

    return createWatcher(_path, () => {
      handleWatch().catch(console.log);
    });
  }

  function createWatcher(_paths, cb, watchOpts = {}) {
    if (!Array.isArray(_paths)) {
      _paths = [_paths];
    }

    state.watchFiles.push(..._paths);

    wp.on("change", file => {
      if (_paths.find(p => p === file)) {
        cb(file);
      }
    });
  }

  function startWatchers() {
    wp.watch(state.watchFiles, [], Date.now());
  }

  function getAbsolutePath(_path) {
    if (path.isAbsolute(_path)) {
      return _path;
    }

    return path.join(process.cwd(), _path);
  }

  function parseCode(code) {
    const parser = new nearley.Parser(
      nearley.Grammar.fromCompiled(state.grammar)
    );

    try {
      parser.feed(code);
    } catch (e) {
      console.log("Parse failed");
      console.log(e);

      return null;
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
  function requireUncached(mod) {
    // delete require.cache[require.resolve(mod)]
    clearRequire.all();
    return require(mod);
  }

  function runScript() {}
}

// windows support for SIGINT
if (process.platform === "win32") {
  const rl = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.on("SIGINT", function() {
    process.emit("SIGINT");
  });
}
