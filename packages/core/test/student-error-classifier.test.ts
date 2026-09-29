import { describe, expect, test } from "bun:test"
import type { Row } from "@opencode-ai/core/session/student-error"
import { StudentErrorClassifier } from "@opencode-ai/core/session/student-error-classifier"

// builds a fake stored Row without touching the database, since the classifier only reads
// category/code/message off it; id/session_id are irrelevant to the matching logic
const row = (overrides: Partial<Row>): Row =>
  ({
    id: 1,
    session_id: "ses_classifier_test",
    category: "syntax_error",
    code: null,
    message: "",
    file: null,
    line: null,
    source: "bash",
    time_created: Date.now(),
    ...overrides,
  }) as unknown as Row

describe("StudentErrorClassifier", () => {
  test("matches two compiler errors with the same category and code", () => {
    const history = [
      row({ category: "undefined_name", code: "TS2304", message: "Cannot find name 'coutn'.", file: "a.ts" }),
    ]
    const result = StudentErrorClassifier.classify(
      { category: "undefined_name", code: "TS2304", message: "Cannot find name 'lenght'." },
      history,
    )
    expect(result.isNewPattern).toBe(false)
    expect(result.matches).toHaveLength(1)
  })

  test("does not match errors from different categories, even with a similar message", () => {
    const history = [row({ category: "syntax_error", code: "TS1005", message: "Cannot find name 'x'." })]
    const result = StudentErrorClassifier.classify(
      { category: "type_error", code: "TS2322", message: "Cannot find name 'x'." },
      history,
    )
    expect(result.isNewPattern).toBe(true)
    expect(result.matches).toHaveLength(0)
  })

  test("matches two failed tests whose messages only differ by a number", () => {
    const history = [row({ category: "test_failed", code: null, message: "expected 4 but received 5" })]
    const result = StudentErrorClassifier.classify(
      { category: "test_failed", message: "expected 10 but received 12" },
      history,
    )
    expect(result.isNewPattern).toBe(false)
    expect(result.matches).toHaveLength(1)
  })

  test("treats unrelated failed-test messages as a new pattern", () => {
    const history = [row({ category: "test_failed", code: null, message: "adds two numbers" })]
    const result = StudentErrorClassifier.classify({ category: "test_failed", message: "reverses a string" }, history)
    expect(result.isNewPattern).toBe(true)
    expect(result.matches).toHaveLength(0)
  })

  test("does not match the same category with a different compiler code", () => {
    const history = [
      row({
        category: "type_error",
        code: "TS2322",
        message: "Type 'string' is not assignable to type 'number'.",
      }),
    ]
    const result = StudentErrorClassifier.classify(
      {
        category: "type_error",
        code: "TS2345",
        message: "Argument of type 'string' is not assignable to parameter of type 'number'.",
      },
      history,
    )
    expect(result.isNewPattern).toBe(true)
    expect(result.matches).toHaveLength(0)
  })

  test("groups a new mistake with every matching past mistake, not just the first", () => {
    const history = [
      row({ category: "undefined_name", code: "TS2304", message: "Cannot find name 'coutn'.", file: "a.ts" }),
      row({ category: "type_error", code: "TS2322", message: "Type mismatch." }),
      row({ category: "undefined_name", code: "TS2304", message: "Cannot find name 'lenght'.", file: "b.ts" }),
    ]
    const result = StudentErrorClassifier.classify(
      { category: "undefined_name", code: "TS2304", message: "Cannot find name 'widht'." },
      history,
    )
    expect(result.isNewPattern).toBe(false)
    expect(result.matches).toHaveLength(2)
    expect(result.matches.every((match: Row) => match.category === "undefined_name")).toBe(true)
  })
})
