#include "tree_sitter/alloc.h"
#include "tree_sitter/parser.h"

#include <stdint.h>
#include <wctype.h>

enum TokenType {
  MULTI_STR_CONTENT,
  MULTI_BYTES_CONTENT,
  RAW_STR_CONTENT,
  RAW_BYTES_CONTENT,
  MULTI_RAW_STR_CONTENT,
  MULTI_RAW_BYTES_CONTENT,
  RAW_STR_START,
  RAW_BYTES_START,
  MULTI_RAW_STR_START,
  MULTI_RAW_BYTES_START,
  RAW_END,
  RAW_INTERPOLATION_START,
  CLOSED_HASH,
  ERROR_SENTINEL,
};

// A raw string is delimited by one or more '#' characters, as in
// ##"a"#b"##. Its escapes and interpolations take the same number of '#',
// as in \##(x). Interpolations can contain further raw strings, so the
// scanner keeps a stack of the raw strings that are open.
typedef struct {
  uint8_t hashes;
  char quote;
  bool multiline;
} RawString;

#define MAX_DEPTH 255

typedef struct {
  RawString stack[MAX_DEPTH];
  unsigned depth;
} Scanner;

static void advance(TSLexer *lexer) { lexer->advance(lexer, false); }

static void skip(TSLexer *lexer) { lexer->advance(lexer, true); }

// scan_multiline scans the content of a multiline string or bytes literal
// without '#' delimiters, stopping before an interpolation, an escaped
// newline, or the closing quotes.
static bool scan_multiline(TSLexer *lexer, int c) {
  bool has_content = false;
  if (c == '"') {
    lexer->result_symbol = MULTI_STR_CONTENT;
  } else if (c == '\'') {
    lexer->result_symbol = MULTI_BYTES_CONTENT;
  }

  while (true) {
    switch (lexer->lookahead) {
    case '\'':
    case '"':
      lexer->mark_end(lexer);
      advance(lexer);
      if (lexer->lookahead == c) {
        advance(lexer);
        if (lexer->lookahead == c) {
          return has_content;
        }
      }
      break;
    case '\\':
      lexer->mark_end(lexer);
      advance(lexer);
      if (lexer->lookahead == '(' || lexer->lookahead == '\n' ||
          lexer->lookahead == '\r') {
        return has_content;
      }
      // FIXME: Accept anything after '\'
      advance(lexer);
      has_content = true;
      break;
    case '\0':
      if (lexer->eof(lexer)) {
        return false;
      }
      advance(lexer);
      has_content = true;
      break;
    default:
      advance(lexer);
      has_content = true;
      break;
    }
  }
}

// scan_hash_start scans a token starting with '#': the opening delimiter of
// a raw string, which is one or more '#' then a quote, or three quotes for a
// multiline literal; or a single '#' directly before '[' or '{', which opens
// a closed list or struct. Unlike the other tokens here, it can follow
// whitespace.
static bool scan_hash_start(Scanner *s, TSLexer *lexer,
                            const bool *valid_symbols) {
  while (iswspace(lexer->lookahead)) {
    skip(lexer);
  }
  if (lexer->lookahead != '#') {
    return false;
  }
  unsigned hashes = 0;
  while (lexer->lookahead == '#') {
    advance(lexer);
    hashes++;
  }
  if (hashes == 1 && (lexer->lookahead == '[' || lexer->lookahead == '{') &&
      valid_symbols[CLOSED_HASH]) {
    lexer->mark_end(lexer);
    lexer->result_symbol = CLOSED_HASH;
    return true;
  }
  if (hashes > UINT8_MAX || s->depth == MAX_DEPTH) {
    return false;
  }
  char quote = (char)lexer->lookahead;
  if (quote != '"' && quote != '\'') {
    return false;
  }
  advance(lexer);
  lexer->mark_end(lexer);
  bool multiline = false;
  if (lexer->lookahead == quote) {
    advance(lexer);
    if (lexer->lookahead == quote) {
      advance(lexer);
      lexer->mark_end(lexer);
      multiline = true;
    }
  }
  enum TokenType symbol =
      quote == '"' ? (multiline ? MULTI_RAW_STR_START : RAW_STR_START)
                   : (multiline ? MULTI_RAW_BYTES_START : RAW_BYTES_START);
  if (!valid_symbols[symbol]) {
    return false;
  }
  s->stack[s->depth++] = (RawString){
      .hashes = (uint8_t)hashes, .quote = quote, .multiline = multiline};
  lexer->result_symbol = symbol;
  return true;
}

// scan_hashes advances over up to n '#' characters and reports whether there
// were n of them.
static bool scan_hashes(TSLexer *lexer, unsigned n) {
  for (unsigned i = 0; i < n; i++) {
    if (lexer->lookahead != '#') {
      return false;
    }
    advance(lexer);
  }
  return true;
}

// scan_raw_body scans inside the innermost open raw string: its content, its
// closing delimiter, or the start of an interpolation. It stops before an
// escape, which the grammar scans.
static bool scan_raw_body(Scanner *s, TSLexer *lexer,
                          const bool *valid_symbols) {
  RawString *top = &s->stack[s->depth - 1];
  enum TokenType content =
      top->quote == '"'
          ? (top->multiline ? MULTI_RAW_STR_CONTENT : RAW_STR_CONTENT)
          : (top->multiline ? MULTI_RAW_BYTES_CONTENT : RAW_BYTES_CONTENT);
  unsigned quotes = top->multiline ? 3 : 1;
  bool has_content = false;

  while (true) {
    if (lexer->lookahead == top->quote) {
      lexer->mark_end(lexer);
      unsigned n = 0;
      while (n < quotes && lexer->lookahead == top->quote) {
        advance(lexer);
        n++;
      }
      if (n == quotes && scan_hashes(lexer, top->hashes)) {
        if (has_content) {
          lexer->result_symbol = content;
          return valid_symbols[content];
        }
        if (!valid_symbols[RAW_END]) {
          return false;
        }
        lexer->mark_end(lexer);
        s->depth--;
        lexer->result_symbol = RAW_END;
        return true;
      }
      has_content = true;
      continue;
    }
    if (lexer->lookahead == '\\') {
      lexer->mark_end(lexer);
      advance(lexer);
      if (scan_hashes(lexer, top->hashes)) {
        if (has_content) {
          lexer->result_symbol = content;
          return valid_symbols[content];
        }
        if (lexer->lookahead == '(' &&
            valid_symbols[RAW_INTERPOLATION_START]) {
          advance(lexer);
          lexer->mark_end(lexer);
          lexer->result_symbol = RAW_INTERPOLATION_START;
          return true;
        }
        // An escape: the grammar scans it.
        return false;
      }
      has_content = true;
      continue;
    }
    if (lexer->eof(lexer)) {
      return false;
    }
    advance(lexer);
    has_content = true;
  }
}

static bool scan(Scanner *s, TSLexer *lexer, const bool *valid_symbols) {
  if (valid_symbols[ERROR_SENTINEL]) {
    return false;
  }
  if (valid_symbols[MULTI_STR_CONTENT]) {
    return scan_multiline(lexer, '"');
  }
  if (valid_symbols[MULTI_BYTES_CONTENT]) {
    return scan_multiline(lexer, '\'');
  }
  if (valid_symbols[RAW_END] && s->depth > 0) {
    return scan_raw_body(s, lexer, valid_symbols);
  }
  if (valid_symbols[RAW_STR_START] || valid_symbols[RAW_BYTES_START] ||
      valid_symbols[MULTI_RAW_STR_START] ||
      valid_symbols[MULTI_RAW_BYTES_START] || valid_symbols[CLOSED_HASH]) {
    return scan_hash_start(s, lexer, valid_symbols);
  }
  return false;
}

void *tree_sitter_cue_external_scanner_create() {
  return ts_calloc(1, sizeof(Scanner));
}

bool tree_sitter_cue_external_scanner_scan(void *payload, TSLexer *lexer,
                                           const bool *valid_symbols) {
  return scan((Scanner *)payload, lexer, valid_symbols);
}

unsigned tree_sitter_cue_external_scanner_serialize(void *payload,
                                                    char *buffer) {
  Scanner *s = (Scanner *)payload;
  unsigned size = 0;
  buffer[size++] = (char)s->depth;
  for (unsigned i = 0; i < s->depth; i++) {
    buffer[size++] = (char)s->stack[i].hashes;
    buffer[size++] = s->stack[i].quote;
    buffer[size++] = (char)s->stack[i].multiline;
  }
  return size;
}

void tree_sitter_cue_external_scanner_deserialize(void *payload,
                                                  const char *buffer,
                                                  unsigned length) {
  Scanner *s = (Scanner *)payload;
  s->depth = 0;
  if (length == 0) {
    return;
  }
  unsigned depth = (uint8_t)buffer[0];
  if (length < 1 + 3 * depth) {
    return;
  }
  for (unsigned i = 0; i < depth; i++) {
    s->stack[i].hashes = (uint8_t)buffer[1 + 3 * i];
    s->stack[i].quote = buffer[2 + 3 * i];
    s->stack[i].multiline = buffer[3 + 3 * i] != 0;
  }
  s->depth = depth;
}

void tree_sitter_cue_external_scanner_destroy(void *payload) {
  ts_free(payload);
}
