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
import { testEffect } from "./lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node, SessionStudentError.node])))
// the session IDs used in the tests
const sessionID = SessionV2.ID.make("ses_student_error_test")
const otherSessionID = SessionV2.ID.make("ses_student_error_other")


const setup = Effect.gen(function* () {
  const { db } = yield* Database.Service
  yield* db
    .insert(ProjectTable)
    .values({ id: Project.ID.global, worktree: AbsolutePath.make("/project"), sandboxes: [] })
    .run()
    .pipe(Effect.orDie) // effect.orDie is used to cause the test to fail if any errors occur
  yield* db
    .insert(SessionTable)
    .values({
      id: sessionID,
      project_id: Project.ID.global,
      slug: "student-error",
      directory: "/project",
      title: "student-error",
      version: "test",
    })
    .run()
    .pipe(Effect.orDie)
})

// the test for recording student errors
describe("SessionStudentError", () => {
  it.effect("records syntax, type, and failed-test errors with their details", () =>
    Effect.gen(function* () {
      yield* setup
      const errors = yield* SessionStudentError.Service

      yield* errors.record({
        sessionID,
        category: "syntax_error",
        code: "TS1005",
        message: "';' expected.",
        file: "src/main.ts",
        line: 3,
        source: "bash",
      })
      yield* errors.record({
        sessionID,
        category: "type_error",
        code: "TS2322",
        message: "Type 'string' is not assignable to type 'number'.",
        file: "src/main.ts",
        line: 8,
        source: "bash",
      })
      yield* errors.record({
        sessionID,
        category: "test_failed",
        message: "expected 4 but received 5",
        source: "bash",
      })

      // tests that the errors were recorded correctly
      expect(
        (yield* errors.list(sessionID)).map((row) => ({
          category: row.category,
          code: row.code,
          file: row.file,
          line: row.line,
        })),
      ).toEqual([
        { category: "syntax_error", code: "TS1005", file: "src/main.ts", line: 3 },
        { category: "type_error", code: "TS2322", file: "src/main.ts", line: 8 },
        { category: "test_failed", code: null, file: null, line: null },
      ])
    }),
  )

  // test that listing errors for a session with no errors returns an empty list
  it.effect("returns an empty list when a session has no errors", () =>
    Effect.gen(function* () {
      yield* setup
      const errors = yield* SessionStudentError.Service
      expect(yield* errors.list(otherSessionID)).toEqual([])
    }),
  )
})