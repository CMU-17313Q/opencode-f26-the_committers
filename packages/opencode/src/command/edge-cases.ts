import type { TestSuggestion } from "@opencode-ai/schema/test-suggestion"
import { ExpectedOutput } from "./expected-output"
import type { FunctionParameter, FunctionSignature } from "./signature"

type Json = TestSuggestion["expectedOutput"]

type Edge = {
  value: Json
  reason: string
  // leave the argument out entirely instead of passing `value`; only offered for optional parameters
  omitted?: true
}

const EDGES: Record<string, readonly Edge[]> = {
  number: [
    { value: 0, reason: "zero is a boundary that often breaks division, loops and sign checks." },
    { value: -1, reason: "a negative number checks the function does not assume positive input." },
    { value: 0.5, reason: "a fractional number checks the function does not assume integers." },
    { value: Number.MAX_SAFE_INTEGER, reason: "a very large number checks for overflow and precision problems." },
  ],
  string: [
    { value: "", reason: "an empty string is the most common string edge case." },
    { value: " ", reason: "a whitespace-only string looks empty to people but not to code." },
    { value: "a".repeat(100), reason: "a long string checks input well beyond typical sizes." },
    { value: "héllo wörld 🎉", reason: "non-ASCII characters check that Unicode text is handled." },
  ],
  boolean: [
    { value: true, reason: "both boolean values should be covered, starting with true." },
    { value: false, reason: "both boolean values should be covered, including false." },
    { value: null, reason: "null can still reach a boolean parameter from untyped JavaScript or JSON input." },
  ],
}

const TYPICAL: Record<string, Json> = {
  number: 5,
  string: "example",
  boolean: true,
}

export function generate(signature: FunctionSignature): TestSuggestion[] {
  // every edge case varies one parameter and keeps typical values for the rest, so a failure points at that parameter
  const baseline = signature.parameters.map((parameter) => typical(parameter.type))

  return signature.parameters.flatMap((parameter, index) =>
    edgesFor(parameter).map((edge) => {
      const input = edge.omitted
        ? baseline.slice(0, index)
        : baseline.map((value, position) => (position === index ? edge.value : value))
      return {
        functionName: signature.name,
        category: "edge" as const,
        input,
        expectedOutput: ExpectedOutput.derive(signature, input),
        reason: `${parameter.name}: ${edge.reason}`,
      }
    }),
  )
}

function edgesFor(parameter: FunctionParameter): readonly Edge[] {
  const element = elementType(parameter.type)
  const edges =
    element !== undefined ? arrayEdges(typical(element)) : (EDGES[parameter.type] ?? unknownEdges(parameter.type))
  if (!parameter.optional) return edges
  return [
    ...edges,
    { value: null, omitted: true, reason: "leaving out the optional argument checks the default behavior." },
  ]
}

function arrayEdges(element: Json): readonly Edge[] {
  return [
    { value: [], reason: "an empty array checks loops and index access when there is nothing to process." },
    { value: [element], reason: "a single-element array is the smallest non-empty case." },
    { value: [element, element], reason: "duplicate elements check the function does not assume unique values." },
  ]
}

function unknownEdges(type: string): readonly Edge[] {
  return [
    { value: null, reason: `null checks how a missing ${type} value is handled.` },
    { value: {}, reason: `an empty object checks how a ${type} without any fields is handled.` },
    { value: [], reason: `an empty array checks how an unexpected shape for ${type} is handled.` },
  ]
}

function typical(type: string): Json {
  const element = elementType(type)
  if (element !== undefined) return [typical(element)]
  return TYPICAL[type] ?? null
}

function elementType(type: string) {
  return (/^(?:readonly\s+)?(.+)\[\]$/.exec(type) ?? /^(?:Readonly)?Array<(.+)>$/.exec(type))?.[1]
}

export * as EdgeCases from "./edge-cases"
