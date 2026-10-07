import { describe, expect, test } from "bun:test"
import { StudentErrorParser } from "@opencode-ai/core/session/student-error-parser"

describe("StudentErrorParser", () => {
  test("reads a syntax error", () => {
    expect(StudentErrorParser.parse("src/main.ts(3,5): error TS1005: ';' expected.")).toEqual([
      { category: "syntax_error", code: "TS1005", message: "';' expected.", file: "src/main.ts", line: 3 },
    ])
  })

  test("reads a type error in the other compiler style", () => {
    expect(
      StudentErrorParser.parse("src/main.ts:8:5 - error TS2322: Type 'string' is not assignable to type 'number'."),
    ).toEqual([
      {
        category: "type_error",
        code: "TS2322",
        message: "Type 'string' is not assignable to type 'number'.",
        file: "src/main.ts",
        line: 8,
      },
    ])
  })

  test("reads an undefined name", () => {
    expect(StudentErrorParser.parse("src/main.ts(12,3): error TS2304: Cannot find name 'coutn'.")).toEqual([
      { category: "undefined_name", code: "TS2304", message: "Cannot find name 'coutn'.", file: "src/main.ts", line: 12 },
    ])
  })

  test("reads a failed test", () => {
    expect(StudentErrorParser.parse("\u2717 adds two numbers [1.20ms]")).toEqual([
      { category: "test_failed", message: "adds two numbers" },
    ])
  })

  test("finds several errors and skips other lines", () => {
    const output = [
      "src/main.ts(3,5): error TS1005: ';' expected.",
      "src/util.ts(10,1): error TS2307: Cannot find module './missing' or its corresponding type declarations.",
      "Found 2 errors in 2 files.",
    ].join("\n")

    expect(StudentErrorParser.parse(output).map((error) => error.category)).toEqual(["syntax_error", "import_error"])
  })

  test("ignores terminal color codes", () => {
    const output =
      "\u001b[96msrc/main.ts\u001b[0m:\u001b[93m3\u001b[0m:\u001b[93m5\u001b[0m - \u001b[91merror\u001b[0m\u001b[90m TS1005: \u001b[0m';' expected."

    expect(StudentErrorParser.parse(output)).toEqual([
      { category: "syntax_error", code: "TS1005", message: "';' expected.", file: "src/main.ts", line: 3 },
    ])
  })

  test("returns nothing when there are no errors", () => {
    expect(StudentErrorParser.parse("Build finished successfully.")).toEqual([])
  })
})