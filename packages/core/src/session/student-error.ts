export * as SessionStudentError from "./student-error"

import { asc, eq, inArray } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { Database } from "../database/database"
import { makeLocationNode } from "../effect/app-node"
import { ProjectV2 } from "../project"
import { SessionSchema } from "./schema"
import { SessionTable, StudentErrorTable } from "./sql"

export type Row = typeof StudentErrorTable.$inferSelect

// these are the fields that are returned when listing errors for a session
export interface Input {
  readonly sessionID: SessionSchema.ID
  readonly category: string
  readonly code?: string
  readonly message: string
  readonly file?: string
  readonly line?: number
  readonly source: string
}

// the interface for the service that records and lists student errors
export interface Interface {
  readonly record: (input: Input) => Effect.Effect<void>
  readonly list: (sessionID: SessionSchema.ID) => Effect.Effect<ReadonlyArray<Row>>
  readonly listForProject: (projectID: ProjectV2.ID) => Effect.Effect<ReadonlyArray<Row>>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/SessionStudentError") {}

// the layer that provides the service implementation
const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service

    // this is where values are included into the db
    const record = Effect.fn("SessionStudentError.record")(function* (input: Input) {
      yield* db
        .insert(StudentErrorTable)
        .values({
          session_id: input.sessionID,
          category: input.category,
          code: input.code,
          message: input.message,
          file: input.file,
          line: input.line,
          source: input.source,
        })
        .run()
        .pipe(
          // log a warning instead of crashing when recording fails
          Effect.tapError((error) => Effect.logWarning("Failed to record student error", error)),
          Effect.ignore,
        )
    })

    // returns a list of errors for a given session, ordered by id
    const list = Effect.fn("SessionStudentError.list")(function* (sessionID: SessionSchema.ID) {
      return yield* db
        .select()
        .from(StudentErrorTable)
        .where(eq(StudentErrorTable.session_id, sessionID))
        .orderBy(asc(StudentErrorTable.id))
        .all()
        .pipe(Effect.orDie)
    })

    // returns a list of errors for all sessions belonging to a project
    const listForProject = Effect.fn("SessionStudentError.listForProject")(function* (
      projectID: ProjectV2.ID,
    ) {
      const sessions = yield* db
        .select({ id: SessionTable.id })
        .from(SessionTable)
        .where(eq(SessionTable.project_id, projectID))
        .all()
        .pipe(Effect.orDie)

      const sessionIDs = sessions.map((session) => session.id)

      if (sessionIDs.length === 0) {
        return []
      }

      return yield* db
        .select()
        .from(StudentErrorTable)
        .where(inArray(StudentErrorTable.session_id, sessionIDs))
        .orderBy(asc(StudentErrorTable.id))
        .all()
        .pipe(Effect.orDie)
    })

    return Service.of({ record, list, listForProject })
  }),
)

export const node = makeLocationNode({ service: Service, layer, deps: [Database.node] })