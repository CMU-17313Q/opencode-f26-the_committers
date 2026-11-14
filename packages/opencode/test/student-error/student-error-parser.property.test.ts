import { describe, expect, test } from "bun:test"
import fc from "fast-check"
import { StudentErrorParser } from "@opencode-ai/core/session/student-error-parser"

// Property-based tests for the mistake parser (P4B). Requirement IDs and wording come from
// traceability/balsulta.md. Every property logs one line so the CI log (which runs bun test with
// --only-failures) shows that it ran.

const RUNS = 300

// ---------- Generators ----------

// File paths cover what interviewees worried about: plain relative paths, nested folders,
// Windows drive-letter paths (O-7), and folders with parentheses such as Next.js route groups,
// which look like the "(line,col)" part of an error and could confuse the parser.
const segment = fc.stringMatching(/^[a-z][a-z0-9_-]{0,7}$/)
const file = fc
  .tuple(
    fc.constantFrom("", "src/", "test/", "src/(group)/", "C:\\project\\", "D:\\work\\src\\"),
    fc.array(segment, { maxLength: 2 }),
    segment,
    fc.constantFrom(".ts", ".tsx", ".js"),
  )
  .map(([root, dirs, name, ext]) => {
    const sep = root.includes("\\") ? "\\" : "/"
    return root + dirs.map((dir) => dir + sep).join("") + name + ext
  })

// Line and column start at 1 and include large values, the boundary where number parsing breaks.
const position = fc.oneof(fc.integer({ min: 1, max: 20 }), fc.integer({ min: 1, max: 99999 }))

// Codes are drawn from every category the parser knows (syntax TS1xxx, undefined name, import,
// and other type errors) plus random TS2xxx codes, so every categorize() branch is reached.
const code = fc.oneof(
  fc.constantFrom("TS1005", "TS1109", "TS2304", "TS2552", "TS2307", "TS2322", "TS2345"),
  fc.integer({ min: 1000, max: 9999 }).map((n) => `TS${n}`),
)

// Messages are like real compiler messages: quoted identifiers, numbers, and punctuation.
// They never start or end with whitespace, because the parser trims each line.
const word = fc.stringMatching(/^[A-Za-z0-9.,;'()<>_-]{1,10}$/)
const message = fc.array(word, { minLength: 1, maxLength: 8 }).map((words) => words.join(" "))

const compilerError = fc.record({ file, line: position, column: position, code, message })
type CompilerError = typeof compilerError extends fc.Arbitrary<infer T> ? T : never

// Test names may contain brackets and spaces, like real describe/test titles. Half of them come
// from a small fixed pool so that the same test often fails and then passes in one output (a retry,
// S-4 and O-4); fully random names almost never repeat, which hid the retry case on the first run.
const testName = fc.oneof(
  fc.constantFrom("adds numbers", "handles [edge] case", "parses x"),
  fc
    .array(fc.stringMatching(/^[A-Za-z0-9[\]_-]{1,8}$/), { minLength: 1, maxLength: 4 })
    .map((words) => words.join(" ")),
)
const duration = fc.option(
  fc.integer({ min: 0, max: 5000 }).map((ms) => ` [${ms}.00ms]`),
  { nil: "" },
)

// Lines that are never mistakes: the "Compiling..." and summary lines from C-3/C-4, passing tests,
// and random prose. The prose generator avoids the words "error" and "fail" so it cannot
// accidentally form a real error line.
const plainNoise = fc.oneof(
  fc.constantFrom("Compiling...", "Build finished successfully.", "Found 0 errors.", "", "   "),
  fc.integer({ min: 0, max: 500 }).map((n) => `${n} pass`),
  fc.integer({ min: 0, max: 500 }).map((n) => ` ${n} pass\n 0 fail`),
  fc.array(word, { maxLength: 6 }).map((words) => words.join(" ")),
)
const passLine = fc.tuple(fc.constantFrom("(pass)", "\u2713"), testName, duration)
const noise = fc.oneof(
  plainNoise,
  passLine.map(([mark, name, ms]) => `${mark} ${name}${ms}`),
)

// The two compiler styles from the parser and the user guide.
const parenStyle = (e: CompilerError) => `${e.file}(${e.line},${e.column}): error ${e.code}: ${e.message}`
const colonStyle = (e: CompilerError) => `${e.file}:${e.line}:${e.column} - error ${e.code}: ${e.message}`

// The category every code should get, written out independently of the parser (the model).
const expectedCategory = (c: string) => {
  if (/^TS1\d{3}$/.test(c)) return "syntax_error"
  if (c === "TS2304" || c === "TS2552") return "undefined_name"
  if (c === "TS2307") return "import_error"
  return "type_error"
}

// Inserts terminal color codes at the given positions, the way colored tsc output wraps pieces of a line.
const colors = fc.array(fc.tuple(fc.nat(), fc.constantFrom("\u001b[0m", "\u001b[91m", "\u001b[96m", "\u001b[1;31m")), {
  maxLength: 6,
})
const colorize = (text: string, inserts: [number, string][]) =>
  inserts
    .map(([at, color]) => [at % (text.length + 1), color] as const)
    .sort((a, b) => b[0] - a[0])
    .reduce((out, [at, color]) => out.slice(0, at) + color + out.slice(at), text)

// One line of test output with the mistake it should produce, used by the model property (R8).
const outputLine = fc.oneof(
  compilerError.map((e) => ({ text: parenStyle(e), kind: "error" as const, name: "" })),
  compilerError.map((e) => ({ text: colonStyle(e), kind: "error" as const, name: "" })),
  fc.tuple(testName, duration).map(([name, ms]) => ({ text: `(fail) ${name}${ms}`, kind: "fail" as const, name })),
  fc.tuple(testName, duration).map(([name, ms]) => ({ text: `\u2717 ${name}${ms}`, kind: "fail" as const, name })),
  // passing-test lines are their own kind, so the model knows which failures were retried
  passLine.map(([mark, name, ms]) => ({ text: `${mark} ${name}${ms}`, kind: "pass" as const, name })),
  plainNoise.map((text) => ({ text, kind: "noise" as const, name: "" })),
)

const ran = (id: string) => console.log(`[property] ${id} passed ${RUNS} generated inputs`)

describe("StudentErrorParser properties", () => {
  // R1: Command output that contains no errors records no mistakes.
  // Kind: invariant
  test("R1: output with no error or failed-test lines records no mistakes", () => {
    fc.assert(
      fc.property(fc.array(noise, { maxLength: 20 }), (lines) => {
        expect(StudentErrorParser.parse(lines.join("\n"))).toEqual([])
      }),
      { numRuns: RUNS },
    )
    ran("R1")
  })

  // R2 (revised in P4B): If a test's failed line is followed later in the same output by a passed
  // line for the same test name, that failure is not recorded.
  // Kind: invariant
  test("R2: a test that later passes in the same output is not recorded as failed", () => {
    fc.assert(
      fc.property(fc.array(outputLine, { maxLength: 15 }), testName, duration, duration, (lines, name, a, b) => {
        // Put a failure of `name` somewhere, then a pass of the same name after it.
        const output = [...lines.map((l) => l.text), `(fail) ${name}${a}`, `(pass) ${name}${b}`].join("\n")
        const failed = StudentErrorParser.parse(output).filter((m) => m.category === "test_failed")
        expect(failed.map((m) => m.message)).not.toContain(name)
      }),
      { numRuns: RUNS },
    )
    ran("R2")
  })

  // R3: The same compiler error gives the same mistake in either compiler format and with or
  // without color codes.
  // Kind: metamorphic
  test("R3: compiler format and color codes do not change the mistake", () => {
    fc.assert(
      fc.property(compilerError, colors, (error, inserts) => {
        const plain = StudentErrorParser.parse(parenStyle(error))
        expect(StudentErrorParser.parse(colonStyle(error))).toEqual(plain)
        expect(StudentErrorParser.parse(colorize(parenStyle(error), inserts))).toEqual(plain)
        expect(StudentErrorParser.parse(colorize(colonStyle(error), inserts))).toEqual(plain)
      }),
      { numRuns: RUNS },
    )
    ran("R3")
  })

  // R4: Errors that differ only in line number or variable name get the same category and code.
  // Kind: metamorphic
  test("R4: changing only the line number or variable name keeps category and code", () => {
    fc.assert(
      fc.property(
        compilerError,
        position,
        fc.stringMatching(/^[a-z][A-Za-z0-9]{0,8}$/),
        fc.stringMatching(/^[a-z][A-Za-z0-9]{0,8}$/),
        (error, otherLine, nameA, nameB) => {
          const a = StudentErrorParser.parse(parenStyle({ ...error, message: `Cannot find name '${nameA}'.` }))
          const b = StudentErrorParser.parse(
            parenStyle({ ...error, line: otherLine, message: `Cannot find name '${nameB}'.` }),
          )
          expect(b.map((m) => [m.category, m.code])).toEqual(a.map((m) => [m.category, m.code]))
        },
      ),
      { numRuns: RUNS },
    )
    ran("R4")
  })

  // R5 (revised in P4B): Parsing two outputs joined together gives the first output's mistakes
  // followed by the second's, as long as the second output does not report a pass for a test that
  // failed in the first (see R2).
  // Kind: metamorphic
  test("R5: joining two outputs joins their mistakes", () => {
    fc.assert(
      fc.property(fc.array(outputLine, { maxLength: 12 }), fc.array(outputLine, { maxLength: 12 }), (a, b) => {
        const passedInB = new Set(b.filter((l) => l.kind === "pass").map((l) => l.name))
        fc.pre(a.every((l) => l.kind !== "fail" || !passedInB.has(l.name)))
        const first = a.map((l) => l.text).join("\n")
        const second = b.map((l) => l.text).join("\n")
        expect(StudentErrorParser.parse(`${first}\n${second}`)).toEqual([
          ...StudentErrorParser.parse(first),
          ...StudentErrorParser.parse(second),
        ])
      }),
      { numRuns: RUNS },
    )
    ran("R5")
  })

  // R6: Each compiler error is recorded with its type and the exact file and line from the message.
  // Kind: round-trip (render an error to compiler text, parse it back, get the same fields)
  test("R6: rendering an error and parsing it back recovers file, line, code, message, and category", () => {
    fc.assert(
      fc.property(compilerError, fc.boolean(), (error, paren) => {
        expect(StudentErrorParser.parse(paren ? parenStyle(error) : colonStyle(error))).toEqual([
          {
            category: expectedCategory(error.code),
            code: error.code,
            message: error.message,
            file: error.file,
            line: error.line,
          },
        ])
      }),
      { numRuns: RUNS },
    )
    ran("R6")
  })

  // R7: Windows paths and Windows line endings are parsed the same as their Mac/Linux equivalents.
  // Kind: metamorphic (switching \n to \r\n must not change the result; Windows paths come from the file generator)
  test("R7: Windows line endings do not change the mistakes", () => {
    fc.assert(
      fc.property(fc.array(outputLine, { maxLength: 15 }), (lines) => {
        const texts = lines.map((l) => l.text)
        expect(StudentErrorParser.parse(texts.join("\r\n"))).toEqual(StudentErrorParser.parse(texts.join("\n")))
      }),
      { numRuns: RUNS },
    )
    ran("R7")
  })

  // R8 (revised in P4B): The number of recorded mistakes equals the number of compiler error lines
  // plus failed-test lines whose test does not pass later in the same output.
  // Kind: model / oracle (a simple count over the generated lines, written without the parser's regexes)
  test("R8: one mistake per error line and per failed test that never passes later", () => {
    fc.assert(
      fc.property(fc.array(outputLine, { maxLength: 25 }), (lines) => {
        const expected = lines.filter(
          (line, index) =>
            line.kind === "error" ||
            (line.kind === "fail" && !lines.slice(index + 1).some((l) => l.kind === "pass" && l.name === line.name)),
        ).length
        expect(StudentErrorParser.parse(lines.map((l) => l.text).join("\n"))).toHaveLength(expected)
      }),
      { numRuns: RUNS },
    )
    ran("R8")
  })
})
