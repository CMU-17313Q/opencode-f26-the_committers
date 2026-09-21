export * as StudentErrorParser from "./student-error-parser"

export interface ParsedError {
  readonly category: string
  readonly code?: string
  readonly message: string
  readonly file?: string
  readonly line?: number
}

// parse can read both compiler styles: `file.ts(3,5): error TS1005: msg` and `file.ts:3:5 - error TS1005: msg`
const compilerError = /^(.+?)(?:\((\d+),\d+\):|:(\d+):\d+ -) error (TS\d+): (.*)$/

// striping color from compiler output before matching
const colors = /\u001b\[[0-9;]*m/g
 
// this matches a failed test line like `x test name [12ms]` or `(fail) test name [12ms]`
const failedTest = /^(?:[\u2717\u2718]|\(fail\)) (.+?)(?: ?\[[\d.]+ms\])?$/

export function parse(output: string): ParsedError[] {
  return output
    .replace(colors, "")
    .split("\n")
    .flatMap((text): ParsedError[] => {
      const line = text.trim()
      const compiler = compilerError.exec(line)
      if (compiler) {
        const [, file = "", parenLine, colonLine, code = "", message = ""] = compiler
        return [{ category: categorize(code), code, message, file, line: Number(parenLine ?? colonLine) }]
      }
      const failed = failedTest.exec(line)
      if (failed) return [{ category: "test_failed", message: failed[1] ?? "" }]
      return []
    })
}

// typescript error codes are categorized into syntax, type, and import errors. Some specific codes are categorized as undefined name errors.
function categorize(code: string): string {
    if (/^TS1\d{3}$/.test(code)) return "syntax_error"
    if (code === "TS2304" || code === "TS2552") return "undefined_name"
    if (code === "TS2307") return "import_error"
    return "type_error"
}