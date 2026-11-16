
import { describe, expect, test } from "bun:test"
import * as fc from "fast-check"

import { ExpectedCases } from "../../src/command/expected-cases"
import { EdgeCases } from "../../src/command/edge-cases"
import { ExpectedOutput } from "../../src/command/expected-output"
import type { FunctionSignature } from "../../src/command/signature"

// Generates functions with different parameter counts and primitive types.
const signatureArbitrary = fc
  .array(fc.constantFrom("number", "string", "boolean"), {
    minLength: 0,
    maxLength: 3,
  })
  .map((types): FunctionSignature => ({
    name: "sample",
    parameters: types.map((type, index) => ({
      name: `arg${index}`,
      type,
      optional: false,
    })),
    returnType: "number",
    body: "{ return 1 }",
  }))

describe("Expected and Edge Case Properties", () => {
  // R2: Generating test cases multiple times for an unchanged function
  // should produce consistent categories of test cases.
  // Kind: invariant
  test("R2: repeated generation preserves test case categories", () => {
    fc.assert(
      fc.property(signatureArbitrary, (signature) => {
        const first = ExpectedCases.generate(signature)
        const second = ExpectedCases.generate(signature)

        expect(first.map((item) => item.category).sort()).toEqual(
          second.map((item) => item.category).sort(),
        )
      }),
    )
  })

  // R3: Changing only a parameter's name should preserve the generated
  // test scenarios and expected outputs.
  // Kind: metamorphic
  test("R3: renaming a parameter preserves generated results", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          ["value", "amount"] as const,
          ["number", "total"] as const,
          ["input", "data"] as const,
        ),
        ([originalName, newName]) => {
          const original: FunctionSignature = {
            name: "sample",
            parameters: [
              { name: originalName, type: "number", optional: false },
            ],
            returnType: "number",
            body: `{ return ${originalName} + 1 }`,
          }

          const renamed: FunctionSignature = {
            ...original,
            parameters: [
              { name: newName, type: "number", optional: false },
            ],
            body: `{ return ${newName} + 1 }`,
          }

          const first = ExpectedCases.generate(original)
          const second = ExpectedCases.generate(renamed)

          expect(
            first.map(({ input, expectedOutput }) => ({
              input,
              expectedOutput,
            })),
          ).toEqual(
            second.map(({ input, expectedOutput }) => ({
              input,
              expectedOutput,
            })),
          )
        },
      ),
    )
  })

  // R4: The system must generate both normal test cases and edge cases.
  // Kind: invariant
  // The generator varies the number of parameters to check boundary values
  // across different function signatures.
  test("R4: edge cases include important numeric boundary values", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4 }), (count) => {
        const signature: FunctionSignature = {
          name: "sample",
          parameters: Array.from({ length: count }, (_, index) => ({
            name: `arg${index}`,
            type: "number",
            optional: false,
          })),
          returnType: "number",
          body: "{ return arg0 }",
        }

        const cases = EdgeCases.generate(signature)

        for (let index = 0; index < count; index++) {
          const values = cases.map((item) => item.input[index])

          expect(values).toContain(0)
          expect(values).toContain(-1)
          expect(values).toContain(0.5)
          expect(values).toContain(Number.MAX_SAFE_INTEGER)
        }
      }),
    )
  })

  // R6: Generated expected outputs must match correct results
  // for supported simple functions with known expected outputs.
  // Kind: model/oracle
  test("R6: expected outputs match independently calculated results", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (left, right) => {
        const signature: FunctionSignature = {
          name: "add",
          parameters: [
            { name: "left", type: "number", optional: false },
            { name: "right", type: "number", optional: false },
          ],
          returnType: "number",
          body: "{ return left + right }",
        }

        const result = ExpectedOutput.derive(signature, [left, right])

        expect(result.expectedOutput).toBe(left + right)
        expect(result.throws).toBe(false)
      }),
    )
  })
})
