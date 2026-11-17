# Project 4B: Properties & Fixes

**Name:** Hadeel Al-Ammari  
**Andrew ID:** halammar  
**Team:** The Committers  
**Branch:** `halammar/properties`

## Step 1: Review Your Requirements

All seven requirements from Project 4A were reviewed to determine whether they were feasible and testable.

Three requirements (R1, R3, and R6) were revised to make their expected behavior more specific and measurable while preserving the original user needs. The remaining requirements (R2, R4, R5, and R7) were kept unchanged because their original wording and acceptance criteria were sufficiently clear and testable.

### Main Requirements Table

| ID | Interview evidence | Requirement | Acceptance criteria | Changed in P4B? | Property | Test |
|---|---|---|---|---|---|---|
| R1 | C-3, S-1, S-2, O-3 | The system must not present uncertain expected outputs as definitely correct. It should indicate when manual verification is needed. | When the expected output cannot be determined from the available function information, the system must indicate that it cannot determine the answer instead of presenting an unverified output as correct. | Yes | Invariant | R1: unknown expected outputs are clearly identified |
| R2 | C-5, S-3, O-5 | Generating test cases multiple times for an unchanged function should produce consistent categories of test cases. | When `/suggest-tests` is run twice on the same function, both results should cover the same general scenario categories, even if the exact input values differ. | No | Invariant | R2: repeated generation preserves test case categories |
| R3 | C-6, S-4 | Changing only a parameter's name should preserve the generated test scenarios and expected outputs. | Given a function, rename one parameter without changing its type or functionality. The generated test cases should preserve the same behavioral scenarios and expected outputs, with only necessary parameter references updated. | Yes | Metamorphic | R3: renaming a parameter preserves generated results |
| R4 | C-2, O-2, O-4 | The system must generate both normal test cases and edge cases for a function. | Given an addition function, the generated cases should include normal inputs and unusual inputs such as zero, negative numbers, and large numbers. | No | Invariant | R4: normal and edge cases include expected numeric values |
| R5 | S-7 | The system should distinguish between normal test cases and edge cases by labeling or grouping them. | When test cases are generated, each case should be assigned to an appropriate category, such as normal or edge case. | No | Invariant | R5: normal and edge cases have appropriate categories |
| R6 | S-5, S-6, C-7, O-7 | The generated expected outputs must match the correct results for supported simple functions with known expected outputs. | Given a simple function with predefined correct results, generate test cases and compare their expected outputs against independently calculated results. All generated expected outputs must match. | Yes | Model/oracle | R6: expected outputs match independently calculated results |
| R7 | C-4 | The system must handle unknown or unsupported parameter types without crashing or generating random values. | Given a function with an unsupported parameter type, the system should handle it gracefully and explain why it could not generate a suitable test case. | No | Invariant | R7: unsupported parameter types are handled safely |

**Clarification:** The "Changed in P4B?" column indicates whether the original requirement wording was revised. It does not indicate whether the requirement was implemented or tested. All seven requirements were reviewed, and all seven have corresponding property tests.

## Requirement Changes

### R1 – Uncertain Expected Outputs

- **Original wording:** The system must not present uncertain expected outputs as definitely correct. It should flag uncertain test cases or notify the user when manual verification is needed.
- **Revised wording:** The system must indicate when it cannot determine an expected output from the available function information instead of presenting an unverified output as correct.
- **Why it changed:** The system cannot guarantee that an AI-generated expected output is correct or reliably measure its confidence. The revised requirement focuses on observable behavior when an expected output cannot be determined.
- **Interview evidence:** C-3, S-1, S-2, O-3.

### R3 – Parameter Renaming

- **Original wording:** Changing only a parameter's name should not change the generated test inputs or expected outputs.
- **Revised wording:** Changing only a parameter's name should preserve the generated behavioral scenarios and expected outputs, with only necessary parameter references updated.
- **Why it changed:** Renaming a parameter may affect how it is referenced in generated test code. Requiring identical generated inputs and outputs in every representation is unnecessarily restrictive.
- **Interview evidence:** C-6, S-4.

### R6 – Expected Output Correctness

- **Original wording:** The generated expected outputs must match the actual expected results for the function.
- **Revised wording:** The generated expected outputs must match the correct results for supported simple functions with known expected outputs.
- **Why it changed:** It is not practical to guarantee correct expected outputs for every possible function generated by an AI tool. Restricting the requirement to simple functions with known results makes it possible to verify correctness using predefined expected values.
- **Interview evidence:** S-5, S-6, C-7, O-7.

### Requirements Kept Unchanged

R2, R4, R5, and R7 were kept as written because their acceptance criteria describe specific behaviors that can be checked through property-based tests without changing the original user needs.

## Step 2: Properties and Tests

Seven property-based tests were implemented using fast-check to check requirements R1 through R7. The properties use three different kinds: invariant, metamorphic, and model/oracle.

Each property checks a rule across generated inputs rather than relying on only one manually selected example.

### R1 – Uncertain Expected Outputs

- **Kind:** Invariant
- **Property:** The system must indicate when it cannot determine an expected output instead of presenting an unverified output as correct.
- **Test:** `R1: unknown expected outputs are clearly identified`
- **Generator:** Uses generated integer inputs with a function containing unsupported syntax that the expected-output interpreter cannot evaluate.
- **What it checks:** Verifies that the result is marked as unknown and includes the manual-verification message instead of returning an unverified expected output.

### R2 – Consistent Test Case Categories

- **Kind:** Invariant
- **Property:** Generating test cases multiple times for an unchanged function should produce consistent categories.
- **Test:** `R2: repeated generation preserves test case categories`
- **Generator:** Generates function signatures with different numbers of parameters and primitive types, including number, string, and boolean.
- **What it checks:** Generates test cases twice for the same function and compares the resulting categories to verify consistency.

### R3 – Parameter Renaming

- **Kind:** Metamorphic
- **Property:** Changing only a parameter's name should preserve generated test scenarios and expected outputs.
- **Test:** `R3: renaming a parameter preserves generated results`
- **Generator:** Selects different pairs of parameter names while keeping the parameter type and function behavior unchanged.
- **What it checks:** Compares the generated inputs and expected outputs before and after renaming the parameter to verify that the behavioral results are preserved.

### R4 – Edge Case Generation

- **Kind:** Invariant
- **Property:** The system must generate both normal test cases and edge cases for a function.
- **Test:** `R4: normal and edge cases include expected numeric values`
- **Generator:** Generates function signatures with between one and four numeric parameters.
- **What it checks:** Verifies that normal test cases include typical numeric values (5 and 12), while edge cases include zero, negative one, fractional values, and large numbers.

### R5 – Distinguishing Test Case Categories

- **Kind:** Invariant
- **Property:** Normal test cases and edge cases should have different categories.
- **Test:** `R5: normal and edge cases have appropriate categories`
- **Generator:** Generates function signatures with between one and three numeric parameters to explore different parameter counts.
- **What it checks:** Verifies that normal cases are labeled `expected` and edge cases are labeled `edge`, ensuring that the two groups are distinguishable.

### R6 – Expected Output Correctness

- **Kind:** Model/oracle
- **Property:** Generated expected outputs must match independently calculated results for supported simple functions.
- **Test:** `R6: expected outputs match independently calculated results`
- **Generator:** Uses fast-check to generate pairs of integers for the addition function.
- **What it checks:** Compares generated expected outputs against independently calculated sums to verify that the results are correct.

### R7 – Unsupported Parameter Types

- **Kind:** Invariant
- **Property:** Unsupported parameter types should be handled safely without crashing or producing random values.
- **Test:** `R7: unsupported parameter types are handled safely`
- **Generator:** Selects several unsupported parameter types, including custom and generic types.
- **What it checks:** Verifies that normal cases use a safe fallback value and edge cases use fallback values such as `null`, an empty object, and an empty array. It also checks that the edge-case reasons explain the unsupported type.

### Property Test File

`packages/opencode/test/command/expected-cases.property.test.ts`

The generators were selected to explore different function signatures, parameter names, types, and numeric inputs instead of relying on a single example. They include boundary values, unsupported types, and variations in function parameters to exercise different behaviors.

The properties use fast-check to generate multiple inputs and check whether the expected rules hold. The tests cover all seven requirements and use three different property kinds: invariant, metamorphic, and model/oracle.

## Step 3: Running, Triaging, and Fixing

The property test file was committed to the `halammar/properties` branch and checked through GitHub Actions.

During the initial typecheck, two TypeScript errors were identified:

1. `item.input` could be null.
2. TypeScript could not guarantee that `item.input` was an array when accessing it using a numeric index.

These errors were caused by the test code, not the application implementation.

**Fix:** Updated the R4 property to check whether `item.input` is an array using `Array.isArray()` before accessing its elements. This safely handles nullable and non-array inputs.

After the correction, the GitHub Actions typecheck workflow completed successfully. The unit test and E2E smoke test jobs also completed successfully.

A dedicated GitHub Actions step was added to run the property test file explicitly. The final property test run confirmed:

- **7 property tests passed**
- **0 property tests failed**
- **3,050 expect() calls**
- **1 test file executed**
- **Execution time: 1.60 seconds**

The property tests completed successfully in GitHub Actions. No application implementation changes were needed to fix the TypeScript errors. The correction was made to the test code, and the property tests were explicitly included in the GitHub Actions workflow to ensure that they ran in CI.

## AI Use Disclosure

AI assistance was used to help review and revise requirements, identify suitable property-based testing approaches, refine the fast-check tests, and troubleshoot TypeScript errors. AI suggestions were reviewed and adjusted as needed. The final tests were run through GitHub Actions to verify that the properties passed, and the testing and modeling decisions were reviewed against the project requirements.
