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

// and this matches a passed test line like `\u2713 test name [12ms]` or `(pass) test name [12ms]`
const passedTest = /^(?:[\u2713\u2714]|\(pass\)) (.+?)(?: ?\[[\d.]+ms\])?$/

export function parse(output: string): ParsedError[] {
  const lines = output
    .replace(colors, "")
    .split("\n")
    .map((text) => text.trim())
  return lines.flatMap((line, index): ParsedError[] => {
    const compiler = compilerError.exec(line)
    if (compiler) {
      const [, file = "", parenLine, colonLine, code = "", message = ""] = compiler
      return [{ category: categorize(code), code, message, file, line: Number(parenLine ?? colonLine) }]
    }
    const failed = failedTest.exec(line)
    if (!failed) return []
    const name = failed[1] ?? ""
    // a test that passes later in the same output was retried, so its earlier failure is not a mistake
    if (lines.slice(index + 1).some((later) => passedTest.exec(later)?.[1] === name)) return []
    return [{ category: "test_failed", message: name }]
  })
}

// typescript error codes are categorized into syntax, type, and import errors. Some specific codes are categorized as undefined name errors.
function categorize(code: string): string {
  if (/^TS1\d{3}$/.test(code)) return "syntax_error"
  if (code === "TS2304" || code === "TS2552") return "undefined_name"
  if (code === "TS2307") return "import_error"
  return "type_error"
}
