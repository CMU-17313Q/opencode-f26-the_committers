import { expect, test } from "bun:test"
import fc from "fast-check"
import type { Row } from "@opencode-ai/core/session/student-error"
import { StudentErrorSummary } from "@opencode-ai/core/session/student-error-summary"

const mistakeKind = fc.constantFrom(
  { category: "syntax_error", code: "TS1005", message: "'}' expected." },
  { category: "undefined_name", code: "TS2304", message: "Cannot find name 'value'." },
  { category: "test_failed", code: null, message: "expected 4 but received 5" },
)

// Four or more entries from three kinds guarantee at least one recurring
// pattern. Using a small set also makes ties and interleaved repeats possible.
const mistakeHistory = fc.array(mistakeKind, { minLength: 4, maxLength: 20 }).map((mistakes) =>
  mistakes.map(
    (mistake, index) =>
      ({
        ...mistake,
        id: index + 1,
        session_id: "ses_mistakes_property",
        file: null,
        line: null,
        source: "bash",
        time_created: index,
      }) as Row,
  ),
)

const reorderedHistory = mistakeHistory.chain((history) =>
  fc
    .shuffledSubarray(history, { minLength: history.length, maxLength: history.length })
    .map((shuffled) => ({ history, shuffled })),
)

function displayedPatterns(history: ReadonlyArray<Row>) {
  return StudentErrorSummary.summarize(history)
    .replace(/^You've had /, "")
    .replace(/\.$/, "")
    .split(/, and | and |, /)
    .sort()
}

// R5: Reordering the same history preserves the mistake types and counts in the frequency summary.
// Kind: metamorphic
test("R5: reordering mistake history preserves displayed types and counts", () => {
  fc.assert(
    fc.property(reorderedHistory, ({ history, shuffled }) => {
      expect(displayedPatterns(shuffled)).toEqual(displayedPatterns(history))
    }),
  )
})
// R1: The frequency summary sorts mistake types from highest count to lowest count.
// Kind: invariant
test("R1: the frequency summary shows highest counts first", () => {
  fc.assert(
    fc.property(mistakeHistory, (history) => {
      const summary = StudentErrorSummary.summarize(history)
      const counts = Array.from(summary.matchAll(/\b(\d+) (?=[a-z])/g), (match) =>
        Number(match[1]),
      )

      expect(counts.length).toBeGreaterThan(0)
      expect(counts).toEqual([...counts].sort((a, b) => b - a))
    }),
  )
})

const mistakeLabels = {
  syntax_error: "syntax errors (TS1005)",
  undefined_name: "undefined name errors (TS2304)",
  test_failed: "failed tests",
}

// Generate histories where every kind occurs once, or where the first kind
// repeats alongside at least one singleton.
const historyWithSingletons = fc.tuple(
  fc.uniqueArray(mistakeKind, {
    minLength: 2,
    maxLength: 3,
    selector: (mistake) => mistake.category,
  }),
  fc.integer({ min: 0, max: 4 }),
)

// Generate distinct mistake types so every type occurs exactly once.
const oneOffKinds = fc.uniqueArray(mistakeKind, {
  minLength: 1,
  maxLength: 3,
  selector: (mistake) => mistake.category,
})

// R2: If mistakes were recorded but none occurred more than once,
// the summary displays "No recurring mistake patterns found."
// Kind: invariant
test("R2: a history with only one-off mistakes reports no recurring patterns", () => {
  fc.assert(
    fc.property(oneOffKinds, (kinds) => {
      const history = kinds.map(
        (mistake, index) =>
          ({
            ...mistake,
            id: index + 1,
            session_id: "ses_mistakes_property",
            file: null,
            line: null,
            source: "bash",
            time_created: index,
          }) as Row,
      )

      expect(StudentErrorSummary.report(history)).toBe("No recurring mistake patterns found.")
    }),
  )
})
// Start with at least two undefined-name errors so the pattern stays visible
// after removal. Include other mistakes to check a mixed history.
const removalCase = fc.tuple(mistakeHistory, fc.integer({ min: 2, max: 8 }))

// R4: When a mistake occurrence is removed from the history,
// the summary updates the count for that mistake type.
// Kind: round-trip
test("R4: adding and removing an occurrence restores the original count", () => {
  fc.assert(
    fc.property(removalCase, ([generatedHistory, originalCount]) => {
      const otherMistakes = generatedHistory.filter(
        (mistake) => mistake.category !== "undefined_name",
      )
      const occurrences = Array.from({ length: originalCount + 1 }, (_, index) =>
        ({
          ...generatedHistory[0]!,
          id: generatedHistory.length + index + 1,
          time_created: generatedHistory.length + index,
          category: "undefined_name",
          code: "TS2304",
          message: "Cannot find name 'value'.",
        }) as Row,
      )
      const extra = occurrences[originalCount]!
      const original = [...otherMistakes, ...occurrences.slice(0, originalCount)]
      const withExtra = [...original, extra]
      const afterRemoval = withExtra.filter((mistake) => mistake.id !== extra.id)
      const pattern = "undefined name errors (TS2304)"

      expect(displayedPatterns(original)).toContain(`${originalCount} ${pattern}`)
      expect(displayedPatterns(withExtra)).toContain(`${originalCount + 1} ${pattern}`)
      expect(displayedPatterns(afterRemoval)).toEqual(displayedPatterns(original))
    }),
  )
})