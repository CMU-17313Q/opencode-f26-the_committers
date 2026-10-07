import { describe, expect, test } from "bun:test"
import type { TestSuggestion } from "@opencode-ai/schema/test-suggestion"
import path from "path"
import { EdgeCases } from "../../src/command/edge-cases"
import { ExpectedCases } from "../../src/command/expected-cases"
import { ExpectedOutput } from "../../src/command/expected-output"
import { extractFunctionSignature } from "../../src/command/signature"
import { format } from "../../src/command/test-file-formatter"
import { tmpdir } from "../fixture/fixture"

const suggestion = (overrides: Partial<TestSuggestion> = {}): TestSuggestion => ({
  functionName: "add",
  category: "expected",
  input: [2, 3],
  expectedOutput: 5,
  reason: "A typical call with valid values.",
  ...overrides,
})

describe("test-file-formatter", () => {
  test("formats expected-output suggestions into runnable Bun tests", () => {
    const result = format([suggestion()], {
      importPath: "../../src/calculator",
    })

    expect(result).toContain('import { describe, expect, test } from "bun:test"')
    expect(result).toContain('import { add } from "../../src/calculator"')
    expect(result).toContain('describe("add", () => {')
    expect(result).toContain("expect(add(2, 3)).toEqual(5)")
  })

  test("formats multiple suggestions", () => {
    const result = format(
      [
        suggestion({
          input: [2, 3],
          expectedOutput: 5,
        }),
        suggestion({
          category: "edge",
          input: [0, 3],
          expectedOutput: 3,
          reason: "Zero checks the boundary behavior.",
        }),
      ],
      {
        importPath: "../../src/calculator",
      },
    )

    expect(result).toContain("expect(add(2, 3)).toEqual(5)")
    expect(result).toContain("expect(add(0, 3)).toEqual(3)")
    expect(result).toContain("1. expected:")
    expect(result).toContain("2. edge:")
  })

  test("serializes strings, booleans, null, arrays, and objects as JSON", () => {
    const result = format(
      [
        suggestion({
          input: ["hello", true, null, [1, 2]],
          expectedOutput: { ok: true, values: [1, 2] },
        }),
      ],
      {
        importPath: "../../src/calculator",
      },
    )

    expect(result).toContain(
      'expect(add("hello", true, null, [1,2])).toEqual({"ok":true,"values":[1,2]})',
    )
  })

  test("keeps unknown expected output runnable", () => {
    const result = format(
      [
        suggestion({
          expectedOutput: ExpectedOutput.UNKNOWN,
        }),
      ],
      {
        importPath: "../../src/calculator",
      },
    )

    expect(result).toContain("Expected output could not be derived automatically.")
    expect(result).toContain("expect(() => add(2, 3)).not.toThrow()")
  })

  test("formats error suggestions as throwing tests", () => {
    const result = format(
      [
        suggestion({
          category: "error",
          reason: "Invalid input should throw.",
          expectedOutput: null,
        }),
      ],
      {
        importPath: "../../src/calculator",
      },
    )

    expect(result).toContain("expect(() => add(2, 3)).toThrow()")
  })

  test("formats no suggestions without producing invalid test code", () => {
    const result = format([], {
      importPath: "../../src/calculator",
    })

    expect(result).toContain('test.skip("No test suggestions were generated", () => {})')
    expect(result).toContain('import { describe, test } from "bun:test"')
  })

  // runs the generated file the way a student would, against correct implementations,
  // so a suggestion the formatter turns into a failing assertion is caught here
  test("generated test files pass against correct functions", async () => {
    await using tmp = await tmpdir()
    const source = `export function add(a: number, b: number): number {
  return a + b
}

export function divide(a: number, b: number): number {
  if (b === 0) throw new Error("cannot divide by zero")
  return a / b
}

export function log(message: string): void {
  console.log(message)
}
`
    await Bun.write(path.join(tmp.path, "src/math.ts"), source)

    for (const name of ["add", "divide", "log"]) {
      const extracted = extractFunctionSignature(source, name)
      if (!extracted.ok) throw new Error(extracted.message)
      const suggestions = [...ExpectedCases.generate(extracted.signature), ...EdgeCases.generate(extracted.signature)]
      await Bun.write(
        path.join(tmp.path, `test/generated/${name}.test.ts`),
        format(suggestions, { importPath: "../../src/math" }),
      )
    }

    const run = Bun.spawnSync(["bun", "test", "test/generated"], { cwd: tmp.path, stderr: "pipe" })
    const output = run.stderr.toString()

    expect(output).toContain(" 26 pass")
    expect(output).toContain(" 0 fail")
    expect(run.exitCode).toBe(0)
  })
})
