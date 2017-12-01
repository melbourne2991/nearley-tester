# nearley-tester

A cli tool to help prototyping / testing [nearleyjs](https://github.com/Hardmath123/nearley) parsers.
Nearley is pretty cool but I found it lacking in utilities for developing the parser. There's a really nice [playground](https://omrelli.ug/nearley-playground/) but I wanted something I could run locally so I made this.

It basically takes the grammar file (either the raw .ne one, in which case it will use the globally installed nearleyc to generate the intermediary compiled output) or the compiled parser js.

Test files are just files which contain delimitters for each test, eg:

```
-- Test 1
func testa (test, another, something)

end
-- Test 2
func testb (test, another, something)

end
-- Test 3
func testc (test, another, something)

end
```

## Usage

Requires a recent version of node to run - tested with v8.7.0.

`npm install @melb2991/nearley-tester`

Options etc below:

```
  Usage: nearley-tester [options] <tests-dir>


  Options:

    -V, --version                       output the version number
    -p, --tests-glob-pattern <pattern>  Glob pattern for test files eg: "**/*.test"
    -r, --raw-grammar <file>            Raw grammar file (eg: grammar.ne)
    -g, --grammar <file>                Compiled grammar file (eg: grammar.js)
    -tp, --test-name-pattern <pattern>  Pattern for test names / test delimitter, defaults to "**/*"
    -dpj, --disable-pretty-json         Flag for pretty json, defaults to false
    -h, --help                          output usage information
```