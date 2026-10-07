# User Guide
####################
THIS WAS CONTRIBUTED BY ALL TEAM MEMBERS ON A SEPERATE DOC THEN ADDED BY BASHAYER
####################
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


## Function Signature Extraction

User story: Test Case Suggestions. Issue 2 (#19).

`extractFunctionSignature(source, functionName?)` in
`packages/opencode/src/command/signature.ts` reads TypeScript code and
returns the function's name, parameters, return type, and body.
The test case generators use this as their starting point.

- Each parameter has a `name`, a `type`, and whether it is `optional`.
- A missing type is reported as `"unknown"`.
- Without a function name, the first function in the file is used.
- If no function is found, it returns `{ ok: false, message }`
  instead of crashing, for example `No function declaration found`
  or `Function not found: <name>`.

### Manual Testing

1. Create a file named `demo.ts` in the repository root:

   ```ts
   export function add(a: number, b: number): number {
     return a + b
   }

   export function greet(name?: string): string {
     return "Hello, " + (name ?? "guest")
   }

   export function getName(): string {
     return "Alice"
   }
   ```

2. From the repository root, run:

   ```bash
   cd packages/opencode
   bun -e 'const [file, name] = process.argv.slice(-2); import { extractFunctionSignature } from "./src/command/signature"; console.log(JSON.stringify(extractFunctionSignature(await Bun.file(file).text(), name), null, 2))' ../../demo.ts add
   ```

3. Check that it prints `add` with two `number` parameters,
   return type `number`, and the body `{ return a + b }`.
4. Replace `add` at the end with `greet`. Check that `name` has `"optional": true`.
5. Replace it with `getName`. Check that `parameters` is empty.
6. Replace it with `missing`. Check that it prints
   `"ok": false` and `Function not found: missing`.
7. Keep `demo.ts` for the next section, or delete it.

### Automated Tests

Tests are in [the signature test file](packages/opencode/test/command/signature.test.ts).

```bash
cd packages/opencode
bun test test/command/signature.test.ts
```

The seven tests cover:

- A function with no parameters.
- A function with several typed parameters.
- An optional parameter.
- A broken file with no function, which fails without crashing.
- Picking one function by name from a file with several.
- A body with more than one statement (added in Issue 4).
- A function with no body, which returns `body: ""` (added in Issue 4).

These cover all three signature shapes from the acceptance criteria
plus the broken-file case, using real TypeScript source code.

## Common Test Cases

User story: Test Case Suggestions. Issue 3 (#18).

`ExpectedCases.generate(signature)` in
`packages/opencode/src/command/expected-cases.ts` creates "happy path"
test suggestions: normal, valid inputs for each parameter.

- It creates two suggestions with different typical values,
  like `5` and `12` for numbers, `"example"` and `"hello"` for strings,
  and `true` and `false` for booleans.
- A function with no parameters gets one suggestion, since there is only one way to call it.
- A type it does not know gets `null` as its input.
- The expected output is worked out from the function body, the same way as the
  edge cases (see Edge Case Test Suggestions). If it can't be worked out,
  it says to check manually.

### Manual Testing

1. Create `demo.ts` from the Function Signature Extraction section.
2. From the repository root, run:

   ```bash
   cd packages/opencode
   bun -e 'const [file, name] = process.argv.slice(-2); import { extractFunctionSignature } from "./src/command/signature"; import { ExpectedCases } from "./src/command/expected-cases"; const r = extractFunctionSignature(await Bun.file(file).text(), name); console.table(r.ok ? ExpectedCases.generate(r.signature).map((s) => ({ input: JSON.stringify(s.input), expectedOutput: JSON.stringify(s.expectedOutput), reason: s.reason })) : [r])' ../../demo.ts add
   ```

3. Check that there are two rows, `[5,12]` and `[12,5]`, both with
   expected output `17`, and that each has a reason.
4. Replace `add` at the end with `greet`. Check that the expected
   outputs are `"Hello, example"` and `"Hello, hello"`.
5. Delete `demo.ts` when you are done.

### Automated Tests

Tests are in [the expected case test file](packages/opencode/test/command/expected-cases.test.ts).

```bash
cd packages/opencode
bun test test/command/expected-cases.test.ts
```

The seven tests cover:

- Number, string, and boolean parameters, each getting two different typical inputs.
- A function with no parameters, which gets one suggestion.
- An unknown parameter type, which falls back to `null`.
- Expected outputs worked out from the body (`add(5, 12)` gives `17`), with a reason on every suggestion.
- The "check manually" fallback when the body does not decide the output.

These cover the acceptance criteria: at least two suggestions,
inputs that match each parameter's type, and three different parameter types.


## Edge Case Test Suggestions

This part of `/suggest-tests` creates edge case test suggestions
for a function (category `edge`).

User story: Test Case Suggestions. Issue 4 (#22).

It has two parts:

- `extractFunctionSignature` now also returns the function's `body`.
  A function without a body, like `declare function`, gets `body: ""`.
- `EdgeCases.generate(signature)` creates edge cases for every parameter.

### What It Generates

Each edge case changes one parameter and keeps normal values
for the others, so a failing test points at that parameter.

| Parameter type | Edge cases |
| --- | --- |
| `number` | `0`, `-1`, `0.5`, a very large number |
| `string` | `""`, `" "`, a 100-character string, Unicode text |
| array, like `number[]` | `[]`, one element, duplicate elements |
| `boolean` | `true`, `false`, `null` |
| optional, like `name?: string` | the cases for its type, plus leaving it out |
| any other type | `null`, `{}`, `[]` |

Every suggestion has a `reason` that names the parameter and explains the case.

### Expected Output

The expected output is worked out from the function body.
The student's code is never run. Instead,
`packages/opencode/src/command/expected-output.ts` reads simple code:
`return`, `if`/`else`, `throw new X()`, math, comparisons,
`? :`, `??`, `.length`, `array[i]`, and `Math.*`.

- If the function throws for an input, the suggestion's category is `error`
  and the expected output is the error name, for example `"Error"`.
  This matches the Issue 1 mock data, and Issue 5 turns it into a `toThrow()` test.
- If the body uses anything else, like loops or `.reduce`, the expected
  output is `"Unknown: could not be derived from the function body, check manually"`.

The common test cases from Issue 3 use the same file, so both kinds of
suggestions get their expected outputs the same way.

### Manual Testing

You can see these suggestions with `/suggest-tests` (see Test File Formatting),
or from the terminal without a model:

1. Create a file named `edge-demo.ts` in the repository root:

   ```ts
   export function divide(a: number, b: number): number {
     if (b === 0) throw new Error("cannot divide by zero")
     return a / b
   }

   export function total(prices: number[]): number {
     return prices.reduce((sum, price) => sum + price, 0)
   }
   ```

2. From the repository root, run:

   ```bash
   cd packages/opencode
   bun -e 'const [file, name] = process.argv.slice(-2); import { extractFunctionSignature } from "./src/command/signature"; import { EdgeCases } from "./src/command/edge-cases"; const r = extractFunctionSignature(await Bun.file(file).text(), name); console.table(r.ok ? EdgeCases.generate(r.signature).map((s) => ({ category: s.category, input: JSON.stringify(s.input), expectedOutput: JSON.stringify(s.expectedOutput), reason: s.reason })) : [r])' ../../edge-demo.ts divide
   ```

3. Check the table for `divide`:
   - 8 rows, 4 for `a` and 4 for `b`.
   - Input `[5,0]` has category `error` and expected output `"Error"`, because of the `throw`.
     The other 7 rows have category `edge`.
   - Input `[0,5]` has expected output `0`.

4. Run the same command with `total` instead of `divide` at the end.
   Check that there are 3 rows (`[]`, one element, duplicates) and the
   expected output says to check manually, because `.reduce` is not supported.

5. Run it with a function name that is not in the file, like `missing`.
   Check that it prints `Function not found: missing` instead of crashing.

6. Delete `edge-demo.ts` when you are done.

### Automated Tests

Tests are in:

- [the signature test file](packages/opencode/test/command/signature.test.ts)
- [the edge case test file](packages/opencode/test/command/edge-cases.test.ts)
- [the expected case test file](packages/opencode/test/command/expected-cases.test.ts)

Run from the repository root:

```bash
cd packages/opencode
bun test test/command
```

The signature tests (7) cover:

- The original Issue 2 cases, now also checking `body`.
- A body with more than one statement, captured as written.
- A function with no body, which returns `body: ""` instead of crashing.

The edge case tests (10) cover:

- The five parameter types: number, string, array, boolean, and optional.
  Each test checks every input and the expected output worked out from the body.
- A `throw` guard (`divide` by zero gives `"Error"`), and that this case gets category `error`.
- A `TypeError` when the body reads `.length` of `null`.
- The "check manually" fallback, for a body that is not supported and for a missing body.
- A function with no parameters, which gets no edge cases.
- Every suggestion matching the shared `TestSuggestion` type exactly,
  with a reason and an expected output.

The expected case tests check that Issue 3's common cases now get
real expected outputs (`add(5, 12)` gives `17`) and use the same fallback.

These tests are enough because they cover every acceptance criterion
for this issue: the `body` field, the no-body case, at least 3 edge cases
per parameter, all five parameter types, the expected output and its
fallback, and the exact shape of `TestSuggestion`. They call the real
functions with real TypeScript source code instead of mocks, so they test
the same code students will use.

## Test File Formatting

User story: Test Case Suggestions. Issue 5 (#24).

This issue connects everything: `/suggest-tests` now extracts the
function signature, generates common and edge case suggestions, and turns
them into a Bun test file.

- `packages/opencode/src/command/test-file-formatter.ts` writes one `test(...)`
  per suggestion, numbered and named after its category and reason.
- A suggestion with a known expected output becomes `expect(fn(...)).toEqual(...)`.
- A suggestion in the `error` category becomes `expect(() => fn(...)).toThrow()`.
- A suggestion whose output could not be worked out becomes
  `expect(() => fn(...)).not.toThrow()`, with a comment saying to check it manually.
  This only checks that the call runs, so it also works for functions that return nothing.
- With no suggestions, it writes a file with one skipped test, so it still runs.

The generated file is sent to the chat as your message, so the AI can
explain or improve the tests. Using `/suggest-tests` in the chat
requires a configured model.

The generated file imports the function from `../../src/<file name>`,
so save it two folders below your project root, for example
`test/generated/math.test.ts` for a source file at `src/math.ts`.

### Usage

```text
/suggest-tests src/math.ts add
/suggest-tests src/math.ts
```

Without a function name, the first function in the file is used.

### Manual Testing

1. Make a test project from the repository root:

   ```bash
   mkdir -p ~/demo/suggest/src ~/demo/suggest/test/generated
   cd ~/demo/suggest && git init -q && git commit -q --allow-empty -m init
   ```

2. Create `~/demo/suggest/src/math.ts`:

   ```ts
   export function add(a: number, b: number): number {
     return a + b
   }

   export function divide(a: number, b: number): number {
     if (b === 0) throw new Error("cannot divide by zero")
     return a / b
   }
   ```

3. From the repository root, start OpenCode in that folder:

   ```bash
   bun dev ~/demo/suggest
   ```

4. Type `/suggest-tests src/math.ts add` and press Enter.
   Check that your message is a test file with `describe("add", ...)`
   and 10 numbered tests: 2 `expected` and 8 `edge`.

5. Copy the test file from the chat into `~/demo/suggest/test/generated/math.test.ts`,
   then run:

   ```bash
   cd ~/demo/suggest
   bun test test/generated/math.test.ts
   ```

   Check that all 10 tests pass.

6. Type `/suggest-tests src/math.ts divide`. Check that the test for
   `divide(5, 0)` uses `toThrow()`. Save it as
   `test/generated/divide.test.ts` and check that all 10 tests pass.

7. Back in OpenCode, type `/suggest-tests src/math.ts` with no function name.
   Check that it still generates tests for `add`.

8. Type `/suggest-tests src/math.ts missing`.
   Check that it shows `Function not found: missing`.

### Automated Tests

Tests are in:

- [the formatter test file](packages/opencode/test/command/test-file-formatter.test.ts)
- [the suggest-tests test file](packages/opencode/test/command/suggest-tests.test.ts)

```bash
cd packages/opencode
bun test test/command/test-file-formatter.test.ts test/command/suggest-tests.test.ts
```

The seven formatter tests cover a suggestion with a known expected output,
several suggestions, different value types (strings, booleans, null, arrays, objects),
an unknown expected output, an `error` suggestion that should throw,
and an empty list of suggestions. The last test runs the whole pipeline the way
a student would: it generates test files for `add`, `divide` (which throws), and a
`void` function, runs them with `bun test`, and checks that all 26 tests pass.

The seven `/suggest-tests` tests cover a valid file, an optional function name,
generating both common and edge suggestions from a real file, formatting them
into a test file, a missing file, no arguments, and extra arguments.

These cover the formatter for every kind of suggestion, check that
`/suggest-tests` now uses real suggestions instead of mock data, and check that
the generated files are valid and runnable, including for a function that
throws and a function with no clearly testable behavior.

## Mistake Logging

User story: Mistake Pattern Recognition. Issue 1 (#3).

When a command run in an OpenCode chat prints errors, OpenCode records
each error automatically in the `student_error` table.
Nothing needs to be turned on.

`packages/core/src/session/student-error-parser.ts` reads the command output and finds:

- TypeScript compiler errors, in both styles:
  `file.ts(3,5): error TS1005: ...` and `file.ts:3:5 - error TS1005: ...`
- Failed tests, like `✗ test name` or `(fail) test name`.

Each error is saved with its category, error code, message, file, line,
source command, and time. Compiler errors are sorted into categories:
`syntax_error` (TS1xxx), `undefined_name` (TS2304, TS2552),
`import_error` (TS2307), and `type_error` (other codes).
Failed tests are `test_failed`. Terminal color codes are ignored.

### Manual Testing

1. Make an empty test folder that is a git repository:

   ```bash
   mkdir -p ~/demo/logging && cd ~/demo/logging && git init -q && git commit -q --allow-empty -m init
   ```

2. From the repository root, start OpenCode in that folder:

   ```bash
   bun dev ~/demo/logging
   ```

3. Paste this into the chat and allow the command when asked:

   > Create `a.ts` containing `const total: number = "ten"` and `b.ts` containing
   > `import { foo } from './util'`. Then run this command exactly once:
   > `bunx -p typescript tsc --noEmit --pretty false a.ts b.ts`.
   > Do not fix the errors.

4. Quit OpenCode, then from the repository root run:

   ```bash
   bun dev db "select category, code, message, file, line, source from student_error order by id desc limit 5"
   ```

5. Check that there is a `type_error` (TS2322) for `a.ts`
   and an `import_error` (TS2307) for `b.ts`, both with source `bash`.

### Automated Tests

- [the parser test file](packages/core/test/student-error-parser.test.ts)
- [the storage test file](packages/core/test/session-student-error.test.ts)
- [the shell tool test file](packages/opencode/test/tool/shell.test.ts)

```bash
cd packages/core
bun test test/student-error-parser.test.ts test/session-student-error.test.ts
cd ../opencode
bun test test/tool/shell.test.ts
```

The parser tests (7) cover a syntax error, a type error in the other compiler style,
an undefined name, a failed test, several errors mixed with normal output,
color codes, and output with no errors. The storage tests record syntax, type,
and failed-test errors and check every saved detail. The shell tool test checks
that a command's errors are recorded automatically and a clean command records nothing.

Together these cover the acceptance criteria: errors are recorded automatically,
with enough detail to analyze later, for more than three error types.

## Mistake History Storage

User story: Mistake Pattern Recognition. Issue 2 (#8).

Recorded mistakes are stored in OpenCode's database, not in memory,
so they are still there after OpenCode is closed.

`packages/core/src/session/student-error.ts` provides:

- `record(...)` to save a mistake.
- `list(sessionID)` to get one session's mistakes.
- `listForProject(projectID)` to get the mistakes from every session in a project.

Mistakes are kept even if their session is deleted (migration
`20260920122545_keep_student_errors`), so the history is not lost over time.

### Manual Testing

1. Follow the Mistake Logging manual test to record two mistakes in `~/demo/logging`.
2. Quit OpenCode completely, then start it again with `bun dev ~/demo/logging`.
   This starts a new session.
3. Ask it to run the same `tsc` command once more.
4. Quit, then from the repository root run:

   ```bash
   bun dev db "select session_id, category, code from student_error order by id desc limit 10"
   ```

5. Check that the mistakes from both sessions are listed, with two different `session_id` values.

### Automated Tests

Tests are in [the storage test file](packages/core/test/session-student-error.test.ts).

```bash
cd packages/core
bun test test/session-student-error.test.ts
```

The three tests cover recording mistakes with all their details,
an empty list for a session with no mistakes, and getting mistakes from
two different sessions in the same project. The tests use a real database,
so they check that mistakes are stored and can be retrieved, which is the acceptance criteria.

## Mistake Classification

User story: Mistake Pattern Recognition. Issue 3 (#5).

`packages/core/src/session/student-error-classifier.ts` decides whether
two mistakes are the same kind.

- Mistakes in different categories are never the same kind.
- If both have an error code, they match when the codes are the same.
  For example, two TS2304 errors match even if the misspelled names are different.
- Otherwise, they match when their messages are the same after names in quotes
  and numbers are ignored. For example, `expected 4 but received 5` matches
  `expected 2 but received 3`.

`classify(mistake, history)` returns every past mistake that matches,
and whether the mistake is a new pattern.

### Manual Testing

The easiest way to see classification is through the summary:

```bash
./packages/opencode/script/mistakes-demo.sh recurring
```

Check that the two TS2304 errors (`coutn` and `widht`) are counted together
as "2 undefined name errors", while the TS1005 syntax error is not grouped with them.

### Automated Tests

Tests are in [the classifier test file](packages/core/test/student-error-classifier.test.ts).

```bash
cd packages/core
bun test test/student-error-classifier.test.ts
```

The six tests cover:

- Two compiler errors with the same category and code (match).
- Different categories with a similar message (no match).
- Failed tests that only differ by a number (match).
- Unrelated failed tests (new pattern).
- The same category with different codes (no match).
- A new mistake matching several past mistakes, not just the first.

This is more than the five test cases required, and covers both similar and unrelated mistakes.

## Mistake Pattern Summary

User story: Mistake Pattern Recognition. Issue 4 (#7).

`packages/core/src/session/student-error-summary.ts` turns a mistake history
into one readable sentence.

- `summarize(history)` groups mistakes with the classifier, drops mistakes
  that happened only once, and lists the top three patterns, most frequent first.
  For example: `You've had 4 undefined name errors (TS2304), 3 failed tests, and 2 syntax errors (TS1005).`
- If nothing repeats, it returns `No recurring mistake patterns found.`
- `report(history)` does the same, but returns `No mistakes recorded yet.`
  for an empty history.

### Manual Testing

```bash
./packages/opencode/script/mistakes-demo.sh one-offs
./packages/opencode/script/mistakes-demo.sh recurring
```

Check that `one-offs` prints `No recurring mistake patterns found.`
and `recurring` prints `You've had 2 undefined name errors (TS2304).`

### Automated Tests

Tests are in [the summary test file](packages/core/test/student-error-summary.test.ts).

```bash
cd packages/core
bun test test/student-error-summary.test.ts
```

The nine tests cover an empty history, grouping and readable text,
sorting by frequency and keeping only the top three, different codes kept apart,
a single pattern, one-time mistakes left out, a fixed order for equal counts,
not changing the original history, and the empty-history message.
These cover the acceptance criteria: a short, readable summary of the top 1 to 3 recurring issues.

## Viewing Your Mistake Patterns

User story: Mistake Pattern Recognition. Issue 5 (#6).

You can see your mistake pattern summary in two places.

### In the terminal

```bash
bun dev mistakes
bun dev mistakes --session <session-id>
```

Without `--session`, it summarizes every session in the current project.
Run it from your project folder, or add the folder path after `bun dev`.

### In the chat

Type `/mistakes` in an OpenCode chat. A popup shows the summary for the
whole project and for the current session. It only appears inside a chat,
so send a message first if you are on the start screen.

### Manual Testing

Use the demo script, which runs the real `mistakes` command on a temporary
database with sample mistakes:

```bash
./packages/opencode/script/mistakes-demo.sh empty
./packages/opencode/script/mistakes-demo.sh one-offs
./packages/opencode/script/mistakes-demo.sh recurring
```

| Scenario | Expected output |
| --- | --- |
| `empty` | `No mistakes recorded yet.` |
| `one-offs` | `No recurring mistake patterns found.` |
| `recurring` | `You've had 2 undefined name errors (TS2304).` for the project and the session |

To check `/mistakes`:

1. Run the Mistake Logging manual test in a new folder.
2. In the same chat, type `/mistakes` and press Enter.
3. Check that the popup shows the summary for the project and the session.

### Automated Tests

- [the CLI test file](packages/opencode/test/cli/mistakes.test.ts)
- [the pipeline test file](packages/core/test/student-error-pipeline.test.ts)
- [the server test file](packages/opencode/test/server/httpapi-session.test.ts)
  (the "summarizes mistake patterns" test)

```bash
cd packages/opencode
bun test test/cli/mistakes.test.ts test/server/httpapi-session.test.ts
cd ../core
bun test test/student-error-pipeline.test.ts
```

The CLI tests run the real `mistakes` command for the three scenarios:
no history, one-off mistakes only, and a real recurring pattern
(for the project and with `--session`). The pipeline tests run the same three
scenarios through recording, storage, classification, and summary together.
The server test checks the endpoint behind `/mistakes`, including mistakes
spread across two sessions and a session that does not exist.
These cover the acceptance criteria: the summary can be viewed in the CLI,
with the correct output in all three scenarios.
