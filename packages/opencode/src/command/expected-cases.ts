import type { TestSuggestion } from "@opencode-ai/schema/test-suggestion"
import type { FunctionSignature } from "./signature"

const UNKNOWN_OUTPUT = null

// Two typical values per primitive type, so a function gets two different example calls
// instead of the same input twice. A parameter type outside this map falls back to null.
type JsonPrimitive = string | number | boolean | null

const TYPICAL_VALUES: Record<string, readonly [JsonPrimitive, JsonPrimitive]> = {
  number: [5, 12],
  string: ["example", "hello"],
  boolean: [true, false],
}


function typicalValue(type: string, variant: 0 | 1): JsonPrimitive {
  return TYPICAL_VALUES[type]?.[variant] ?? null
}

const REASONS = [
  "A typical call with small, valid values for each parameter.",
  "A second typical call with different valid values, to vary the example.",
] as const

export function generate(signature: FunctionSignature): TestSuggestion[] {
  // A function with no parameters has only one plausible "typical" call, so one
  // suggestion is returned instead of two identical ones.
  const variants: ReadonlyArray<0 | 1> = signature.parameters.length === 0 ? [0] : [0, 1]

  return variants.map((variant) => ({
    functionName: signature.name,
    category: "expected",
    // Offsetting by parameter index keeps multi-parameter calls from reusing the exact same typical value in every position
    input: signature.parameters.map((parameter, index) => typicalValue(parameter.type, ((variant + index) % 2) as 0 | 1)),
    expectedOutput: UNKNOWN_OUTPUT,
    reason: REASONS[variant],
  }))
}

export * as ExpectedCases from "./expected-cases"