import { Schema } from "effect"

export const Category = Schema.Literals(["expected", "edge", "error"]).annotate({
  identifier: "TestSuggestion.Category",
})

export type Category = Schema.Schema.Type<typeof Category>

export const TestSuggestion = Schema.Struct({
  functionName: Schema.String,
  category: Category,
  input: Schema.Json,
  expectedOutput: Schema.Json,
  reason: Schema.String,
}).annotate({ identifier: "TestSuggestion" })

export interface TestSuggestion extends Schema.Schema.Type<typeof TestSuggestion> {}

export * as TestSuggestions from "./test-suggestion"
