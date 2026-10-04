import type { TestSuggestion } from "./test-suggestion"

export const mockSuggestions: readonly TestSuggestion[] = [
  {
    functionName: "add",
    category: "expected",
    input: [2, 3],
    expectedOutput: 5,
    reason: "Two positive numbers should return their sum.",
  },
  {
    functionName: "add",
    category: "edge",
    input: [0, 0],
    expectedOutput: 0,
    reason: "Adding two zeros should return zero.",
  },
  {
    functionName: "add",
    category: "error",
    input: [null, 3],
    expectedOutput: "TypeError",
    reason: "This sample assumes the function rejects null input.",
  },
]
