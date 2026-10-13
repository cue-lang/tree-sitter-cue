# tree-sitter-cue

Tree-sitter grammar for the [CUE language](https://cuelang.org/).

## Key Files

- `grammar.js` — the grammar definition (source of truth)
- `src/parser.c` — generated parser (do not edit by hand; regenerate with `tree-sitter generate`)
- `src/scanner.c` — custom external scanner for interpolations and string literals
- `queries/highlights.scm` — syntax highlighting queries
- `test/corpus/*.txt` — tree-sitter corpus tests
- `script/parse-examples` — script that clones cue-lang/cue and parses real `.cue` files
- `.eslintrc.js` — ESLint config (Google style base)

## Development

Enter the Nix dev shell and install npm dependencies:

```sh
nix develop
npm install
```

After changing `grammar.js`:

```sh
tree-sitter generate   # regenerate src/parser.c
tree-sitter test       # run corpus tests
npm run lint           # lint grammar.js
```

## Code Style

- ESLint with `eslint-config-google`
- 2-space indentation
- 120 character max line length (comments, URLs, and strings excluded)

## Testing

- `tree-sitter test` — runs corpus tests from `test/corpus/` and highlight tests from `test/highlight/`
- `script/parse-syntax-corpus` — parses the copy of the CUE syntax corpus in `test/syntax/`; files in its `pass/`
  and `preview/` directories must parse without ERROR or MISSING nodes unless `test/syntax/KNOWN_GAPS` lists them,
  and a listed file that parses fails the run; a missing `test/syntax/KNOWN_GAPS` lists no file
- `script/parse-syntax-corpus --update` — removes the listed files that parse from `test/syntax/KNOWN_GAPS`, and
  deletes it once it lists none; it never adds a file
- `script/sync-syntax-corpus <cue-checkout>` — refreshes `test/syntax/` from a cue-lang/cue checkout at a tag,
  recording the tag in `test/syntax/SOURCE`
- `script/parse-examples` — clones cue-lang/cue and parses example `.cue` files (requires `bc`)
- `npm test` — runs `tree-sitter test`, `script/parse-syntax-corpus` and `script/parse-examples`
- `npm run lint` — runs ESLint on `grammar.js`

## CI

Three GitHub Actions workflows:

- `ci.yml` — runs `npm test` (corpus tests, the syntax corpus and parse-examples) on macOS and Ubuntu; runs only
  `tree-sitter test` on Windows
- `lint.yml` — runs ESLint
- `fuzz.yml` — fuzzes the external scanner (`src/scanner.c`)

## Commit Conventions

- `src/parser.c` must be regenerated (via `tree-sitter generate`) and committed whenever `grammar.js` changes
- One logical change per commit
- Never add "Co-Authored-By" trailers to commit messages
