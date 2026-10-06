import { describe, expect, test } from "bun:test"
import { extractFunctionSignature } from "../../src/command/signature"

describe("extractFunctionSignature", () => {
  test("extracts a function with no parameters", () => {
    const source = `
      function getName(): string {
        return "Alice"
      }
    `

    expect(extractFunctionSignature(source)).toEqual({
      ok: true,
      signature: {
        name: "getName",
        parameters: [],
        returnType: "string",
        body: `{
        return "Alice"
      }`,
      },
    })
  })

  test("extracts a function with multiple typed parameters", () => {
    const source = `
      function add(a: number, b: number): number {
        return a + b
      }
    `

    expect(extractFunctionSignature(source)).toEqual({
      ok: true,
      signature: {
        name: "add",
        parameters: [
          {
            name: "a",
            type: "number",
            optional: false,
          },
          {
            name: "b",
            type: "number",
            optional: false,
          },
        ],
        returnType: "number",
        body: `{
        return a + b
      }`,
      },
    })
  })

  test("extracts optional parameters", () => {
    const source = `
      function greet(name?: string): string {
        return name ?? "Guest"
      }
    `

    expect(extractFunctionSignature(source)).toEqual({
      ok: true,
      signature: {
        name: "greet",
        parameters: [
          {
            name: "name",
            type: "string",
            optional: true,
          },
        ],
        returnType: "string",
        body: `{
        return name ?? "Guest"
      }`,
      },
    })
  })

  test("fails gracefully when no function can be extracted", () => {
    const source = `
      const broken = (
    `

    const result = extractFunctionSignature(source)

    expect(result.ok).toBe(false)
  })

  test("can extract a specific function by name", () => {
    const source = `
      function first(): string {
        return "first"
      }

      function second(value: number): number {
        return value
      }
    `

    expect(extractFunctionSignature(source, "second")).toEqual({
      ok: true,
      signature: {
        name: "second",
        parameters: [
          {
            name: "value",
            type: "number",
            optional: false,
          },
        ],
        returnType: "number",
        body: `{
        return value
      }`,
      },
    })
  })

  test("captures a multi-statement body as written", () => {
    const source = `function clamp(value: number, max: number): number {
  if (value > max) return max
  return value
}`

    const result = extractFunctionSignature(source)

    expect(result.ok && result.signature.body).toBe(`{
  if (value > max) return max
  return value
}`)
  })

  test("returns an empty body for a declaration without one", () => {
    const source = `declare function parse(input: string): number`

    expect(extractFunctionSignature(source)).toEqual({
      ok: true,
      signature: {
        name: "parse",
        parameters: [{ name: "input", type: "string", optional: false }],
        returnType: "number",
        body: "",
      },
    })
  })
})
