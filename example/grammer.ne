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
