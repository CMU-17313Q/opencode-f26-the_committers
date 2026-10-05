import ts from "typescript"

export type FunctionParameter = {
  name: string
  type: string
  optional: boolean
}

export type FunctionSignature = {
  name: string
  parameters: FunctionParameter[]
  returnType: string
}

export type Result =
  | { ok: true; signature: FunctionSignature }
  | { ok: false; message: string }

export function extractFunctionSignature(
  source: string,
  functionName?: string,
): Result {
  try {
    const sourceFile = ts.createSourceFile(
      "source.ts",
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )

    let signature: FunctionSignature | undefined

    function visit(node: ts.Node) {
      if (signature) return

      if (ts.isFunctionDeclaration(node) && node.name) {
        const name = node.name.text

        if (!functionName || name === functionName) {
          signature = {
            name,
            parameters: node.parameters.map((parameter) => ({
              name: parameter.name.getText(sourceFile),
              type: parameter.type?.getText(sourceFile) ?? "unknown",
              optional: parameter.questionToken !== undefined,
            })),
            returnType: node.type?.getText(sourceFile) ?? "unknown",
          }
          return
        }
      }

      ts.forEachChild(node, visit)
    }

    visit(sourceFile)

    if (!signature) {
      return {
        ok: false,
        message: functionName
          ? `Function not found: ${functionName}`
          : "No function declaration found",
      }
    }

    return {
      ok: true,
      signature,
    }
  } catch {
    return {
      ok: false,
      message: "Unable to parse source file",
    }
  }
}