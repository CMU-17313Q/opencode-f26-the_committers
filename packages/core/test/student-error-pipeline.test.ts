import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { Project } from "@opencode-ai/core/project"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { SessionV2 } from "@opencode-ai/core/session"
import { SessionTable } from "@opencode-ai/core/session/sql"
import { SessionStudentError } from "@opencode-ai/core/session/student-error"
import { StudentErrorParser } from "@opencode-ai/core/session/student-error-parser"
import { StudentErrorSummary } from "@opencode-ai/core/session/student-error-summary"
import { testEffect } from "./lib/effect"

// End-to-end: raw bash output -> parser -> persisted history -> project-wide summary.
const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node, SessionStudentError.node])))

const firstSession = SessionV2.ID.make("ses_pipeline_first")
const secondSession = SessionV2.ID.make("ses_pipeline_second")
const otherProject = Project.ID.make("prj_pipeline_other")
const otherSession = SessionV2.ID.make("ses_pipeline_other")

const setup = Effect.gen(function* () {
  const { db } = yield* Database.Service
  yield* db
    .insert(ProjectTable)
    .values([
      { id: Project.ID.global, worktree: AbsolutePath.make("/project"), sandboxes: [] },
      { id: otherProject, worktree: AbsolutePath.make("/other"), sandboxes: [] },
    ])
    .run()
    .pipe(Effect.orDie)
  yield* db
    .insert(SessionTable)
    .values(
      [
        { id: firstSession, project_id: Project.ID.global },
        { id: secondSession, project_id: Project.ID.global },
        { id: otherSession, project_id: otherProject },
      ].map((session) => ({ ...session, slug: session.id, directory: "/project", title: session.id, version: "test" })),
    )
    .run()
    .pipe(Effect.orDie)
})

// mirrors what the session runner does with a finished bash tool call
const runBash = Effect.fn("test.runBash")(function* (sessionID: SessionV2.ID, output: string) {
  const errors = yield* SessionStudentError.Service
  yield* Effect.forEach(StudentErrorParser.parse(output), (error) =>
    errors.record({ sessionID, source: "bash", ...error }),
  )
})

const projectSummary = Effect.gen(function* () {
  const errors = yield* SessionStudentError.Service
  return StudentErrorSummary.summarize(yield* errors.listForProject(Project.ID.global))
})

describe("student mistake pipeline", () => {
  it.effect("reports no patterns when the student has no mistake history", () =>
    Effect.gen(function* () {
      yield* setup
      yield* runBash(firstSession, "$ bun test\n✓ adds numbers [1ms]\n 1 pass\n 0 fail")

      const errors = yield* SessionStudentError.Service
      expect(yield* errors.listForProject(Project.ID.global)).toEqual([])
      expect(yield* projectSummary).toBe("No recurring mistake patterns found.")
    }),
  )

  it.effect("reports no patterns when every mistake is a one-off", () =>
    Effect.gen(function* () {
      yield* setup
      yield* runBash(
        firstSession,
        [
          "src/main.ts(3,5): error TS1005: ';' expected.",
          "src/main.ts(8,1): error TS2307: Cannot find module './util'.",
        ].join("\n"),
      )
      yield* runBash(
        secondSession,
        [
          "src/math.ts:4:10 - error TS2322: Type 'string' is not assignable to type 'number'.",
          "(fail) sums an empty list [0.42ms]",
        ].join("\n"),
      )

      const errors = yield* SessionStudentError.Service
      expect(yield* errors.listForProject(Project.ID.global)).toHaveLength(4)
      expect(yield* projectSummary).toBe("No recurring mistake patterns found.")
    }),
  )

  it.effect("surfaces a genuine pattern that recurs across sessions", () =>
    Effect.gen(function* () {
      yield* setup
      yield* runBash(
        firstSession,
        [
          "\u001b[96msrc/main.ts\u001b[0m:3:5 - \u001b[91merror\u001b[0m TS2304: Cannot find name 'coutn'.",
          "src/main.ts(9,1): error TS1005: '}' expected.",
        ].join("\n"),
      )
      yield* runBash(secondSession, "src/grid.ts(2,7): error TS2304: Cannot find name 'widht'.")
      yield* runBash(secondSession, "src/grid.ts(5,7): error TS2304: Cannot find name 'lenght'.")
      // mistakes from another project must not leak into this project's summary
      yield* runBash(otherSession, "a.ts(1,1): error TS1005: ';' expected.\nb.ts(1,1): error TS1005: ';' expected.")

      expect(yield* projectSummary).toBe("You've had 3 undefined name errors (TS2304).")
    }),
  )
})
