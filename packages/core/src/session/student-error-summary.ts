export * as StudentErrorSummary from "./student-error-summary"

import type { Row } from "./student-error"
import { StudentErrorClassifier } from "./student-error-classifier"

type Pattern = {
  readonly example: Row
  readonly count: number
}

export function summarize(history: ReadonlyArray<Row>): string {
  const patterns = history.reduce<Pattern[]>((groups, mistake) => {
    const match = groups.findIndex((group) => StudentErrorClassifier.isSameKind(mistake, group.example))

    if (match === -1) return [...groups, { example: mistake, count: 1 }]

    return groups.map((group, index) => (index === match ? { ...group, count: group.count + 1 } : group))
  }, [])

  const top = patterns
    .filter((pattern) => pattern.count > 1)
    .sort(
      (a, b) =>
        b.count - a.count ||
        a.example.category.localeCompare(b.example.category) ||
        (a.example.code ?? "").localeCompare(b.example.code ?? ""),
    )
    .slice(0, 3)
    .map(describe)

  if (top.length === 0) return "No recurring mistake patterns found."
  if (top.length === 1) return `You've had ${top.join("")}.`
  if (top.length === 2) return `You've had ${top.join(" and ")}.`
  return `You've had ${top.slice(0, -1).join(", ")}, and ${top.at(-1)}.`
}

function describe(pattern: Pattern): string {
  const code = pattern.example.code ? ` (${pattern.example.code})` : ""
  return `${pattern.count} ${label(pattern.example.category)}${code}`
}

function label(category: string): string {
  if (category === "syntax_error") return "syntax errors"
  if (category === "undefined_name") return "undefined name errors"
  if (category === "import_error") return "import errors"
  if (category === "type_error") return "type errors"
  if (category === "test_failed") return "failed tests"
  return `${category.replaceAll("_", " ")} mistakes`
}
