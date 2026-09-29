export * as StudentErrorClassifier from "./student-error-classifier"

import type { Row } from "./student-error"

// a mistake to classify: either a freshly parsed error (code may be absent) or a stored Row
export type Fingerprint = Pick<Row, "category" | "message"> & { readonly code?: Row["code"] }

// collapses quoted identifiers and numbers so messages that only differ by the specific
// name/number involved (e.g. two different undefined-variable typos) still compare equal
function normalizeMessage(message: string): string {
  return message
    .toLowerCase()
    .replace(/'[^']*'/g, "<ident>")
    .replace(/\d+/g, "<num>")
    .trim()
}

// two mistakes are "the same kind" when they're in the same category, and either share a
// compiler error code or have the same normalized message shape
export function isSameKind(a: Fingerprint, b: Fingerprint): boolean {
  if (a.category !== b.category) return false
  if (a.code && b.code) return a.code === b.code
  return normalizeMessage(a.message) === normalizeMessage(b.message)
}

export interface Classification {
  readonly matches: ReadonlyArray<Row>
  readonly isNewPattern: boolean
}

// given a new mistake and the stored history, find every past mistake of the same kind;
// an empty match list means this is a new pattern rather than a recurring one
export function classify(mistake: Fingerprint, history: ReadonlyArray<Row>): Classification {
  const matches = history.filter((past) => isSameKind(mistake, past))
  return { matches, isNewPattern: matches.length === 0 }
}
