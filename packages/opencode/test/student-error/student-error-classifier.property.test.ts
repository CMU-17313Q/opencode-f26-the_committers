import { describe, expect, test } from "bun:test"
import fc from "fast-check"
import type { Row } from "@opencode-ai/core/session/student-error"
import { StudentErrorClassifier } from "@opencode-ai/core/session/student-error-classifier"
import { StudentErrorParser } from "@opencode-ai/core/session/student-error-parser"
import { StudentErrorSummary } from "@opencode-ai/core/session/student-error-summary"

// Property-based tests for mistake classification (P4B). Requirement IDs and wording come from
// traceability/dalmohan.md. The classifier decides when two recorded mistakes are "the same kind",
// and the summary counts mistakes per kind.

const RUNS = 300

// ---------- Generators ----------

// Variable names like the ones students mistype: short and long, camelCase, a leading _ or $,
// digits after the first letter, and names that are also words in the error messages ("name",
// "type", "find"), which must never be confused with the message text around them.
const identifier = fc.oneof(
  fc.stringMatching(/^[a-z][a-zA-Z0-9]{0,10}$/),
  fc.stringMatching(/^[_$][a-zA-Z0-9_]{0,6}$/),
  fc.constantFrom("count", "total", "lenght", "result", "name", "type", "find", "x", "userName2"),
)
const names = fc.tuple(identifier, identifier, identifier)
const numbers = fc.tuple(fc.nat(12), fc.nat(12))

// Files and lines where the same mistake can happen (C-8, O-8): different folders, extensions,
// and line numbers from 1 to large values.
const file = fc
  .tuple(
    fc.constantFrom("", "src/", "test/", "src/utils/"),
    fc.stringMatching(/^[a-z][a-z0-9-]{0,8}$/),
    fc.constantFrom(".ts", ".tsx"),
  )
  .map((parts) => parts.join(""))
const line = fc.integer({ min: 1, max: 5000 })

// A catalog of mistake kinds, written from real TypeScript compiler messages and failed-test
// names, which are the only mistakes the parser records. Each kind is one "type of error" in the
// interviewees' sense (S-8, C-8): the same problem with the same fix (O-1). A kind can have more
// than one variant: TS2552 is TS2304 with a "Did you mean ...?" suggestion added, and TS2551 is
// TS2339 with one, so students fix them the same way. The kinds are chosen so that different kinds
// often share words ("expected", "assignable", "Cannot find") and the same quoted names, which is
// the case interviewees worried about (C-4, S-4, O-4).
const kinds = [
  {
    id: "undefined name",
    category: "undefined_name",
    label: "undefined name errors",
    variants: [
      { code: "TS2304", message: (n: string[]) => `Cannot find name '${n[0]}'.` },
      { code: "TS2552", message: (n: string[]) => `Cannot find name '${n[0]}'. Did you mean '${n[1]}'?` },
    ],
  },
  {
    id: "missing property",
    category: "type_error",
    label: "type errors",
    variants: [
      { code: "TS2339", message: (n: string[]) => `Property '${n[0]}' does not exist on type '${n[1]}'.` },
      {
        code: "TS2551",
        message: (n: string[]) => `Property '${n[0]}' does not exist on type '${n[1]}'. Did you mean '${n[2]}'?`,
      },
    ],
  },
  {
    id: "type mismatch",
    category: "type_error",
    label: "type errors",
    variants: [{ code: "TS2322", message: (n: string[]) => `Type '${n[0]}' is not assignable to type '${n[1]}'.` }],
  },
  {
    id: "argument type",
    category: "type_error",
    label: "type errors",
    variants: [
      {
        code: "TS2345",
        message: (n: string[]) => `Argument of type '${n[0]}' is not assignable to parameter of type '${n[1]}'.`,
      },
    ],
  },
  {
    id: "argument count",
    category: "type_error",
    label: "type errors",
    variants: [
      { code: "TS2554", message: (_: string[], k: number[]) => `Expected ${k[0]} arguments, but got ${k[1]}.` },
    ],
  },
  {
    id: "not callable",
    category: "type_error",
    label: "type errors",
    variants: [{ code: "TS2349", message: () => "This expression is not callable." }],
  },
  {
    id: "missing token",
    category: "syntax_error",
    label: "syntax errors",
    variants: [{ code: "TS1005", message: (n: string[]) => `'${n[0]}' expected.` }],
  },
  {
    id: "expression expected",
    category: "syntax_error",
    label: "syntax errors",
    variants: [{ code: "TS1109", message: () => "Expression expected." }],
  },
  {
    id: "missing module",
    category: "import_error",
    label: "import errors",
    variants: [
      {
        code: "TS2307",
        message: (n: string[]) => `Cannot find module '${n[0]}' or its corresponding type declarations.`,
      },
    ],
  },
  {
    id: "failed test: adds",
    category: "test_failed",
    label: "failed tests",
    variants: [{ code: undefined, message: (_: string[], k: number[]) => `adds ${k[0]} and ${k[1]}` }],
  },
  {
    id: "failed test: renames",
    category: "test_failed",
    label: "failed tests",
    variants: [{ code: undefined, message: (n: string[]) => `renames '${n[0]}' to '${n[1]}'` }],
  },
]
type Kind = (typeof kinds)[number]

// builds a stored Row without touching the database; the classifier and summary only read
// category, code, and message, so id, session, and time are placeholders
const row = (fields: Pick<Row, "category" | "code" | "message" | "file" | "line">): Row =>
  ({ id: 0, session_id: "ses_property_test", source: "shell", time_created: 0, ...fields }) as unknown as Row

// One recorded occurrence of a kind: any of its variants, with random names, numbers, file, and
// line. Compiler errors always have a code and a location; failed tests have neither, exactly as
// the parser records them.
const occurrence = (kind: Kind) =>
  fc
    .record({ variant: fc.constantFrom(...kind.variants), names, numbers, file, line })
    .map((o) => ({
      kind,
      row: row({
        category: kind.category,
        code: o.variant.code ?? null,
        message: o.variant.message(o.names, o.numbers),
        file: o.variant.code ? o.file : null,
        line: o.variant.code ? o.line : null,
      }),
    }))

// A history of 1 to 12 recorded mistakes drawn from up to `maxKinds` different kinds, in random
// order. Few kinds and many mistakes make repeats (recurring patterns) common.
const history = (maxKinds: number) =>
  fc
    .uniqueArray(fc.constantFrom(...kinds), { minLength: 1, maxLength: maxKinds, selector: (kind) => kind.id })
    .chain((chosen) => fc.array(fc.constantFrom(...chosen).chain(occurrence), { minLength: 1, maxLength: 12 }))

// Output of a run with no errors, like after the student fixes the mistake (C-6, S-6): build and
// summary lines, passing tests, and "0 fail".
const cleanRun = fc
  .array(
    fc.oneof(
      fc.constantFrom("Compiling...", "Found 0 errors.", "Build finished successfully.", " 0 fail"),
      fc.nat(500).map((n) => ` ${n} pass`),
      identifier.map((name) => `(pass) handles ${name} [1.00ms]`),
      identifier.map((name) => `✓ handles ${name}`),
    ),
    { minLength: 1, maxLength: 6 },
  )
  .map((lines) => lines.join("\n"))

// reads the "N label (CODE)" entries out of a summary such as
// "You've had 3 undefined name errors (TS2304), 2 type errors (TS2322), and 2 failed tests."
const shown = (summary: string) =>
  [...summary.matchAll(/(\d+) ([a-z ]+?)(?: \((TS\d+)\))?(?=, and |, | and |\.$)/g)].map((m) => m[0])

// what the summary should show for one kind with `count` occurrences, where `code` is the code of
// the kind's first occurrence (the summary describes a kind by its first example)
const entry = (kind: Kind, count: number, code: string | null) => `${count} ${kind.label}${code ? ` (${code})` : ""}`

// ---------- Properties ----------

describe("StudentErrorClassifier properties", () => {
  // R1: Two mistakes whose messages differ only in a quoted name (the variable, property, type, or
  // module name the compiler puts in quotes) are classified as the same kind.
  // Kind: metamorphic. Renaming every quoted name in a message must not change its kind, both when
  // the compiler code is present and when only the message can be compared.
  test("R1: renaming the quoted names in a message keeps the same kind", () => {
    fc.assert(
      fc.property(
        fc
          .constantFrom(...kinds)
          .chain((kind) => fc.constantFrom(...kind.variants).map((variant) => ({ kind, variant }))),
        names,
        names,
        numbers,
        fc.boolean(),
        (picked, before, after, k, withCode) => {
          const code = withCode ? (picked.variant.code ?? null) : null
          const a = { category: picked.kind.category, code, message: picked.variant.message(before, k) }
          const b = { category: picked.kind.category, code, message: picked.variant.message(after, k) }
          expect(StudentErrorClassifier.isSameKind(a, b)).toBe(true)
        },
      ),
      { numRuns: RUNS },
    )
  })

  // R2: Two mistakes with the same error at a different line or in a different file are classified
  // as the same kind. (C-8 and O-8 also said capitalization should not matter.)
  // Kind: metamorphic. Moving a mistake to another file and line, and changing the capitalization
  // of its message (all upper, all lower, or mixed), must not change its kind.
  test("R2: changing the file, line, or capitalization keeps the same kind", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...kinds).chain(occurrence),
        file,
        line,
        fc.constantFrom("upper", "lower", "mixed"),
        fc.boolean(),
        (original, otherFile, otherLine, casing, withCode) => {
          const message = original.row.message
          const recased =
            casing === "upper"
              ? message.toUpperCase()
              : casing === "lower"
                ? message.toLowerCase()
                : [...message].map((c, i) => (i % 2 === 0 ? c.toUpperCase() : c.toLowerCase())).join("")
          const code = withCode ? original.row.code : null
          const a = { ...original.row, code }
          const b = { ...original.row, code, message: recased, file: otherFile, line: otherLine }
          expect(StudentErrorClassifier.isSameKind(a, b)).toBe(true)
        },
      ),
      { numRuns: RUNS },
    )
  })

  // R3: Two mistakes with different error types are never classified as the same kind, even when
  // their messages share words or a variable name.
  // Kind: invariant. For any two different kinds from the catalog, built from the same names and
  // numbers so their messages overlap as much as possible, the classifier never matches them in
  // either direction, and classify() reports the second as a new pattern. A failed test named
  // exactly like a compiler message is also never matched with that compiler error.
  test("R3: different error types are never the same kind, even with the same names", () => {
    fc.assert(
      fc.property(
        fc
          .uniqueArray(fc.constantFrom(...kinds), { minLength: 2, maxLength: 2, selector: (kind) => kind.id })
          .chain((pair) =>
            fc.tuple(
              fc.constantFrom(...pair[0].variants).map((variant) => ({ kind: pair[0], variant })),
              fc.constantFrom(...pair[1].variants).map((variant) => ({ kind: pair[1], variant })),
            ),
          ),
        names,
        numbers,
        (pair, n, k) => {
          const [first, second] = pair.map((picked) =>
            row({
              category: picked.kind.category,
              code: picked.variant.code ?? null,
              message: picked.variant.message(n, k),
              file: null,
              line: null,
            }),
          )
          expect(StudentErrorClassifier.isSameKind(first, second)).toBe(false)
          expect(StudentErrorClassifier.isSameKind(second, first)).toBe(false)
          expect(StudentErrorClassifier.classify(second, [first]).isNewPattern).toBe(true)
          // the extreme "messages look alike" case (S-3): a failed test whose name is exactly a
          // compiler message is still a different type of error from that compiler error
          const lookalike = row({ category: "test_failed", code: null, message: first.message, file: null, line: null })
          if (first.category !== "test_failed") expect(StudentErrorClassifier.isSameKind(first, lookalike)).toBe(false)
        },
      ),
      { numRuns: RUNS },
    )
  })

  // R5: When a mistake is fixed and then made again, the second occurrence is recorded and counted
  // in the same kind as the first.
  // Kind: metamorphic. Make a mistake, fix it (one or more clean runs, which record nothing), then
  // make the same kind of mistake again, possibly with a different name, variant, file, or line.
  // Adding that second occurrence must match the first and raise the kind's count from 1 to 2.
  // Other mistakes (at most 2 other kinds) come before, so the summary never has to cut a kind.
  test("R5: a mistake made again after a fix is counted in the same kind", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...kinds).chain((kind) =>
          fc.record({
            first: occurrence(kind),
            second: occurrence(kind),
            others: fc
              .uniqueArray(fc.constantFrom(...kinds.filter((other) => other.id !== kind.id)), {
                minLength: 1,
                maxLength: 2,
                selector: (other) => other.id,
              })
              .chain((chosen) => fc.array(fc.constantFrom(...chosen).chain(occurrence), { maxLength: 6 })),
          }),
        ),
        fc.array(cleanRun, { minLength: 1, maxLength: 3 }),
        (made, fixes) => {
          const fixed = fixes.flatMap((output) => StudentErrorParser.parse(output))
          expect(fixed).toEqual([])
          const before = [...made.others.map((other) => other.row), made.first.row]
          const result = StudentErrorClassifier.classify(made.second.row, before)
          expect(result.isNewPattern).toBe(false)
          expect(result.matches).toContain(made.first.row)
          expect(shown(StudentErrorSummary.report([...before, made.second.row]))).toContain(
            entry(made.first.kind, 2, made.first.row.code),
          )
        },
      ),
      { numRuns: RUNS },
    )
  })

  // R6: Fixing a mistake never lowers the count for its kind in the summary.
  // Kind: metamorphic. A fix is a run with no errors: it records nothing, so adding clean runs to
  // any history leaves the summary exactly the same. And because the summary keeps a history of
  // what happened (S-6: "the count only goes up"), recording more mistakes of the same kinds later
  // never lowers any count it shows. Kinds are compared by their label and code; when two kinds
  // share a label (two different failed tests), their counts are compared largest first.
  test("R6: fixing a mistake, or making more, never lowers a count in the summary", () => {
    const byKind = (summary: string) =>
      shown(summary).reduce<Record<string, number[]>>((groups, text) => {
        const key = text.slice(text.indexOf(" ") + 1)
        return { ...groups, [key]: [...(groups[key] ?? []), parseInt(text)].sort((a, b) => b - a) }
      }, {})
    fc.assert(
      fc.property(
        history(3).chain((mistakes) =>
          fc.record({
            mistakes: fc.constant(mistakes),
            more: fc.array(fc.constantFrom(...new Set(mistakes.map((m) => m.kind))).chain(occurrence), {
              maxLength: 6,
            }),
            fixes: fc.array(cleanRun, { minLength: 1, maxLength: 3 }),
          }),
        ),
        (input) => {
          const rows = input.mistakes.map((m) => m.row)
          const before = StudentErrorSummary.report(rows)
          // store whatever the parser finds in the clean runs as rows, the way the shell tool records them
          const recorded = input.fixes
            .flatMap((output) => StudentErrorParser.parse(output))
            .map((error) =>
              row({
                category: error.category,
                code: error.code ?? null,
                message: error.message,
                file: error.file ?? null,
                line: error.line ?? null,
              }),
            )
          const fixed = [...rows, ...recorded]
          expect(StudentErrorSummary.report(fixed)).toBe(before)
          const after = byKind(StudentErrorSummary.report([...fixed, ...input.more.map((m) => m.row)]))
          Object.entries(byKind(before)).forEach(([key, counts]) =>
            counts.forEach((count, i) => expect(after[key]?.[i] ?? 0).toBeGreaterThanOrEqual(count)),
          )
        },
      ),
      { numRuns: RUNS },
    )
  })

  // R7: The count the summary shows for each kind equals the number of recorded mistakes of that kind.
  // Kind: model / oracle. The oracle is the catalog itself: every generated mistake knows which kind
  // it was made from, so counting them by hand (C-9, S-9, O-9) gives the right answer without
  // trusting the classifier. Histories have at most 3 kinds, so the summary (which lists up to 3
  // recurring kinds) shows every kind that occurred more than once.
  test("R7: summary counts match a hand count of each kind", () => {
    fc.assert(
      fc.property(history(3), (mistakes) => {
        const expected = [...new Set(mistakes.map((m) => m.kind))].flatMap((kind) => {
          const own = mistakes.filter((m) => m.kind === kind)
          return own.length > 1 ? [entry(kind, own.length, own[0].row.code)] : []
        })
        const summary = StudentErrorSummary.report(mistakes.map((m) => m.row))
        expect(shown(summary).sort()).toEqual(expected.sort())
        if (expected.length === 0) expect(summary).toBe("No recurring mistake patterns found.")
      }),
      { numRuns: RUNS },
    )
  })

  // R8: Every recorded mistake is counted in exactly one kind: classifying it against the history
  // always finds itself, and two mistakes that match each other always find exactly the same group,
  // so none are missing and none are counted twice.
  // Kind: invariant. For any history over any number of kinds, the groups that classify() finds
  // split the history into separate groups whose sizes add up to the number of recorded mistakes.
  test("R8: every recorded mistake is counted in exactly one kind", () => {
    fc.assert(
      fc.property(history(kinds.length), (mistakes) => {
        const rows = mistakes.map((m) => m.row)
        const groups = rows.map((r) => StudentErrorClassifier.classify(r, rows).matches)
        rows.forEach((r, i) => {
          expect(groups[i]).toContain(r)
          groups[i].forEach((match) => expect(groups[rows.indexOf(match)]).toEqual(groups[i]))
        })
        const distinct = [...new Set(groups.map((group) => group.map((r) => rows.indexOf(r)).join(",")))]
        expect(distinct.reduce((sum, group) => sum + group.split(",").length, 0)).toBe(rows.length)
      }),
      { numRuns: RUNS },
    )
  })
})
