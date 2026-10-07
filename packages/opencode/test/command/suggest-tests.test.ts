import { describe, expect } from "bun:test"
import path from "path"
import { Effect } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { SuggestTests } from "../../src/command/suggest-tests"
import { tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"

const it = testEffect(
  LayerNode.compile(
    LayerNode.group([FSUtil.node, CrossSpawnSpawner.node]),
  ),
)

describe("SuggestTests.validate", () => {
  it.live("accepts a valid file", () =>
    Effect.gen(function* () {
      const tmp = yield* tmpdirScoped()
      const fs = yield* FSUtil.Service
      const file = path.join(tmp, "calculator.ts")

      yield* fs.writeFileString(
        file,
        "export function add(a: number, b: number): number {\n  return a + b\n}\n",
      )

      const result = yield* SuggestTests.validate(["calculator.ts"], tmp)

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
      const file = path.join(tmp, "calculator.ts")

      yield* fs.writeFileString(
        file,
        "export function add(a: number, b: number): number {\n  return a + b\n}\n",
      )

      const result = yield* SuggestTests.validate(
        ["calculator.ts", "add"],
        tmp,
      )

      expect(result).toMatchObject({
        ok: true,
        input: { file, functionName: "add" },
      })
    }),
  )

  it.live("generates expected and edge suggestions", () =>
    Effect.gen(function* () {
      const tmp = yield* tmpdirScoped()
      const fs = yield* FSUtil.Service
      const file = path.join(tmp, "calculator.ts")

      yield* fs.writeFileString(
        file,
        "export function add(a: number, b: number): number {\n  return a + b\n}\n",
      )

      const result = yield* SuggestTests.validate(
        ["calculator.ts", "add"],
        tmp,
      )

      expect(result.ok).toBe(true)

      if (!result.ok) return

      expect(result.suggestions.length).toBeGreaterThan(0)

      expect(
        result.suggestions.some(
          (suggestion) => suggestion.category === "expected",
        ),
      ).toBe(true)

      expect(
        result.suggestions.some(
          (suggestion) => suggestion.category === "edge",
        ),
      ).toBe(true)

      expect(
        result.suggestions.every(
          (suggestion) => suggestion.functionName === "add",
        ),
      ).toBe(true)
    }),
  )

  it.live("formats generated suggestions into a runnable test file", () =>
    Effect.gen(function* () {
      const tmp = yield* tmpdirScoped()
      const fs = yield* FSUtil.Service
      const file = path.join(tmp, "calculator.ts")

      yield* fs.writeFileString(
        file,
        "export function add(a: number, b: number): number {\\n  return a + b\\n}\\n",
      )

      const result = yield* SuggestTests.validate(
        ["calculator.ts", "add"],
        tmp,
      )

      expect(result.ok).toBe(true)

      if (!result.ok) return

      const { format } = yield* Effect.promise(() =>
        import("../../src/command/test-file-formatter"),
      )

      const output = format(result.suggestions, {
        importPath: "../../src/calculator",
      })

      expect(output).toContain(
        'import { describe, expect, test } from "bun:test"',
      )
      expect(output).toContain(
        'import { add } from "../../src/calculator"',
      )
      expect(output).toContain('describe("add", () => {')
      expect(output).toContain("expect(add(")
      expect(output).toContain(").toBeDefined()")
      expect(output).toContain(
        "Expected output could not be derived automatically.",
      )
    }),
  )

  it.live("shows an error for a missing file", () =>
    Effect.gen(function* () {
      const tmp = yield* tmpdirScoped()

      const result = yield* SuggestTests.validate(
        ["missing.py"],
        tmp,
      )

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

  it.live("rejects extra arguments", () =>
    Effect.gen(function* () {
      const tmp = yield* tmpdirScoped()

      const result = yield* SuggestTests.validate(
        ["calculator.ts", "add", "extra"],
        tmp,
      )

      expect(result).toEqual({
        ok: false,
        message: "Usage: /suggest-tests <file> [function]",
      })
    }),
  )
})