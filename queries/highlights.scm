; Includes

[
  "package"
  "import"
] @include

; Namespaces

(package_identifier) @namespace

(import_spec ["." "_"] @punctuation.special)

[
  (attr_path)
  (package_path)
] @text.uri ;; In attributes

; Attributes

(attribute) @attribute

; Conditionals

[
  "if"
  "else"
  "otherwise"
  "fallback"
] @conditional

; Repeats

[
  "for"
] @repeat

(for_clause "_" @punctuation.special)

; Keywords

[
  "let"
  "try"
] @keyword

"func" @keyword.function

[
  "in"
] @keyword.operator

; Operators

[
  "+"
  "-"
  "*"
  "/"
  "|"
  "&"
  "||"
  "&&"
  "=="
  "!="
  "<"
  "<="
  ">"
  ">="
  "=~"
  "!~"
  "!"
  "="
  "~"
  "->"
] @operator

; Fields & Properties

(field
  (label
  (identifier) @field))

(selector_expression
  (_)
  (identifier) @property)

; Functions

(call_expression
  function: (identifier) @function.call)
(call_expression
  function: (selector_expression
  (_)
  (identifier) @function.call))
(call_expression
  function: (builtin_function) @function.call)

(builtin_function) @function.builtin

; Variables

(identifier) @variable

; Parameters, after variables, since a later pattern takes precedence

(parameter
  name: (identifier) @parameter)

(labeled_argument
  label: (identifier) @parameter)

((identifier) @variable.builtin
  (#any-of? @variable.builtin "self" "__self"))

(call_expression
  function: (identifier) @function.builtin
  (#eq? @function.builtin "validator"))

; Types

(primitive_type) @type.builtin

((identifier) @type
  (#match? @type "^(#|_#)"))

[
  (slice_type)
  (pointer_type)
] @type ;; In attributes

; Punctuation

[
  ","
  ":"
] @punctuation.delimiter

[ "{" "}" ] @punctuation.bracket

[ "[" "]" ] @punctuation.bracket

[ "(" ")" ] @punctuation.bracket

[ "<" ">" ] @punctuation.bracket

[
  (ellipsis)
  "?"
  "!"
] @punctuation.special

(list_lit "#" @punctuation.special)

(struct_lit "#" @punctuation.special)

(spread_expression "..." @operator)

; Literals

(string) @string

[
  (escape_char)
  (escape_unicode)
] @string.escape

(number) @number

(float) @float

(multiplier) @symbol

(boolean) @boolean

[
  (null)
  (top)
  (bottom)
] @constant.builtin

; Interpolations

(interpolation "\\(" @punctuation.special (_) ")" @punctuation.special) @none

(interpolation "\\(" (identifier) @variable ")")

; Comments

(comment) @comment @spell

; Errors

(ERROR) @error
