import { Effect } from "effect"
import { effectCmd, fail } from "../effect-cmd"
import { UI } from "../ui"
import { InstanceRef } from "@/effect/instance-ref"
import { SessionID } from "../../session/schema"
import { SessionStudentError } from "@opencode-ai/core/session/student-error"
import { StudentErrorSummary } from "@opencode-ai/core/session/student-error-summary"

export const MistakesCommand = effectCmd({
  command: "mistakes",
  describe: "show a summary of your recurring mistake patterns",
  builder: (yargs) =>
    yargs.option("session", {
      alias: "s",
      describe: "only summarize mistakes from this session (default: all sessions in the current project)",
      type: "string",
    }),
  handler: Effect.fn("Cli.mistakes")(function* (args) {
    const ctx = yield* InstanceRef
    if (!ctx) return yield* fail("Could not resolve the current project")
    const errors = yield* SessionStudentError.Service
    const history = args.session
      ? yield* errors.list(SessionID.make(args.session))
      : yield* errors.listForProject(ctx.project.id)
    const scope = args.session ? `session ${args.session}` : "this project"

    console.log(UI.Style.TEXT_NORMAL_BOLD + `Mistake patterns for ${scope}` + UI.Style.TEXT_NORMAL)
    // summarize() can't tell an empty history apart from one with only one-off mistakes
    console.log(history.length === 0 ? "No mistakes recorded yet." : StudentErrorSummary.summarize(history))
  }),
})
