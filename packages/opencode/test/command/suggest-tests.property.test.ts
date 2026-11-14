// Property-based tests for /suggest-tests (P4B, lalmeada).
// Target modules: signature.ts (reads the function) and test-file-formatter.ts (writes the test file).
// Each property names the requirement it checks (see traceability/lalmeada.md) and its kind.
import { describe, expect, test } from "bun:test"
import * as fc from "fast-check"
import ts from "typescript"
import type { TestSuggestion } from "@opencode-ai/schema/test-suggestion"
import { EdgeCases } from "../../src/command/edge-cases"
import { ExpectedCases } from "../../src/command/expected-cases"
import { ExpectedOutput } from "../../src/command/expected-output"
import { extractFunctionSignature } from "../../src/command/signature"
import { format } from "../../src/command/test-file-formatter"

const RUNS = { numRuns: 300 }
const IMPORT = { importPath: "../../src/source" }

// ---------------------------------------------------------------------------
// Generators for whole functions (used by R1 and R2)
//
// A function is built from a small description instead of random text, so every
// generated function is one a student could really write, and renaming a
// parameter can be done exactly (no find-and-replace mistakes).
// - Parameter names: short math-style names (a, b, x) like the add() demo the
//   interviewees saw, plus longer real-world names. Locals used inside bodies
//   (acc, el) are never used as parameter names.
// - Parameter types: every type the edge-case generator handles (number, string,
//   boolean, arrays), an unknown type (Date), no type at all, and optional ones.
// - Bodies: arithmetic, negation, a divide-by-zero guard that throws, .length,
//   a ternary, and a loop the tool cannot evaluate (so "Unknown" outputs appear).
// ---------------------------------------------------------------------------
const PARAM_NAMES = ["a", "b", "c", "x", "y", "n", "price", "count", "width", "height", "name", "items", "flag", "rate"]
const NEW_NAMES = ["renamed", "q", "z", "amount", "input2"]
const FUNCTION_NAMES = ["add", "compute", "calc", "check", "f"]
const TYPES = ["number", "string", "boolean", "number[]", "string[]", "Date", ""]

type Param = { name: string; type: string; optional: boolean }
type FunctionSpec = { name: string; params: Param[]; body: number; op: string }

const paramArb = (name: string) =>
  fc.record({ name: fc.constant(name), type: fc.constantFrom(...TYPES), optional: fc.boolean() })

const functionSpecArb: fc.Arbitrary<FunctionSpec> = fc
  .uniqueArray(fc.constantFrom(...PARAM_NAMES), { minLength: 1, maxLength: 3 })
  .chain((names) =>
    fc.record({
      name: fc.constantFrom(...FUNCTION_NAMES),
      params: fc.tuple(...names.map(paramArb)),
      body: fc.integer({ min: 0, max: 6 }),
      op: fc.constantFrom("+", "-", "*", "/", "===", ">"),
    }),
  )

function renderFunction(spec: FunctionSpec): string {
  const p = spec.params.map((param) => param.name)
  const first = p[0]
  const last = p[p.length - 1]
  const bodies = [
    `return ${first}`,
    `return ${first} ${spec.op} ${last}`,
    `return -${first}`,
    `if (${last} === 0) throw new Error("cannot divide by zero")\n  return ${first} / ${last}`,
    `return ${first}.length`,
    `return ${first} ? ${last} : ${first}`,
    `let acc = 0\n  for (const el of [${first}]) acc += 1\n  return acc`,
  ]
  const params = spec.params
    .map((param) => `${param.name}${param.optional ? "?" : ""}${param.type ? `: ${param.type}` : ""}`)
    .join(", ")
  return `export function ${spec.name}(${params}) {\n  ${bodies[spec.body]}\n}\n`
}

// Runs the real /suggest-tests pipeline: read the function, generate cases, format the file.
function suggestTests(source: string) {
  const extracted = extractFunctionSignature(source)
  if (!extracted.ok) throw new Error(`could not read generated function: ${extracted.message}\n${source}`)
  const suggestions = [...ExpectedCases.generate(extracted.signature), ...EdgeCases.generate(extracted.signature)]
  return { suggestions, file: format(suggestions, IMPORT) }
}

// ---------------------------------------------------------------------------
// Generators for lists of test suggestions (used by R3 to R7)
//
// These feed the formatter directly, so they cover values the formatter must
// handle even if today's case generators rarely produce them:
// - Numbers: zero, negative zero, -1, fractions, very large and very small values
//   (O-4: "zero, negative numbers, or really large numbers").
// - Text: random unicode plus characters that can break generated code if they
//   are not escaped: quotes, backslashes, comment markers, and every kind of
//   line break (\n, \r, U+2028, U+2029).
// - Values: nested arrays and objects up to two levels, like real inputs, with
//   object keys that include "__proto__" (found by fast-check, see the triage log).
// - Expected outputs: known values, and the "Unknown" marker (S-1, S-2, C-4).
// ---------------------------------------------------------------------------
const SPECIAL_TEXT = ["\n", "\r", "\r\n", "\u2028", "\u2029", "*/", "/*", "//", '"', "'", "`", "${", "\\", " ", "x", "é", "🎉"]
const textArb = fc.oneof(
  fc.string(),
  fc.string({ unit: "binary" }),
  fc.array(fc.constantFrom(...SPECIAL_TEXT), { maxLength: 6 }).map((parts) => parts.join("")),
)
const numberArb = fc.oneof(
  fc.constantFrom(0, -0, -1, 0.5, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER, 1e-7, 1e21),
  fc.integer({ min: -1000, max: 1000 }),
  fc.double({ noNaN: true, noDefaultInfinity: true }),
)
const leafArb = fc.oneof(numberArb, textArb, fc.boolean(), fc.constant(null))
// Object keys: any text, plus keys JavaScript treats specially in object literals
// ("__proto__" sets the prototype instead of adding a key) so they are tried on every run.
const keyArb = fc.oneof(fc.string(), fc.constantFrom("__proto__", "constructor", "toString"))
const jsonArb = (depth: number): fc.Arbitrary<unknown> =>
  depth === 0
    ? leafArb
    : fc.oneof(
        leafArb,
        fc.array(jsonArb(depth - 1), { maxLength: 3 }),
        fc.dictionary(keyArb, jsonArb(depth - 1), { maxKeys: 3 }),
      )

const suggestionListArb = (expectedOutput: fc.Arbitrary<unknown>) =>
  fc.constantFrom(...FUNCTION_NAMES).chain((functionName) =>
    fc.array(
      fc.record({
        functionName: fc.constant(functionName),
        category: fc.constantFrom("expected", "edge", "error"),
        input: fc.array(jsonArb(2), { maxLength: 3 }),
        expectedOutput,
        reason: textArb,
      }),
      { minLength: 1, maxLength: 8 },
    ),
  ) as fc.Arbitrary<TestSuggestion[]>

const anySuggestions = suggestionListArb(fc.oneof(jsonArb(2), fc.constant(ExpectedOutput.UNKNOWN)))

// ---------------------------------------------------------------------------
// Helpers that read a generated test file back with the TypeScript parser
// ---------------------------------------------------------------------------
type GeneratedTest = { title: string; body: ts.Block }

function testsIn(file: string): GeneratedTest[] {
  const source = ts.createSourceFile("generated.test.ts", file, ts.ScriptTarget.Latest, true)
  const tests: GeneratedTest[] = []
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "test") {
      const [title, fn] = node.arguments
      if (title && ts.isStringLiteral(title) && fn && ts.isArrowFunction(fn) && ts.isBlock(fn.body)) {
        tests.push({ title: title.text, body: fn.body })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return tests
}

function syntaxErrors(file: string): string[] {
  const result = ts.transpileModule(file, { reportDiagnostics: true })
  return (result.diagnostics ?? []).map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))
}

const isKnown = (s: TestSuggestion) => s.category !== "error" && s.expectedOutput !== ExpectedOutput.UNKNOWN
const callArgs = (s: TestSuggestion) => (Array.isArray(s.input) ? s.input : [s.input])

describe("/suggest-tests properties", () => {
  // R1: Changing a parameter name should not affect the generated test scenarios or expected results.
  // Kind: metamorphic
  test("R1: renaming a parameter keeps every input and expected result", () => {
    fc.assert(
      fc.property(
        functionSpecArb,
        fc.integer({ min: 0, max: 2 }),
        fc.constantFrom(...NEW_NAMES),
        (spec, which, newName) => {
          const index = which % spec.params.length
          const oldName = spec.params[index].name
          const renamed = { ...spec, params: spec.params.map((p, i) => (i === index ? { ...p, name: newName } : p)) }

          const before = suggestTests(renderFunction(spec))
          const after = suggestTests(renderFunction(renamed))

          // Only the parameter's own name may change: it appears at the start of
          // edge-case reasons, e.g. "a: zero is a boundary..." -> "renamed: zero is...".
          const expected = before.suggestions.map((s) => ({
            ...s,
            reason: s.reason.startsWith(`${oldName}: `) ? `${newName}: ${s.reason.slice(oldName.length + 2)}` : s.reason,
          }))
          expect(after.suggestions).toEqual(expected)
          expect(after.file).toBe(format(expected, IMPORT))
        },
      ),
      RUNS,
    )
  })

  // R2: Generating tests repeatedly for an unchanged function should produce consistent results.
  // Kind: invariant
  test("R2: the same function always gives the same test file", () => {
    fc.assert(
      fc.property(functionSpecArb, functionSpecArb, (spec, other) => {
        const first = suggestTests(renderFunction(spec)).file
        suggestTests(renderFunction(other)) // another run in between must not leak into the next one
        const second = suggestTests(renderFunction(spec)).file
        expect(second).toBe(first)
      }),
      RUNS,
    )
  })

  // R3: The formatter should produce valid TypeScript test files that can be executed.
  // Acceptance (P4B): for any list of suggestions, the generated file has zero syntax errors.
  // Kind: invariant
  test("R3: every generated test file is valid TypeScript", () => {
    fc.assert(
      fc.property(anySuggestions, (suggestions) => {
        const file = format(suggestions, IMPORT)
        expect(syntaxErrors(file)).toEqual([])
        expect(testsIn(file)).toHaveLength(suggestions.length)
      }),
      RUNS,
    )
  })

  // R4: Every test with a known expected answer is written as exactly
  // expect(fn(args)).toEqual(answer), with the arguments in order.
  // Kind: model / oracle
  // The model writes each value as a plain JavaScript literal, the obvious way:
  // numbers with String() except negative zero, which must stay "-0"; strings,
  // booleans and null with JSON; arrays and objects element by element, writing a
  // "__proto__" key as ["__proto__"] so it stays a normal key.
  test("R4: known-answer tests match the simple model expect(fn(args)).toEqual(answer)", () => {
    const literal = (value: unknown): string => {
      if (typeof value === "number") return Object.is(value, -0) ? "-0" : String(value)
      if (Array.isArray(value)) return `[${value.map(literal).join(",")}]`
      if (value !== null && typeof value === "object")
        return `{${Object.entries(value)
          .map(([k, v]) => `${k === "__proto__" ? `[${JSON.stringify(k)}]` : JSON.stringify(k)}:${literal(v)}`)
          .join(",")}}`
      return JSON.stringify(value)
    }
    fc.assert(
      fc.property(anySuggestions, (suggestions) => {
        const tests = testsIn(format(suggestions, IMPORT))
        suggestions.forEach((s, i) => {
          if (!isKnown(s)) return
          const model = `expect(${s.functionName}(${callArgs(s).map(literal).join(", ")})).toEqual(${literal(s.expectedOutput)})`
          expect(tests[i].body.statements.map((st) => st.getText())).toEqual([model])
        })
      }),
      RUNS,
    )
  })

  // R5: Every test title starts with its number and its category (expected, edge or error).
  // Kind: invariant
  test("R5: every test title starts with its number and category", () => {
    fc.assert(
      fc.property(anySuggestions, (suggestions) => {
        const titles = testsIn(format(suggestions, IMPORT)).map((t) => t.title)
        expect(titles).toHaveLength(suggestions.length)
        suggestions.forEach((s, i) => {
          expect(titles[i].startsWith(`${i + 1}. ${s.category}: `)).toBe(true)
        })
      }),
      RUNS,
    )
  })

  // R6: The formatter must keep the expected values exactly as they were provided
  // by the test-generation logic.
  // Kind: round-trip (format the value into the file, read it back, compare)
  test("R6: expected values read back from the file equal the originals", () => {
    fc.assert(
      fc.property(suggestionListArb(jsonArb(2)), (suggestions) => {
        const tests = testsIn(format(suggestions, IMPORT))
        suggestions.forEach((s, i) => {
          if (!isKnown(s)) return
          const statement = tests[i].body.statements[0]
          if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression))
            throw new Error(`test ${i + 1} is not an expect(...) call`)
          const written = statement.expression.arguments[0].getText()
          const readBack = new Function(`return (${written})`)()
          expect(readBack).toEqual(s.expectedOutput)
        })
      }),
      RUNS,
    )
  })

  // R6 (same requirement, end to end): an expected value of negative zero comes from
  // a real function, e.g. neg(0) for `return -a`, and must survive into the file.
  // Kind: round-trip
  test("R6: negative-zero results from real functions survive formatting", () => {
    fc.assert(
      fc.property(fc.constantFrom(...PARAM_NAMES), (name) => {
        const { suggestions, file } = suggestTests(`export function neg(${name}: number): number { return -${name} }`)
        const tests = testsIn(file)
        suggestions.forEach((s, i) => {
          if (!isKnown(s)) return
          const statement = tests[i].body.statements[0] as ts.ExpressionStatement
          const written = (statement.expression as ts.CallExpression).arguments[0].getText()
          expect(new Function(`return (${written})`)()).toEqual(s.expectedOutput)
        })
      }),
      { numRuns: 20 },
    )
  })

  // R7: When the expected output is unknown, the generated test never asserts a specific
  // value and shows a visible note telling the student to check it manually.
  // Kind: invariant
  test("R7: unknown answers are never asserted and are always flagged", () => {
    fc.assert(
      fc.property(anySuggestions, (suggestions) => {
        const tests = testsIn(format(suggestions, IMPORT))
        suggestions.forEach((s, i) => {
          if (s.category === "error" || s.expectedOutput !== ExpectedOutput.UNKNOWN) return
          const text = tests[i].body.getFullText()
          expect(text).not.toContain(".toEqual(")
          expect(text).toContain("Expected output could not be derived automatically.")
        })
      }),
      RUNS,
    )
  })
})