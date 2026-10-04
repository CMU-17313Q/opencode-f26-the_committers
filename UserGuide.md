# User Guide

## Suggest Tests

The `/suggest-tests` command requests test suggestions for a file.
You can optionally provide a function name.

### Usage

Type this inside OpenCode:

```text
/suggest-tests <file> [function]
```

Examples, using files that exist in your project:

```text
/suggest-tests src/calculator.py
/suggest-tests src/calculator.py add
```

Relative paths start from the directory opened in OpenCode.
Use double quotes around paths containing spaces.

This version adds command registration and argument validation.
It uses OpenCode's existing model flow. The dedicated analyzer,
response parser, and suggestions panel will be added in later issues.
AI responses require a configured model.

### Error Messages

- No argument: `Usage: /suggest-tests <file> [function]`
- Missing file or a directory:
  `File not found or not a regular file: <path>`
- Extra arguments: `Usage: /suggest-tests <file> [function]`

### Manual Testing

Start OpenCode from the repository root:

```bash
bun run dev
```

In OpenCode:

1. Type `/suggest-tests` and confirm it appears in the command list.
2. Submit `/suggest-tests` without arguments. Check the usage error.
3. Submit `/suggest-tests missing-file.py` with a nonexistent path.
   Check the file error.
4. Submit `/suggest-tests src/command/suggest-tests.ts`.
   Confirm it proceeds without an argument-validation error.
5. Submit `/suggest-tests src/command/suggest-tests.ts validate`.
   Confirm the request includes the optional function name.validate`.
   Confirm the request includes the optional function name.

### Automated Tests

Tests are in
[the suggest-tests test file](packages/opencode/test/command/suggest-tests.test.ts).

Run from the repository root:

```bash
cd packages/opencode
bun test test/command/suggest-tests.test.ts
```

The six tests cover:

- A valid file.
- An optional function name.
- A missing file.
- No arguments.
- A directory instead of a file.
- Extra arguments.

Tests use real temporary files and cover every validation branch.
Manual testing checks command discovery and its integration with OpenCode.

### Shared Type and Mock Data

The TypeScript `TestSuggestion` type is defined in
`packages/schema/src/test-suggestion.ts`.

Its fields are `functionName`, `category`, `input`,
`expectedOutput`, and `reason`.

Categories are `expected`, `edge`, and `error`.

Mock suggestions for teammates are in
`packages/schema/src/test-suggestion-mock.ts`.
