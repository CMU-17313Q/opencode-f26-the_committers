export * as SessionStudentError from "./student-error"
 
import { asc, eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { Database } from "../database/database"
import { makeLocationNode } from "../effect/app-node"
import { SessionSchema } from "./schema"
import { StudentErrorTable } from "./sql"
 
export type Row = typeof StudentErrorTable.$inferSelect
 
export interface Input {
  readonly sessionID: SessionSchema.ID
  readonly category: string
  readonly code?: string
  readonly message: string
  readonly file?: string
  readonly line?: number
  readonly source: string
}
 
export interface Interface {
  readonly record: (input: Input) => Effect.Effect<void>
  readonly list: (sessionID: SessionSchema.ID) => Effect.Effect<ReadonlyArray<Row>>
}
 
export class Service extends Context.Service<Service, Interface>()("@opencode/v2/SessionStudentError") {}
 
const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service
 
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
        .pipe(Effect.orDie)
    })
 
    const list = Effect.fn("SessionStudentError.list")(function* (sessionID: SessionSchema.ID) {
      return yield* db
        .select()
        .from(StudentErrorTable)
        .where(eq(StudentErrorTable.session_id, sessionID))
        .orderBy(asc(StudentErrorTable.id))
        .all()
        .pipe(Effect.orDie)
    })
 
    return Service.of({ record, list })
  }),
)
 
export const node = makeLocationNode({ service: Service, layer, deps: [Database.node] })
