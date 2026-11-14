import type { TestSuggestion } from "@opencode-ai/schema/test-suggestion"
import { ExpectedOutput } from "./expected-output"

export type FormatOptions = {
  importPath: string
}

export function format(
  suggestions: readonly TestSuggestion[],
  options: FormatOptions,
): string {
  if (suggestions.length === 0) {
    return [
      'import { describe, test } from "bun:test"',
      "",
      'describe("generated tests", () => {',
      '  test.skip("No test suggestions were generated", () => {})',
      "})",
      "",
    ].join("\n")
  }

  const functionName = suggestions[0].functionName

  const tests = suggestions
    .map((suggestion, index) => formatSuggestion(suggestion, index))
    .join("\n\n")

  return [
    'import { describe, expect, test } from "bun:test"',
    `import { ${functionName} } from ${JSON.stringify(options.importPath)}`,
    "",
    `describe(${JSON.stringify(functionName)}, () => {`,
    indent(tests, 2),
    "})",
    "",
  ].join("\n")
}

function formatSuggestion(
  suggestion: TestSuggestion,
  index: number,
): string {
  const title = `${suggestion.category}: ${suggestion.reason}`

  if (suggestion.category === "error") {
    return [
      `test(${JSON.stringify(`${index + 1}. ${title}`)}, () => {`,
      `  expect(() => ${call(suggestion)}).toThrow()`,
      "})",
    ].join("\n")
  }

  if (suggestion.expectedOutput === ExpectedOutput.UNKNOWN) {
    return [
      `test(${JSON.stringify(`${index + 1}. ${title}`)}, () => {`,
      "  // Expected output could not be derived automatically.",
      `  // Reason: ${escapeComment(suggestion.reason)}`,
      // only checks the call runs: toBeDefined() would fail every function that returns nothing
      `  expect(() => ${call(suggestion)}).not.toThrow()`,
      "})",
    ].join("\n")
  }

  return [
    `test(${JSON.stringify(`${index + 1}. ${title}`)}, () => {`,
    `  expect(${call(suggestion)}).toEqual(${serialize(suggestion.expectedOutput)})`,
    "})",
  ].join("\n")
}

function call(suggestion: TestSuggestion): string {
  const input = Array.isArray(suggestion.input) ? suggestion.input : [suggestion.input]
  return `${suggestion.functionName}(${input.map(serialize).join(", ")})`
}

// JSON.stringify writes negative zero as 0, but toEqual treats 0 and -0 as different,
// so a test expecting -0 would fail. Write -0 out by hand, including inside arrays and objects.
function serialize(value: unknown): string {
  if (Object.is(value, -0)) return "-0"
  if (Array.isArray(value)) return `[${value.map(serialize).join(",")}]`
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).map(([key, item]) => `${objectKey(key)}:${serialize(item)}`)
    return `{${entries.join(",")}}`
  }
  return JSON.stringify(value)
}

// In an object literal, "__proto__": sets the object's prototype instead of adding a key,
// so the value read back would lose that key. ["__proto__"]: adds it as a normal key.
function objectKey(key: string): string {
  return key === "__proto__" ? `[${JSON.stringify(key)}]` : JSON.stringify(key)
}

// A // comment ends at any line break, and JavaScript has four: \n, \r, U+2028 and U+2029.
// Replacing only \n let the rest of the reason spill out of the comment as broken code.
function escapeComment(value: string): string {
  return value.replace(/\r\n|[\r\n\u2028\u2029]/g, " ")
}

function indent(value: string, spaces: number): string {
  const prefix = " ".repeat(spaces)

  return value
    .split("\n")
    .map((line) => (line ? prefix + line : line))
    .join("\n")
}