import { describe, expect, test } from "bun:test"
import type { TestSuggestion } from "@opencode-ai/schema/test-suggestion"
import { format } from "../../src/command/test-file-formatter"

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
          expectedOutput: "Unknown: could not be derived from the function body, check manually",
        }),
      ],
      {
        importPath: "../../src/calculator",
      },
    )

    expect(result).toContain("Expected output could not be derived automatically.")
    expect(result).toContain("expect(add(2, 3)).toBeDefined()")
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
})