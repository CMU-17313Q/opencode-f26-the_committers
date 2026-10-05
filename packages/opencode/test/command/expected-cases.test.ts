import { describe, expect, test } from "bun:test"
import { extractFunctionSignature } from "../../src/command/signature"
import { ExpectedCases } from "../../src/command/expected-cases"

function signatureFor(source: string, functionName?: string) {
  const result = extractFunctionSignature(source, functionName)
  if (!result.ok) throw new Error(result.message)
  return result.signature
}

describe("ExpectedCases.generate", () => {
  test("generates two varied inputs for number parameters", () => {
    const signature = signatureFor(`
      function add(a: number, b: number): number {
        return a + b
      }
    `)

    const suggestions = ExpectedCases.generate(signature)

    expect(suggestions).toHaveLength(2)
    expect(suggestions.every((suggestion) => suggestion.functionName === "add")).toBe(true)
    expect(suggestions.every((suggestion) => suggestion.category === "expected")).toBe(true)
    expect(suggestions.map((suggestion) => suggestion.input)).toEqual([
      [5, 12],
      [12, 5],
    ])
  })

  test("generates two typical inputs for a string parameter", () => {
    const signature = signatureFor(`
      function greet(name: string): string {
        return "Hello, " + name
      }
    `)

    const suggestions = ExpectedCases.generate(signature)

    expect(suggestions.map((suggestion) => suggestion.input)).toEqual([["example"], ["hello"]])
  })

  test("generates two typical inputs for a boolean parameter", () => {
    const signature = signatureFor(`
      function isValid(flag: boolean): boolean {
        return flag
      }
    `)

    const suggestions = ExpectedCases.generate(signature)

    expect(suggestions.map((suggestion) => suggestion.input)).toEqual([[true], [false]])
  })

  test("returns one suggestion for a function with no parameters", () => {
    const signature = signatureFor(`
      function getName(): string {
        return "Alice"
      }
    `)

    const suggestions = ExpectedCases.generate(signature)

    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]).toMatchObject({ functionName: "getName", category: "expected", input: [] })
  })

  test("falls back to null for a parameter type outside the typical-value map", () => {
    const signature = signatureFor(`
      function process(item: CustomType): void {}
    `)

    const suggestions = ExpectedCases.generate(signature)

    expect(suggestions.map((suggestion) => suggestion.input)).toEqual([[null], [null]])
  })

  test("leaves expectedOutput as an explicit placeholder with a non-empty reason", () => {
    const signature = signatureFor(`
      function add(a: number, b: number): number {
        return a + b
      }
    `)

    const suggestions = ExpectedCases.generate(signature)

    expect(suggestions.every((suggestion) => suggestion.expectedOutput === null)).toBe(true)
    expect(suggestions.every((suggestion) => suggestion.reason.length > 0)).toBe(true)
  })
})