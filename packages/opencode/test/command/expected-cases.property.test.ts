
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
  // R1: When an expected output cannot be derived, the system must
  // indicate that manual verification is needed.
  // Kind: invariant
  test("R1: unknown expected outputs are clearly identified", () => {
    fc.assert(
      fc.property(fc.integer(), (value) => {
        const signature: FunctionSignature = {
          name: "sample",
          parameters: [
            { name: "arg0", type: "number", optional: false },
          ],
          returnType: "number",
          body: "{ return unsupportedFunction(arg0) }",
        }

        const result = ExpectedOutput.derive(signature, [value])

        expect(result.expectedOutput).toBe(ExpectedOutput.UNKNOWN)
        expect(result.throws).toBe(false)
      }),
    )
  })

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
  // The generator varies parameter counts to explore different signatures.
  test("R4: normal and edge cases include expected numeric values", () => {
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

        const normalCases = ExpectedCases.generate(signature)
        const edgeCases = EdgeCases.generate(signature)

        for (let index = 0; index < count; index++) {
          const normalValues = normalCases.flatMap((item) =>
            Array.isArray(item.input) ? [item.input[index]] : [],
          )

          const edgeValues = edgeCases.flatMap((item) =>
            Array.isArray(item.input) ? [item.input[index]] : [],
          )

          expect(normalValues).toContain(5)
          expect(normalValues).toContain(12)

          expect(edgeValues).toContain(0)
          expect(edgeValues).toContain(-1)
          expect(edgeValues).toContain(0.5)
          expect(edgeValues).toContain(Number.MAX_SAFE_INTEGER)
        }
      }),
    )
  })

  // R5: The system should distinguish between normal test cases
  // and edge cases by labeling or grouping them.
  // Kind: invariant
  // Generator: Varies the number of numeric parameters from 1 to 3
  // to check category labels across different function signatures.
  test("R5: normal and edge cases have appropriate categories", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 3 }), (count) => {
        const signature: FunctionSignature = {
          name: "sample",
          parameters: Array.from({ length: count }, (_, index) => ({
            name: `arg${index}`,
            type: "number",
            optional: false,
          })),
          returnType: "number",
          body: "{ return arg0 + 1 }",
        }

        const normalCases = ExpectedCases.generate(signature)
        const edgeCases = EdgeCases.generate(signature)

        expect(normalCases.length).toBeGreaterThan(0)
        expect(edgeCases.length).toBeGreaterThan(0)

        expect(normalCases.every((item) => item.category === "expected")).toBe(true)
        expect(edgeCases.every((item) => item.category === "edge")).toBe(true)
      }),
    )
  })

  // R6: Generated expected outputs must match correct results
  // for supported simple functions with known expected outputs.
  // Kind: model/oracle
  // Generator: Generates pairs of integers to explore different
  // combinations of inputs for the addition function.
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

        const cases = ExpectedCases.generate(signature)

        for (const item of cases) {
          expect(Array.isArray(item.input)).toBe(true)

          if (Array.isArray(item.input)) {
            const [a, b] = item.input

            expect(item.expectedOutput).toBe(
              (a as number) + (b as number),
            )
          }
        }
      }),
    )
  })

  // R7: Unsupported parameter types must not crash or generate
  // arbitrary values. The generator should use its documented fallbacks.
  // Kind: invariant
  test("R7: unsupported parameter types are handled safely", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("CustomType", "Date", "Map<string, number>"),
        (unsupportedType) => {
          const signature: FunctionSignature = {
            name: "sample",
            parameters: [
              { name: "value", type: unsupportedType, optional: false },
            ],
            returnType: "number",
            body: "{ return 1 }",
          }

          const normalCases = ExpectedCases.generate(signature)
          const edgeCases = EdgeCases.generate(signature)

          expect(normalCases).toHaveLength(2)
          expect(edgeCases).toHaveLength(3)

          expect(
            normalCases.every(
              (item) =>
                Array.isArray(item.input) &&
                item.input[0] === null,
            ),
          ).toBe(true)

          const edgeValues = edgeCases.flatMap((item) =>
            Array.isArray(item.input) ? [item.input[0]] : [],
          )

          expect(edgeValues).toEqual([null, {}, []])

          expect(
            edgeCases.every((item) =>
              item.reason.includes(unsupportedType),
            ),
          ).toBe(true)
        },
      ),
    )
  })
})
