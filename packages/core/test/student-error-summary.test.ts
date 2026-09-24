import { describe, expect, test } from "bun:test"
import type { Row } from "@opencode-ai/core/session/student-error"
import { StudentErrorSummary } from "@opencode-ai/core/session/student-error-summary"

const row = (overrides: Partial<Row>): Row =>
  ({
    id: 1,
    session_id: "ses_summary_test",
    category: "syntax_error",
    code: null,
    message: "",
    file: null,
    line: null,
    source: "bash",
    time_created: Date.now(),
    ...overrides,
  }) as unknown as Row

const repeat = (count: number, overrides: Partial<Row>): Row[] =>
  Array.from({ length: count }, (_, index) => row({ ...overrides, id: index + 1 }))

describe("StudentErrorSummary", () => {
  test("reports when no mistake pattern recurs", () => {
    expect(StudentErrorSummary.summarize([])).toBe("No recurring mistake patterns found.")

    expect(
      StudentErrorSummary.summarize([
        row({
          category: "syntax_error",
          code: "TS1005",
          message: "'}' expected.",
        }),
      ]),
    ).toBe("No recurring mistake patterns found.")
  })

  test("groups mistakes using the classifier and produces readable text", () => {
    const history = [
      row({
        category: "undefined_name",
        code: "TS2304",
        message: "Cannot find name 'coutn'.",
      }),
      row({
        category: "undefined_name",
        code: "TS2304",
        message: "Cannot find name 'lenght'.",
      }),
      row({
        category: "undefined_name",
        code: "TS2304",
        message: "Cannot find name 'widht'.",
      }),
      row({
        category: "test_failed",
        message: "expected 4 but received 5",
      }),
      row({
        category: "test_failed",
        message: "expected 10 but received 12",
      }),
    ]

    expect(StudentErrorSummary.summarize(history)).toBe(
      "You've had 3 undefined name errors (TS2304) and 2 failed tests.",
    )
  })

  test("sorts by frequency and returns only the top three patterns", () => {
    const history = [
      ...repeat(5, {
        category: "syntax_error",
        code: "TS1005",
        message: "'}' expected.",
      }),
      ...repeat(4, {
        category: "undefined_name",
        code: "TS2304",
        message: "Cannot find name 'value'.",
      }),
      ...repeat(3, {
        category: "import_error",
        code: "TS2307",
        message: "Cannot find module 'example'.",
      }),
      ...repeat(2, {
        category: "type_error",
        code: "TS2322",
        message: "Type mismatch.",
      }),
    ]

    expect(StudentErrorSummary.summarize(history)).toBe(
      "You've had 5 syntax errors (TS1005), 4 undefined name errors (TS2304), and 3 import errors (TS2307).",
    )
  })

  test("keeps different compiler codes as separate patterns", () => {
    const history = [
      ...repeat(3, {
        category: "type_error",
        code: "TS2345",
        message: "Invalid argument.",
      }),
      ...repeat(2, {
        category: "type_error",
        code: "TS2322",
        message: "Type mismatch.",
      }),
    ]

    expect(StudentErrorSummary.summarize(history)).toBe("You've had 3 type errors (TS2345) and 2 type errors (TS2322).")
  })
  test("summarizes one recurring pattern", () => {
    const history = repeat(2, {
      category: "off_by_one",
      code: null,
      message: "Loop ended at the wrong index.",
    })

    expect(StudentErrorSummary.summarize(history)).toBe("You've had 2 off by one mistakes.")
  })

  test("does not include mistakes that occurred only once", () => {
    const history = [
      ...repeat(2, {
        category: "syntax_error",
        code: "TS1005",
        message: "'}' expected.",
      }),
      row({
        category: "undefined_name",
        code: "TS2304",
        message: "Cannot find name 'value'.",
      }),
    ]

    expect(StudentErrorSummary.summarize(history)).toBe("You've had 2 syntax errors (TS1005).")
  })
  test("uses a consistent order when patterns have equal counts", () => {
    const history = [
      ...repeat(2, {
        category: "syntax_error",
        code: "TS1005",
        message: "'}' expected.",
      }),
      ...repeat(2, {
        category: "import_error",
        code: "TS2307",
        message: "Cannot find module 'example'.",
      }),
    ]

    expect(StudentErrorSummary.summarize(history)).toBe(
      "You've had 2 import errors (TS2307) and 2 syntax errors (TS1005).",
    )
  })

  test("does not change the original mistake history", () => {
    const history = [
      ...repeat(3, {
        category: "type_error",
        code: "TS2322",
        message: "Type mismatch.",
      }),
      ...repeat(2, {
        category: "test_failed",
        message: "expected 4 but received 5",
      }),
    ]
    const original = [...history]

    StudentErrorSummary.summarize(history)

    expect(history).toEqual(original)
  })
})
