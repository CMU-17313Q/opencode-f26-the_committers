import ts from "typescript"
import type { TestSuggestion } from "@opencode-ai/schema/test-suggestion"
import type { FunctionSignature } from "./signature"

type Json = TestSuggestion["expectedOutput"]

// the student's code is never executed: the body is interpreted with the small subset below,
// so this is used whenever the body is missing or uses anything outside that subset
export const UNKNOWN = "Unknown: could not be derived from the function body, check manually"

const MATH = new Set(["abs", "ceil", "floor", "max", "min", "pow", "round", "sign", "sqrt", "trunc"])

// what calling the function with `input` returns, worked out from its body;
// an argument missing from `input` is treated as omitted (undefined)
export function derive(signature: FunctionSignature, input: readonly Json[]): Json {
  const body = parseBody(signature.body)
  if (!body) return UNKNOWN
  const outcome = run(body, new Map(signature.parameters.map((parameter, index) => [parameter.name, input[index]])))
  if (!outcome) return UNKNOWN
  // follows the shared mock: an expected throw is described by the error's name
  if ("throws" in outcome) return outcome.throws
  return isJson(outcome.value) ? outcome.value : UNKNOWN
}

function parseBody(body: string) {
  if (!body) return
  const source = ts.createSourceFile(
    "body.ts",
    `function body() ${body}`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  return source.statements.find(ts.isFunctionDeclaration)?.body
}

// Interpreter over a tiny, side-effect-free subset of TypeScript. Every function returns
// undefined for anything outside the subset, which callers turn into UNKNOWN_OUTPUT.

type Outcome = { value: unknown } | { throws: string }
type Step = { done: false } | { done: true; outcome: Outcome }
type Scope = ReadonlyMap<string, unknown>

function run(body: ts.Block, scope: Scope): Outcome | undefined {
  const step = runStatements(body.statements, scope)
  if (!step) return
  // falling off the end of a function returns undefined
  return step.done ? step.outcome : { value: undefined }
}

function runStatements(statements: readonly ts.Statement[], scope: Scope): Step | undefined {
  for (const statement of statements) {
    const step = runStatement(statement, scope)
    if (!step || step.done) return step
  }
  return { done: false }
}

function runStatement(statement: ts.Statement, scope: Scope): Step | undefined {
  if (ts.isBlock(statement)) return runStatements(statement.statements, scope)
  if (ts.isReturnStatement(statement)) {
    if (!statement.expression) return { done: true, outcome: { value: undefined } }
    const outcome = evaluate(statement.expression, scope)
    return outcome && { done: true, outcome }
  }
  if (ts.isThrowStatement(statement)) {
    const thrown = statement.expression
    if (!ts.isNewExpression(thrown) || !ts.isIdentifier(thrown.expression)) return
    return { done: true, outcome: { throws: thrown.expression.text } }
  }
  if (ts.isIfStatement(statement)) {
    const condition = evaluate(statement.expression, scope)
    if (!condition) return
    if ("throws" in condition) return { done: true, outcome: condition }
    if (condition.value) return runStatement(statement.thenStatement, scope)
    if (statement.elseStatement) return runStatement(statement.elseStatement, scope)
    return { done: false }
  }
  return
}

function evaluate(expression: ts.Expression, scope: Scope): Outcome | undefined {
  if (ts.isParenthesizedExpression(expression)) return evaluate(expression.expression, scope)
  if (ts.isNumericLiteral(expression)) return { value: Number(expression.text) }
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression))
    return { value: expression.text }
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return { value: true }
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return { value: false }
  if (expression.kind === ts.SyntaxKind.NullKeyword) return { value: null }
  if (ts.isIdentifier(expression)) {
    if (expression.text === "undefined") return { value: undefined }
    return scope.has(expression.text) ? { value: scope.get(expression.text) } : undefined
  }
  if (ts.isPrefixUnaryExpression(expression)) {
    return then(evaluate(expression.operand, scope), (value) => unary(expression.operator, value))
  }
  if (ts.isBinaryExpression(expression)) return evaluateBinary(expression, scope)
  if (ts.isConditionalExpression(expression)) {
    return then(evaluate(expression.condition, scope), (condition) =>
      evaluate(condition ? expression.whenTrue : expression.whenFalse, scope),
    )
  }
  if (ts.isPropertyAccessExpression(expression) && expression.name.text === "length") {
    return then(evaluate(expression.expression, scope), (target) => {
      if (target === null || target === undefined) return { throws: "TypeError" }
      if (typeof target === "string" || Array.isArray(target)) return { value: target.length }
      return
    })
  }
  if (ts.isElementAccessExpression(expression)) {
    return then(evaluate(expression.expression, scope), (target) =>
      then(evaluate(expression.argumentExpression, scope), (index) => {
        if (target === null || target === undefined) return { throws: "TypeError" }
        if ((typeof target === "string" || Array.isArray(target)) && typeof index === "number") {
          return { value: target[index] }
        }
        return
      }),
    )
  }
  if (ts.isCallExpression(expression)) return evaluateMath(expression, scope)
  return
}

function evaluateBinary(expression: ts.BinaryExpression, scope: Scope): Outcome | undefined {
  const operator = expression.operatorToken.kind
  return then(evaluate(expression.left, scope), (left) => {
    // short-circuit operators must not evaluate the right side when the left decides the result
    if (operator === ts.SyntaxKind.AmpersandAmpersandToken && !left) return { value: left }
    if (operator === ts.SyntaxKind.BarBarToken && left) return { value: left }
    if (operator === ts.SyntaxKind.QuestionQuestionToken && left !== null && left !== undefined) return { value: left }
    return then(evaluate(expression.right, scope), (right) => binary(operator, left, right))
  })
}

function evaluateMath(expression: ts.CallExpression, scope: Scope): Outcome | undefined {
  const callee = expression.expression
  if (!ts.isPropertyAccessExpression(callee) || !ts.isIdentifier(callee.expression)) return
  if (callee.expression.text !== "Math" || !MATH.has(callee.name.text)) return
  const name = callee.name.text as "abs"
  const args = expression.arguments.map((argument) => evaluate(argument, scope))
  const values = args.flatMap((arg) => (arg && "value" in arg && typeof arg.value === "number" ? [arg.value] : []))
  if (values.length !== args.length) return
  return { value: (Math[name] as (...values: number[]) => number)(...values) }
}

// threads an evaluated value into the next step; unsupported (undefined) and throws pass straight through
function then(outcome: Outcome | undefined, next: (value: unknown) => Outcome | undefined) {
  if (!outcome || "throws" in outcome) return outcome
  return next(outcome.value)
}

function unary(operator: ts.PrefixUnaryOperator, value: unknown): Outcome | undefined {
  if (operator === ts.SyntaxKind.ExclamationToken) return { value: !value }
  if (operator === ts.SyntaxKind.MinusToken) return { value: -(value as number) }
  if (operator === ts.SyntaxKind.PlusToken) return { value: +(value as number) }
  return
}

// operands are only ever JSON values or undefined, and the `as number` casts only satisfy the
// type checker: JavaScript still applies its normal runtime semantics, e.g. string concatenation for `+`
function binary(operator: ts.SyntaxKind, left: unknown, right: unknown): Outcome | undefined {
  const l = left as number
  const r = right as number
  if (operator === ts.SyntaxKind.PlusToken) return { value: l + r }
  if (operator === ts.SyntaxKind.MinusToken) return { value: l - r }
  if (operator === ts.SyntaxKind.AsteriskToken) return { value: l * r }
  if (operator === ts.SyntaxKind.SlashToken) return { value: l / r }
  if (operator === ts.SyntaxKind.PercentToken) return { value: l % r }
  if (operator === ts.SyntaxKind.LessThanToken) return { value: l < r }
  if (operator === ts.SyntaxKind.LessThanEqualsToken) return { value: l <= r }
  if (operator === ts.SyntaxKind.GreaterThanToken) return { value: l > r }
  if (operator === ts.SyntaxKind.GreaterThanEqualsToken) return { value: l >= r }
  if (operator === ts.SyntaxKind.EqualsEqualsEqualsToken) return { value: left === right }
  if (operator === ts.SyntaxKind.ExclamationEqualsEqualsToken) return { value: left !== right }
  if (operator === ts.SyntaxKind.EqualsEqualsToken) return { value: left == right }
  if (operator === ts.SyntaxKind.ExclamationEqualsToken) return { value: left != right }
  if (
    operator === ts.SyntaxKind.AmpersandAmpersandToken ||
    operator === ts.SyntaxKind.BarBarToken ||
    operator === ts.SyntaxKind.QuestionQuestionToken
  ) {
    return { value: right }
  }
  return
}

function isJson(value: unknown): value is Json {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true
  if (typeof value === "number") return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isJson)
  if (typeof value === "object") return Object.values(value).every(isJson)
  return false
}

export * as ExpectedOutput from "./expected-output"
