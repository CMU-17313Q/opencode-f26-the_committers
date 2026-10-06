import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { TestSuggestion } from "@opencode-ai/schema/test-suggestion"
import { extractFunctionSignature } from "../../src/command/signature"
import { EdgeCases } from "../../src/command/edge-cases"
import { ExpectedOutput } from "../../src/command/expected-output"

function signatureFor(source: string) {
  const result = extractFunctionSignature(source)
  if (!result.ok) throw new Error(result.message)
  return result.signature
}

function cases(source: string) {
  return EdgeCases.generate(signatureFor(source)).map((suggestion) => [suggestion.input, suggestion.expectedOutput])
}

describe("EdgeCases.generate", () => {
  test("number parameters: boundaries per parameter, with a guard clause throw derived from the body", () => {
    expect(
      cases(`
        function divide(a: number, b: number): number {
          if (b === 0) throw new Error("cannot divide by zero")
          return a / b
        }
      `),
    ).toEqual([
      [[0, 5], 0],
      [[-1, 5], -0.2],
      [[0.5, 5], 0.1],
      [[Number.MAX_SAFE_INTEGER, 5], Number.MAX_SAFE_INTEGER / 5],
      [[5, 0], "Error"],
      [[5, -1], -5],
      [[5, 0.5], 10],
      [[5, Number.MAX_SAFE_INTEGER], 5 / Number.MAX_SAFE_INTEGER],
    ])
  })

  test("string parameter: empty, whitespace, long and Unicode text", () => {
    expect(
      cases(`
        function shout(text: string): string {
          return text.length === 0 ? "nothing to say" : text + "!"
        }
      `),
    ).toEqual([
      [[""], "nothing to say"],
      [[" "], " !"],
      [["a".repeat(100)], "a".repeat(100) + "!"],
      [["héllo wörld 🎉"], "héllo wörld 🎉!"],
    ])
  })

  test("array parameter: empty, single element and duplicates", () => {
    expect(
      cases(`
        function first(items: number[]): number {
          if (items.length === 0) {
            return -1
          }
          return items[0]
        }
      `),
    ).toEqual([
      [[[]], -1],
      [[[5]], 5],
      [[[5, 5]], 5],
    ])
  })

  test("boolean parameter: both values plus null", () => {
    expect(
      cases(`
        function label(flag: boolean): string {
          return flag ? "on" : "off"
        }
      `),
    ).toEqual([
      [[true], "on"],
      [[false], "off"],
      [[null], "off"],
    ])
  })

  test("optional parameter: type edges plus leaving the argument out", () => {
    expect(
      cases(`
        function greet(name?: string): string {
          return "Hello, " + (name ?? "guest")
        }
      `),
    ).toEqual([
      [[""], "Hello, "],
      [[" "], "Hello,  "],
      [["a".repeat(100)], "Hello, " + "a".repeat(100)],
      [["héllo wörld 🎉"], "Hello, héllo wörld 🎉"],
      [[], "Hello, guest"],
    ])
  })

  test("falls back when the expected output cannot be derived from the body", () => {
    const unsupported = cases(`
      function total(prices: number[]): number {
        return prices.reduce((sum, price) => sum + price, 0)
      }
    `)
    const missing = cases(`declare function parse(input: string): number`)

    expect(unsupported.map(([, output]) => output)).toEqual(Array(3).fill(ExpectedOutput.UNKNOWN))
    expect(missing.map(([, output]) => output)).toEqual(Array(4).fill(ExpectedOutput.UNKNOWN))
  })

  test("reports a TypeError when the body reads a property of null", () => {
    expect(
      cases(`
        function size(flag: boolean): number {
          return flag.length
        }
      `).at(-1),
    ).toEqual([[null], "TypeError"])
  })

  test("returns no edge cases for a function without parameters", () => {
    expect(cases(`function now(): number { return 1 }`)).toEqual([])
  })

  test("every suggestion matches the shared TestSuggestion type exactly", () => {
    const suggestions = EdgeCases.generate(
      signatureFor(`
        function describe(count: number, name: string, tags: string[], active: boolean, note?: string): string {
          return name
        }
      `),
    )

    expect(suggestions.length).toBe(4 + 4 + 3 + 3 + 5)
    suggestions.forEach((suggestion) => {
      expect(Schema.decodeUnknownSync(TestSuggestion)(suggestion)).toEqual(suggestion)
      expect(Object.keys(suggestion).sort()).toEqual(["category", "expectedOutput", "functionName", "input", "reason"])
      expect(suggestion).toMatchObject({ functionName: "describe", category: "edge" })
      expect(suggestion.reason.length).toBeGreaterThan(0)
      expect(suggestion.expectedOutput).not.toBeUndefined()
    })
  })
})
