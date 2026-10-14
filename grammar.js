/**
 * @file Cue grammar for tree-sitter
 * @author Jean-Philippe Braun <eon@patapon.info>
 * @author Amaan Qureshi <amaanq12@gmail.com>
 * @license MIT
 * @see {@link https://cuelang.org|official website}
 * @see {@link https://github.com/cue-lang/cue/blob/master/doc/ref/spec.md|official syntax spec}
 */

// deno-lint-ignore-file ban-ts-comment
/* eslint-disable arrow-parens */
/* eslint-disable camelcase */
/* eslint-disable-next-line spaced-comment */
/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

/**
 * Creates a rule to match one or more of the rules separated by the separator
 * and optionally adds a trailing separator (default is false).
 *
 * @param {Rule} rule
 * @param {string} separator - The separator to use.
 * @param {boolean?} trailing_separator - Whether to allow a trailing separator or not.
 *
 * @return {SeqRule}
 *
 */
function listSeq(rule, separator, trailing_separator = false) {
  return trailing_separator ?
    seq(rule, repeat(seq(separator, rule)), optional(separator)) :
    seq(rule, repeat(seq(separator, rule)));
}

/**
 * Creates a rule to match one or more of the rules separated by a comma
 *
 * @param {Rule} rule
 * @param {boolean?} trailing_separator - Whether to allow a trailing separator or not.
 *
 * @return {SeqRule}
 */
function commaSep1(rule, trailing_separator = false) {
  return listSeq(rule, ',', trailing_separator);
}

/**
 * Creates a rule to optionally match one or more of the rules separated by a comma
 *
 * @param {Rule} rule
 * @param {boolean?} trailing_separator - Whether to allow a trailing separator or not.
 *
 * @return {ChoiceRule}
 *
 */
function commaSep(rule, trailing_separator = false) {
  return optional(commaSep1(rule, trailing_separator));
}

/**
 * Creates a rule to match one or more of the rules optionally separated by a comma
 *
 * @param {Rule} rule
 *
 * @return {SeqRule}
 *
 */
function optionalCommaSep1(rule) {
  return seq(rule, repeat(seq(optional(','), rule)), optional(','));
}

/**
 * Creates a rule to optionally match one or more of the rules optionally separated by a comma
 *
 * @param {Rule} rule
 *
 * @return {ChoiceRule}
 *
 */
function optionalCommaSep(rule) {
  return optional(optionalCommaSep1(rule));
}

const PREC = {
  bitwise_or: 1,
  bitwise_and: 2,
  or: 3,
  and: 4,
  compare: 5,
  add: 6,
  multiply: 7,
  unary: 8,
  call: 9,
};

const primitive_types = [
  'number',
  'float',
  'float32',
  'float64',
  'uint',
  'uint8',
  'uint16',
  'uint32',
  'uint64',
  'uint128',
  'int',
  'int8',
  'int16',
  'int32',
  'int64',
  'int128',
  'string',
  'bytes',
  'bool',
  'rune',
];

module.exports = grammar({
  name: 'cue',

  extras: $ => [
    $.comment,
    /\s/,
  ],

  externals: $ => [
    $._multi_str_content,
    $._multi_bytes_content,
    $._raw_str_content,
    $._raw_bytes_content,
    $._multi_raw_str_content,
    $._multi_raw_bytes_content,
    $._raw_str_start,
    $._raw_bytes_start,
    $._multi_raw_str_start,
    $._multi_raw_bytes_start,
    $._raw_end,
    $._raw_interpolation_start,
    $._closed_hash,
    $._spread_int,
    $.multiplier,
    $._line_start,
    $._error_sentinel,
  ],

  inline: $ => [
    $.keyword_identifier,
  ],

  supertypes: $ => [
    $.expression,
    $.primary_expression,
    $.literal,
  ],

  conflicts: $ => [
    [$._embedding, $._label_alias_expr],
    [$._label_name, $.primary_expression],
    [$._label_name, $.string],
    [$.comprehension],
    [$._label_name, $._keyword_reference],
    [$._keyword_reference, $.try_clause],
    [$._keyword_reference, $.guard_clause],
    [$._keyword_reference, $.for_clause],
    [$._keyword_reference, $.let_clause],
    [$._label_name, $._keyword_reference, $.guard_clause],
    [$.primary_expression, $.parameter],
    [$._attr_item],
  ],

  word: $ => $.identifier,

  rules: {
    source_file: $ => prec(1, seq(
      optionalCommaSep($.attribute),
      optional(seq(
        $.package_clause,
        // Attributes between the package clause and the imports are file
        // attributes.
        optionalCommaSep($.attribute),
      )),
      optionalCommaSep($.import_declaration),
      optionalCommaSep($._declaration),
    )),

    _package_identifier: $ => alias($.identifier, $.package_identifier),

    package_clause: $ => seq(
      'package',
      $._package_identifier,
    ),

    import_declaration: $ => seq(
      'import',
      choice(
        $.import_spec,
        $.import_spec_list,
      ),
    ),

    import_spec: $ => seq(
      optional(field('name', choice(
        '.',
        '_',
        $._package_identifier,
      ))),
      field('path', $.string),
    ),

    import_spec_list: $ => seq(
      '(',
      optionalCommaSep($.import_spec),
      ')',
    ),

    identifier: _ => token(choice(
      seq(
        optional(choice('_#', '#', '_')),
        choice(/\p{L}/, '$', '_'),
        repeat(choice(/\p{L}/, '$', '_', /[0-9]/)),
      ),
      choice('_#', '#', '_'),
    )),
    keyword_identifier: $ => prec(-3, alias(
      choice(
        'let',
        'if',
        'for',
        'else',
        'otherwise',
        'fallback',
        'try',
        'func',
        ...primitive_types,
      ),
      $.identifier,
    )),

    attribute: $ => seq(
      '@',
      field('name', $.identifier),
      '(',
      optional(choice(',', '-')),
      repeat($._attr_group),
      ')',
    ),
    // Brackets nest in the body of an attribute, as in @foo((x)),
    // @foo(a=b(c)) and @foo(a=[1, 2]). Only (), [] and {} nest, as in CUE:
    // < and > are ordinary characters, as in @test(eq, <4).
    _attr_group: $ => prec.right(choice(
      $._attr_item,
      ',',
      prec.right(seq('=', optional(choice($._attr_item, $.attr_path, $._attr_brackets)))),
      $._attr_brackets,
    )),

    _attr_brackets: $ => prec.right(choice(
      seq('(', repeat($._attr_group), ')'),
      seq('[', repeat($._attr_group), ']'),
      seq('{', repeat($._attr_group), '}'),
    )),

    _attr_item: $ => choice(
      $.string,
      $.number,
      $.float,
      $.si_unit,
      $.boolean,
      $.null,
      $.top,
      $.bottom,
      $.primitive_type,
      seq('[', ']', alias($._attr_item, $.slice_type)),
      // A * may stand alone, as in @foo(*[1] | [2]).
      seq('*', optional(prec.dynamic(1, alias($._attr_item, $.pointer_type)))),
      $.package_path,
      $.identifier,
      prec(-1, /[^0-9_]/),
    ),
    attr_path: _ => /(?:\/[\p{L}\d\.]+)*[\p{L}\d\.]+(?:\/[\p{L}\d\.]+)*(?:\/)?/,
    package_path: $ => seq($.identifier, repeat1(seq('.', $.identifier))),

    builtin_function: _ => choice(
      'len',
      'close',
      'and',
      'or',
      'div',
      'mod',
      'quo',
      'rem',
      'matchN',
      'matchIf',
      'error',
    ),

    _declaration: $ => prec(-1, choice(
      $.attribute,
      $.field,
      $.ellipsis,
      $._embedding,
      $.let_clause,
    )),

    _list_elem: $ => prec.right(choice(
      $.ellipsis,
      seq(
        $._embedding,
        optional(repeat(seq(',', $._embedding))),
        optional(seq(',', $.ellipsis)),
        optional(','),
      ),
    )),

    // A '#' directly before the opening bracket or brace makes the list or
    // struct closed, as in #[1, 2] and #{a: 1}.
    // A list may start with the '[' that directly follows a word, as in
    // if[x][0] {...}, where the guard of a comprehension and an index on a
    // reference to if both begin; the clause wins.
    list_lit: $ => seq(optional($._closed), choice('[', token.immediate('[')), repeat($._list_elem), ']'),

    struct_lit: $ => seq(
      optional($._closed),
      '{',
      optionalCommaSep($._declaration),
      '}',
    ),

    _closed: $ => alias($._closed_hash, '#'),

    ellipsis: $ => prec.left(seq(
      '...',
      optional($.expression),
    )),

    _embedding: $ => choice(
      $.comprehension,
      $._alias_expr,
    ),

    _label_name: $ => choice(
      prec.dynamic(1, $.identifier),
      prec(1, $.keyword_identifier),
      prec(1, alias($.primitive_type, $.identifier)),
      prec(1, alias($.builtin_function, $.identifier)),
      prec(1, alias(choice('null', 'true', 'false', '_'), $.identifier)),
      prec.dynamic(1, alias($._simple_string_lit, $.string)),
      prec.dynamic(1, alias($._simple_raw_string_lit, $.string)),
      prec.dynamic(1, $.selector_expression),
      prec.dynamic(1, alias($.parenthesized_expression, $.dynamic)),
    ),

    _label_alias_expr: $ => alias($._alias_expr, $.optional),

    // A postfix alias comes before the optional or required marker, as in
    // a~(X)?: int.
    required: $ => seq($._label_name, optional($.postfix_alias), '!'),

    optional: $ => seq($._label_name, optional($.postfix_alias), '?'),

    _label_expr: $ => choice(
      seq($._label_name, optional($.postfix_alias)),
      $.optional,
      $.required,
      seq(choice('[', token.immediate('[')), $._label_alias_expr, ']', optional($.postfix_alias)),
    ),

    label: $ => seq(
      optional(seq(
        field('alias', choice($.identifier, $.keyword_identifier)),
        '=',
      )),
      $._label_expr,
    ),

    postfix_alias: $ => seq(
      '~',
      choice(
        field('field', $.identifier),
        seq('(', field('field', $.identifier), ')'),
        seq('(', field('label', $.identifier), ',', field('field', $.identifier), ')'),
      ),
    ),

    field: $ => prec.right(seq(
      repeat1(seq($.label, ':')),
      $._value,
      repeat($.attribute),
    )),

    _value: $ => alias($._alias_expr, $.value),

    // if, for and let may also be references followed by the next
    // declaration, as in if and then b: 1 on the next line, so the parser
    // keeps both readings until a token decides, as for try.
    for_clause: $ => prec(-3, seq(
      'for',
      choice($.identifier, '_'),
      optional(seq(',', choice($.identifier, '_'))),
      'in', $.expression,
    )),

    guard_clause: $ => prec(-3, seq('if', field('condition', $.expression))),

    let_clause: $ => prec(-3, seq('let', field('left', $.identifier), '=', field('right', $.expression))),

    _clause: $ => choice($.for_clause, $.guard_clause, $.let_clause, $.try_clause),

    // try may also be a reference followed by the next declaration, as in
    // try and then b: 1 on the next line, so the parser keeps both readings
    // until a token decides.
    try_clause: $ => prec(-3, seq(
      'try',
      optional(seq(field('left', choice($.identifier, '_')), '=', field('right', $.expression))),
    )),

    // A word after the struct may start an else clause or, when CUE ends
    // the comprehension at a newline, the label of the next field, so the
    // parser keeps both readings until the next token decides.
    comprehension: $ => seq(
      choice($.for_clause, $.guard_clause, $.try_clause),
      repeat(seq(optional(','), $._clause)),
      $.struct_lit,
      optional($.else_clause),
    ),

    else_clause: $ => seq(choice('else', 'otherwise', 'fallback'), $.struct_lit),

    _alias_expr: $ => seq(
      optional(seq(field('alias', $.identifier), '=')),
      $.expression,
    ),

    expression: $ => prec.left(choice(
      $.primary_expression,
      $.unary_expression,
      $.binary_expression,
    )),

    primary_expression: $ => choice(
      $.function,
      $._keyword_reference,
      $._builtin_reference,
      $.parenthesized_expression,
      $.selector_expression,
      $.index_expression,
      $.call_expression,
      $.postfix_expression,
      $.spread_expression,
      $.identifier,
      $.literal,
    ),

    postfix_expression: $ => prec(PREC.call, seq(
      $.primary_expression,
      '?',
    )),

    // The spread operator, as in #A...: the ellipsis directly follows its
    // operand. An ellipsis after whitespace, such as one on its own line in
    // a struct, is a separate declaration. The external scanner recognizes
    // an integer operand, as in 1..., which would otherwise lex as the float
    // 1. followed by "..".
    spread_expression: $ => prec(PREC.call, seq(
      choice($.primary_expression, alias($._spread_int, $.number)),
      token.immediate('...'),
    )),

    binary_expression: $ => {
      const table = [
        ['+', PREC.add],
        ['-', PREC.add],
        ['*', PREC.multiply],
        ['/', PREC.multiply],
        ['|', PREC.bitwise_or],
        ['&', PREC.bitwise_and],
        ['||', PREC.or],
        ['&&', PREC.and],
        [choice('==', '=~', '!~', '!=', '<', '<=', '>', '>='), PREC.compare],
      ];

      // @ts-ignore
      return choice(...table.map(([operator, precedence]) => prec.left(precedence, seq(
        field('left', $.expression),
        // @ts-ignore
        field('operator', operator),
        field('right', $.expression),
      ))));
    },

    unary_expression: $ => {
      const unary_operators = ['+', '-', '!', '*', '==', '!=', '<', '<=', '>', '>=', '=~', '!~'];

      // The external scanner marks an operator at the start of a line, which
      // CUE reads as unary, so that it does not continue the line before.
      return choice(...unary_operators.map((operator) => prec(PREC.unary, seq(
        optional($._line_start),
        field('operator', operator),
        field('argument', $.expression),
      ))));
    },

    // A keyword used as a reference, as in x: otherwise or x: if, outside
    // the construct the keyword starts. Where the keyword can also start a
    // clause, as otherwise and a struct after a comprehension, or if, for
    // and let at the start of a declaration, the parser prefers the clause.
    _keyword_reference: $ => prec(-3, prec.dynamic(-1, alias(
      choice('func', 'otherwise', 'fallback', 'try', 'else', 'if', 'for', 'let'),
      $.identifier,
    ))),

    // The name of a builtin function used as a reference, as in x: len,
    // rather than called.
    _builtin_reference: $ => alias($.builtin_function, $.identifier),

    // A parenthesized expression may start with the '(' that directly
    // follows a word, as in if(x) {...}, where the guard of a comprehension
    // and a call of a reference to if both begin; the clause wins.
    parenthesized_expression: $ => seq(choice('(', token.immediate('(')), $.expression, ')'),

    // A function literal, as in func(a: int) -> int: a + 1, or a function
    // type, as in func(int) -> int.
    function: $ => prec.right(seq(
      'func',
      $.parameters,
      optional(choice(
        seq(
          '->',
          field('result', $.expression),
          optional(seq(':', field('body', $.expression))),
        ),
        seq(':', field('body', $.expression)),
      )),
    )),

    // A trailing ellipsis makes the signature open, as in func(int, ...).
    // The parameters directly follow func, as cue fmt writes them, so that
    // a dynamic label such as (k) on the line after a reference to func is
    // not taken as parameters.
    parameters: $ => seq(
      token.immediate('('),
      commaSep(choice($.parameter, $.ellipsis), true),
      ')',
    ),

    parameter: $ => seq(
      optional(choice(
        seq(
          field('name', $.identifier),
          optional($.postfix_alias),
          optional(choice('?', '!')),
          ':',
        ),
        // An anonymous parameter, as in _~x: int, cannot be optional or
        // required.
        seq(
          field('name', alias('_', $.identifier)),
          optional($.postfix_alias),
          ':',
        ),
      )),
      field('type', $.expression),
      optional(seq('=', field('default', $.expression))),
      repeat($.attribute),
    ),

    // A call applies to any operand, as in f(1), int(1) and [1](0),
    // including a keyword used as a reference, as in otherwise(1). func(
    // starts a function literal instead.
    call_expression: $ => prec(PREC.call, seq(
      field('function', choice(
        $.builtin_function,
        $.primary_expression,
      )),
      $.arguments,
    )),

    // A selector or an index binds tighter than the end of a function's
    // body or result, as in func(s: int): s.x.
    index_expression: $ => prec(PREC.call, seq(
      $.primary_expression,
      token.immediate('['),
      field('index', $.expression),
      optional(','),
      ']',
    )),

    selector_expression: $ => prec(PREC.call, seq(
      $.primary_expression,
      '.',
      choice($.identifier, alias($._simple_string_lit, $.string)),
    )),

    // A trailing ellipsis applies a function partially, as in f(1, ...).
    // The arguments directly follow the function, as cue fmt writes them,
    // so that a dynamic label such as (k) on the next line is not taken as
    // a call.
    arguments: $ => seq(
      token.immediate('('),
      commaSep(optional(choice($.expression, $.labeled_argument, $.ellipsis))),
      ')',
    ),

    labeled_argument: $ => seq(
      field('label', $.identifier),
      ':',
      field('value', $.expression),
    ),

    literal: $ =>
      choice(
        $.struct_lit,
        $.list_lit,
        $.string,
        $.number,
        $.float,
        $.si_unit,
        $.boolean,
        $.null,
        $.top,
        $.bottom,
        $.primitive_type,
      ),

    primitive_type: _ => choice(...primitive_types),

    top: _ => '_',

    bottom: _ => '_|_',

    boolean: _ => choice('true', 'false'),

    null: _ => 'null',

    // A number has no sign: -1 is a unary expression, as in CUE.
    number: _ => {
      const binary_literal = seq(
        /0[bB]_?/,
        /[01](_?[01])*/,
      );

      const hex_literal = seq(
        /0[xX]_?/,
        /[\da-fA-F](_?[\da-fA-F])*/,
      );

      const octal_literal = seq(
        /0[oO]_?/,
        /[0-7](_?[0-7])*/,
      );

      const decimal_digits = /\d(_?\d)*/;

      const decimal_integer_literal = choice(
        '0',
        seq(optional('0'), /[1-9]/, optional(seq(optional('_'), decimal_digits))),
      );

      const decimal_literal = choice(
        decimal_integer_literal,
        decimal_digits,
      );


      return token(choice(
        hex_literal,
        binary_literal,
        decimal_literal,
        octal_literal,
      ));
    },

    float: _ => {
      const hex_digit = /[0-9a-fA-F]/;
      const hex_digits = seq(hex_digit, repeat(seq(optional('_'), hex_digit)));

      const decimal_digits = /\d(_?\d)*/;

      const decimal_exponent = seq(choice('e', 'E'), optional(choice('+', '-')), decimal_digits);

      const decimal_float_literal = choice(
        seq(optional(decimal_digits), '.', optional(decimal_digits), optional(decimal_exponent)),
        seq(decimal_digits, decimal_exponent),
      );

      const hex_exponent = seq(choice('p', 'P'), optional(choice('+', '-')), decimal_digits);
      const hex_mantissa = choice(
        seq(optional('_'), hex_digits, '.', optional(hex_digits)),
        seq(optional('_'), hex_digits),
        seq('.', hex_digits),
      );
      const hex_float_literal = seq('0', choice('x', 'X'), hex_mantissa, hex_exponent);

      return token(choice(decimal_float_literal, hex_float_literal));
    },

    // A number with a multiplier, as in 1Ki and 1.5G. The external scanner
    // recognizes the multiplier only directly after the number, so that a
    // label on the next line, such as Pi, is not taken as one.
    si_unit: $ => seq(
      choice($.float, $.number),
      field('unit', $.multiplier),
    ),

    escape_char: _ => token.immediate(seq(
      '\\',
      repeat('#'),
      seq(choice('a', 'b', 'f', 'n', 'r', 't', 'v', '/', '\\', '\'', '"')),
    )),

    escape_byte: _ => token.immediate(seq(
      '\\',
      repeat('#'),
      choice(
        /[0-7]{3}/, // octal byte value
        /x[0-9a-fA-F]{2}/, // hex byte value
      ),
    )),

    _escape_unicode: $ => choice(
      $.escape_char,
      alias(token.immediate(seq(
        '\\',
        repeat('#'),
        choice(
          /u[0-9a-fA-F]{4}/,
          /U[0-9a-fA-F]{8}/,
        ))),
      $.escape_unicode,
      ),
    ),

    // In a multiline literal, a backslash at the end of a line escapes the
    // newline.
    _escape_newline: _ => token.immediate(seq('\\', repeat('#'), /\r?\n/)),

    string: $ => choice(
      $._simple_string_lit,
      $._simple_bytes_lit,
      $._multiline_string_lit,
      $._multiline_bytes_lit,
      $._simple_raw_string_lit,
      $._simple_raw_bytes_lit,
      $._multiline_raw_string_lit,
      $._multiline_raw_bytes_lit,
    ),

    _simple_string_lit: $ => seq(
      '"',
      repeat(choice(
        token.immediate(prec(1, /[^"\n\\]+/)),
        $.interpolation,
        $._escape_unicode,
      )),
      '"',
    ),

    _simple_bytes_lit: $ => seq(
      '\'',
      repeat(choice(
        token.immediate(prec(1, /[^'\n\\]+/)),
        $.interpolation,
        $.escape_byte,
        $._escape_unicode,
      )),
      '\'',
    ),

    _multiline_string_lit: $ => seq(
      token('"""'),
      repeat(choice(
        $._multi_str_content,
        $.interpolation,
        $._escape_unicode,
        alias($._escape_newline, $.escape_char),
      )),
      token('"""'),
    ),

    _multiline_bytes_lit: $ => seq(
      token('\'\'\''),
      repeat(choice(
        $._multi_bytes_content,
        $.interpolation,
        $.escape_byte,
        $._escape_unicode,
        alias($._escape_newline, $.escape_char),
      )),
      token('\'\'\''),
    ),

    // Raw literals take any number of '#'; the external scanner matches the
    // delimiters, which keep the names of their one-'#' forms.
    _simple_raw_string_lit: $ => seq(
      alias($._raw_str_start, '#"'),
      repeat(choice(
        $._raw_str_content,
        $.raw_interpolation,
        $._escape_unicode,
      )),
      alias($._raw_end, '"#'),
    ),

    _simple_raw_bytes_lit: $ => seq(
      alias($._raw_bytes_start, '#\''),
      repeat(choice(
        $._raw_bytes_content,
        $.raw_interpolation,
        $.escape_byte,
        $._escape_unicode,
      )),
      alias($._raw_end, '\'#'),
    ),

    _multiline_raw_string_lit: $ => seq(
      alias($._multi_raw_str_start, '#"""'),
      repeat(choice(
        $._multi_raw_str_content,
        $.raw_interpolation,
        $._escape_unicode,
        alias($._escape_newline, $.escape_char),
      )),
      alias($._raw_end, '"""#'),
    ),

    _multiline_raw_bytes_lit: $ => seq(
      alias($._multi_raw_bytes_start, '#\'\'\''),
      repeat(choice(
        $._multi_raw_bytes_content,
        $.raw_interpolation,
        $.escape_byte,
        $._escape_unicode,
        alias($._escape_newline, $.escape_char),
      )),
      alias($._raw_end, '\'\'\'#'),
    ),

    interpolation: $ => seq('\\(', $.expression, ')'),

    raw_interpolation: $ => seq(alias($._raw_interpolation_start, '\\#('), $.expression, ')'),

    comment: _ => token(seq('//', /.*/)),
  },
});

module.exports.PREC = PREC;
