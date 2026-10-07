import path from "path"
import { Effect } from "effect"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { ExpectedCases } from "./expected-cases"
import { EdgeCases } from "./edge-cases"
import { extractFunctionSignature } from "./signature"

export type Input = {
  file: string
  functionName?: string
}

export type Result =
  | {
      ok: true
      input: Input
      suggestions: ReturnType<typeof generateSuggestions> extends {
        ok: true
        suggestions: infer Suggestions
      }
        ? Suggestions
        : never
    }
  | { ok: false; message: string }

function generateSuggestions(
  source: string,
  functionName?: string,
):
  | {
      ok: true
      suggestions: ReturnType<typeof ExpectedCases.generate>
    }
  | { ok: false; message: string } {
  const extracted = extractFunctionSignature(source, functionName)

  if (!extracted.ok) {
    return {
      ok: false,
      message: extracted.message,
    }
  }

  return {
    ok: true,
    suggestions: [
      ...ExpectedCases.generate(extracted.signature),
      ...EdgeCases.generate(extracted.signature),
    ],
  }
}

export const validate = Effect.fn("SuggestTests.validate")(function* (
  args: readonly string[],
  directory: string,
) {
  if (!args[0] || args.length > 2) {
    return {
      ok: false,
      message: "Usage: /suggest-tests <file> [function]",
    } satisfies Result
  }

  const fs = yield* FSUtil.Service
  const file = path.resolve(directory, args[0])

  if (!(yield* fs.isFile(file))) {
    return {
      ok: false,
      message: `File not found or not a regular file: ${args[0]}`,
    } satisfies Result
  }

  const source = yield* fs.readFileString(file)
  const generated = generateSuggestions(source, args[1])

  if (!generated.ok) {
    return {
      ok: false,
      message: generated.message,
    } satisfies Result
  }

  return {
    ok: true,
    input: {
      file,
      functionName: args[1],
    },
    suggestions: generated.suggestions,
  } satisfies Result
})

export * as SuggestTests from "./suggest-tests"