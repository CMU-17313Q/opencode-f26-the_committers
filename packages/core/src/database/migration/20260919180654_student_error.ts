import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260919180654_student_error",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`student_error\` (
          \`id\` integer PRIMARY KEY AUTOINCREMENT,
          \`session_id\` text NOT NULL,
          \`category\` text NOT NULL,
          \`code\` text,
          \`message\` text NOT NULL,
          \`file\` text,
          \`line\` integer,
          \`source\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          CONSTRAINT \`fk_student_error_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`CREATE INDEX \`student_error_session_idx\` ON \`student_error\` (\`session_id\`);`)
      yield* tx.run(`CREATE INDEX \`student_error_category_idx\` ON \`student_error\` (\`category\`);`)
    })
  },
} satisfies DatabaseMigration.Migration
