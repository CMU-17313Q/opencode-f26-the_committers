import { describe, expect } from "bun:test"
import path from "path"
import { Effect } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { SuggestTests } from "../../src/command/suggest-tests"
import { tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"

const it = testEffect(LayerNode.compile(LayerNode.group([FSUtil.node, CrossSpawnSpawner.node])))
describe("SuggestTests.validate", () => {
  it.live("accepts a valid file", () =>
    Effect.gen(function* () {
      const tmp = yield* tmpdirScoped()
      const fs = yield* FSUtil.Service
      const file = path.join(tmp, "calculator.py")
      yield* fs.writeFileString(file, "def add(a, b):\n    return a + b\n")

      const result = yield* SuggestTests.validate(["calculator.py"], tmp)

      expect(result).toMatchObject({
        ok: true,
        input: { file },
      })
    }),
  )

  it.live("accepts an optional function name", () =>
    Effect.gen(function* () {
      const tmp = yield* tmpdirScoped()
      const fs = yield* FSUtil.Service
      const file = path.join(tmp, "calculator.py")
      yield* fs.writeFileString(file, "def add(a, b):\n    return a + b\n")

      const result = yield* SuggestTests.validate(["calculator.py", "add"], tmp)

      expect(result).toEqual({
        ok: true,
        input: { file, functionName: "add" },
      })
    }),
  )

  it.live("shows an error for a missing file", () =>
    Effect.gen(function* () {
      const tmp = yield* tmpdirScoped()

      const result = yield* SuggestTests.validate(["missing.py"], tmp)

      expect(result).toEqual({
        ok: false,
        message: "File not found or not a regular file: missing.py",
      })
    }),
  )

  it.live("shows usage when no argument is supplied", () =>
    Effect.gen(function* () {
      const tmp = yield* tmpdirScoped()

      const result = yield* SuggestTests.validate([], tmp)

      expect(result).toEqual({
        ok: false,
        message: "Usage: /suggest-tests <file> [function]",
      })
    }),
  )

  it.live("rejects a directory", () =>
    Effect.gen(function* () {
      const tmp = yield* tmpdirScoped()

      const result = yield* SuggestTests.validate(["."], tmp)

      expect(result).toEqual({
        ok: false,
        message: "File not found or not a regular file: .",
      })
    }),
  )

  it.live("rejects extra arguments", () =>
    Effect.gen(function* () {
      const tmp = yield* tmpdirScoped()

      const result = yield* SuggestTests.validate(["calculator.py", "add", "extra"], tmp)

      expect(result).toEqual({
        ok: false,
        message: "Usage: /suggest-tests <file> [function]",
      })
    }),
  )
})
