// Drives the real `opencode mistakes` command against an isolated database.
// History is seeded through `opencode db` so the test exercises the same
// project resolution and DB wiring a student hits from their terminal.
import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { cliIt, type OpencodeCli } from "../lib/cli-process"

// test preload defaults OPENCODE_DB to :memory:, which would give every spawn its own
// empty database; a relative name resolves inside the isolated harness home instead
const spawn = (opencode: OpencodeCli, args: string[]) =>
  opencode.spawn(args, { env: { OPENCODE_DB: "mistakes.db" } })

const seed = Effect.fn("test.seedMistakes")(function* (
  opencode: OpencodeCli,
  mistakes: ReadonlyArray<{ category: string; code: string; message: string }>,
) {
  const rows = mistakes
    .map((m) => `('ses_cli_mistakes', '${m.category}', '${m.code}', '${m.message.replaceAll("'", "''")}', 'bash', 0)`)
    .join(", ")
  // the harness home is not a git repo, so the CLI resolves it to the global project
  const statements = [
    "insert or ignore into project (id, worktree, sandboxes, time_created, time_updated) values ('global', '/', '[]', 0, 0)",
    "insert into session (id, project_id, slug, directory, title, version, time_created, time_updated) values ('ses_cli_mistakes', 'global', 'cli', '/', 'cli', 'test', 0, 0)",
    `insert into student_error (session_id, category, code, message, source, time_created) values ${rows}`,
  ]
  yield* Effect.forEach(statements, (statement) =>
    spawn(opencode, ["db", statement]).pipe(Effect.map((result) => opencode.expectExit(result, 0, statement))),
  )
})

describe("opencode mistakes", () => {
  cliIt.live(
    "tells the student when no mistakes have been recorded",
    ({ opencode }) =>
      Effect.gen(function* () {
        const result = yield* spawn(opencode, ["mistakes"])
        opencode.expectExit(result, 0, "mistakes")
        expect(result.stdout).toContain("Mistake patterns for this project")
        expect(result.stdout).toContain("No mistakes recorded yet.")
      }),
    60_000,
  )

  cliIt.live(
    "reports no pattern when mistakes are unrelated one-offs",
    ({ opencode }) =>
      Effect.gen(function* () {
        yield* seed(opencode, [
          { category: "syntax_error", code: "TS1005", message: "';' expected." },
          { category: "import_error", code: "TS2307", message: "Cannot find module './util'." },
          { category: "undefined_name", code: "TS2304", message: "Cannot find name 'coutn'." },
        ])
        const result = yield* spawn(opencode, ["mistakes"])
        opencode.expectExit(result, 0, "mistakes")
        expect(result.stdout).toContain("No recurring mistake patterns found.")
      }),
    60_000,
  )

  cliIt.live(
    "shows a genuine recurring pattern for the project and for its session",
    ({ opencode }) =>
      Effect.gen(function* () {
        yield* seed(opencode, [
          { category: "undefined_name", code: "TS2304", message: "Cannot find name 'coutn'." },
          { category: "undefined_name", code: "TS2304", message: "Cannot find name 'widht'." },
          { category: "syntax_error", code: "TS1005", message: "';' expected." },
        ])
        const project = yield* spawn(opencode, ["mistakes"])
        opencode.expectExit(project, 0, "mistakes")
        expect(project.stdout).toContain("You've had 2 undefined name errors (TS2304).")

        const session = yield* spawn(opencode, ["mistakes", "--session", "ses_cli_mistakes"])
        opencode.expectExit(session, 0, "mistakes --session")
        expect(session.stdout).toContain("Mistake patterns for session ses_cli_mistakes")
        expect(session.stdout).toContain("You've had 2 undefined name errors (TS2304).")
      }),
    60_000,
  )
})
