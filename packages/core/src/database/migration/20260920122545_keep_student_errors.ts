import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260920122545_keep_student_errors",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`PRAGMA foreign_keys=OFF;`)
      yield* tx.run(`
        CREATE TABLE \`__new_student_error\` (
          \`id\` integer PRIMARY KEY AUTOINCREMENT,
          \`session_id\` text NOT NULL,
          \`category\` text NOT NULL,
          \`code\` text,
          \`message\` text NOT NULL,
          \`file\` text,
          \`line\` integer,
          \`source\` text NOT NULL,
          \`time_created\` integer NOT NULL
        );
      `)
      yield* tx.run(
        `INSERT INTO \`__new_student_error\`(\`id\`, \`session_id\`, \`category\`, \`code\`, \`message\`, \`file\`, \`line\`, \`source\`, \`time_created\`) SELECT \`id\`, \`session_id\`, \`category\`, \`code\`, \`message\`, \`file\`, \`line\`, \`source\`, \`time_created\` FROM \`student_error\`;`,
      )
      yield* tx.run(`DROP TABLE \`student_error\`;`)
      yield* tx.run(`ALTER TABLE \`__new_student_error\` RENAME TO \`student_error\`;`)
      yield* tx.run(`PRAGMA foreign_keys=ON;`)
      yield* tx.run(`CREATE INDEX \`student_error_session_idx\` ON \`student_error\` (\`session_id\`);`)
      yield* tx.run(`CREATE INDEX \`student_error_category_idx\` ON \`student_error\` (\`category\`);`)
    })
  },
} satisfies DatabaseMigration.Migration
