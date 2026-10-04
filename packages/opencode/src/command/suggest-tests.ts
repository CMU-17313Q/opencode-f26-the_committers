import path from "path"
import { Effect } from "effect"
import { FSUtil } from "@opencode-ai/core/fs-util"

export type Input = {
  file: string
  functionName?: string
}

export type Result = { ok: true; input: Input } | { ok: false; message: string }

export const validate = Effect.fn("SuggestTests.validate")(function* (args: readonly string[], directory: string) {
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

  return {
    ok: true,
    input: {
      file,
      functionName: args[1],
    },
  } satisfies Result
})

export * as SuggestTests from "./suggest-tests"
