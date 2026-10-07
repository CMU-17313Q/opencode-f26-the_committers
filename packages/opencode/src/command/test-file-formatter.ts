import type { TestSuggestion } from "@opencode-ai/schema/test-suggestion"

export type FormatOptions = {
  importPath: string
}

const UNKNOWN_OUTPUT = "Unknown: could not be derived from the function body, check manually"

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

  if (suggestion.expectedOutput === UNKNOWN_OUTPUT) {
    return [
      `test(${JSON.stringify(`${index + 1}. ${title}`)}, () => {`,
      "  // Expected output could not be derived automatically.",
      `  // Reason: ${escapeComment(suggestion.reason)}`,
      `  expect(${call(suggestion)}).toBeDefined()`,
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
  return `${suggestion.functionName}(${suggestion.input.map(serialize).join(", ")})`
}

function serialize(value: unknown): string {
  return JSON.stringify(value)
}

function escapeComment(value: string): string {
  return value.replace(/\r?\n/g, " ")
}

function indent(value: string, spaces: number): string {
  const prefix = " ".repeat(spaces)

  return value
    .split("\n")
    .map((line) => (line ? prefix + line : line))
    .join("\n")
}