
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */

export default {
  testRunner: "command",

  commandRunner: {
    command:
      "bun test --timeout 30000 --only-failures test/util/wildcard.test.ts",
  },

  mutate: ["src/util/wildcard.ts"],

  reporters: ["clear-text", "html", "progress"],

  coverageAnalysis: "off",

  concurrency: 2,

  thresholds: {
    high: 80,
    low: 60,
    break: 0,
  },

  htmlReporter: {
    fileName: "reports/mutation/mutation.html",
  },
};
