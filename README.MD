# nearley-tester

A cli tool to help prototyping / testing [nearleyjs](https://github.com/Hardmath123/nearley) parsers.
Nearley is pretty cool but I found it lacking in utilities for developing the parser. There's a really nice [playground](https://omrelli.ug/nearley-playground/) but I wanted something I could run locally so I made this.

It basically takes your grammar.ne file or the compiled parser js and runs the "tests" through the parser outputting the results. It also watches for changes and automatically reruns the tests for you.

Test files are just files which contain delimitters for each test.

## Example

Give we have this test file `./tests/index.test`:

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

And our grammer file `./grammer.ne`:

```
@builtin "whitespace.ne"

@{%
const append = (a, b) => (d) => d[a].concat([d[b]]);
%}

FunctionDeclaration -> "func" _ Name _ Args _ "end" {% (d) => ({
  name: d[2],
  args: d[4]
}) %}

Args -> "(" _ ")"
  | "(" _ ArgsList _ ")" {% (d) => d[2] %}

ArgsList -> Name
  | ArgsList _ "," _ Name {% append(0, 4) %}

Name -> _name {% id %}

_name -> [a-zA-Z_] {% id %}
  | _name [a-zA-Z_] {% (d) => d[0] + d[1] %}

```

Then running `nearley-tester -r grammer.ne ./tests/**/*` gives us the follwing output:

```
Running: Test 1
- 
  name: testa
  args: 
    - test
    - another
    - something

Running: Test 2
- 
  name: testb
  args: 
    - test
    - another
    - something

Running: Test 3
- 
  name: testc
  args: 
    - test
    - another
    - something

```


## Usage

Requires a recent version of node to run - tested with v8.7.0.
Nearley is a peer dependency and must be installed separately (tested with `^2.15.1`)

`npm install -g nearley-tester`

Options etc below:

```
  Usage: nearley-tester [options] <tests-dir>


  Options:

    -V, --version                       output the version number
    -p, --tests-glob-pattern <pattern>  Glob pattern for test files eg: "**/*.test"
    -r, --raw-grammar <file>            Raw grammar file (eg: grammar.ne)
    -g, --grammar <file>                Compiled grammar file (eg: grammar.js)
    -tp, --test-name-pattern <pattern>  Pattern for test names / test delimitter, defaults to "-- ?(.*)\n"
    -dpj, --disable-pretty-json         Flag for pretty json, defaults to false
    -h, --help                          output usage information
```