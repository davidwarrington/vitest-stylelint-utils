import util from 'node:util';
import { lint, type LinterResult } from 'stylelint';
import { describe, expect, it, type TestFunction } from 'vitest';

export type TestCase = {
  /**
   * The code of the test case.
   */
  code: string;

  /**
   * Description of the test case.
   */
  description?: string;

  /**
   * Maps to Vitest's `test.only`. Default: `false`.
   *
   * @see https://vitest.dev/api/#test-only
   */
  only?: boolean;

  /**
   * Maps to Vitest's `test.skip`. Default: `false`.
   *
   * @see https://vitest.dev/api/#test-skip
   */
  skip?: boolean;
};

export type AcceptTestCase = TestCase;

export type Warning = {
  /**
   * Expected message from the test case. Usually exported from the plugin.
   * Optional if `warnings` is used.
   */
  message?: string;

  /**
   * Expected line number of the warning.
   */
  line?: number;

  /**
   * Expected column number of the warning.
   */
  column?: number;

  /**
   * Expected end line number of the warning.
   */
  endLine?: number;

  /**
   * Expected end column number of the warning.
   */
  endColumn?: number;
};

/**
 * Use the `warnings` property, rather than `message`, `line`, and `column`,
 * if the test case is expected to produce more than one warning.
 */
export type RejectTestCase = TestCase &
  Warning & {
    /**
     * Expected fixed code of the test case. Optional if `fix` isn't `true`.
     */
    fixed?: string;

    /**
     * Don't check the `fixed` code. Default: `false`.
     */
    unfixable?: boolean;

    /**
     * Warning objects containing expected `message`, `line` and `column` etc.
     * Optional if `message` is used.
     */
    warnings?: Warning[];
  };

export type TestSchema = {
  /**
   * Name of the rule being tested. Usually exported from the plugin.
   */
  ruleName: string;

  /**
   * Config to pass to the rule.
   */
  config: unknown;

  /**
   * Accept test cases.
   */
  accept?: AcceptTestCase[];

  /**
   * Reject test cases.
   */
  reject?: RejectTestCase[];

  /**
   * Turn on autofix. Default: `false`.
   */
  fix?: boolean;

  /**
   * Maps to Stylelint's `plugins` configuration property.
   *
   * Path to the file that exports the plugin object, relative to the root.
   * Usually it's the same path as a `main` property in plugin's `package.json`.
   *
   * If you're testing a plugin pack, it's the path to the file that exports the array of plugin objects.
   *
   * Optional, if `plugins` option was passed to advanced configuration with `getTestRule()`.
   *
   * @see https://stylelint.io/user-guide/configure#plugins
   */
  plugins?: string | string[];

  /**
   * Maps to Stylelint's `customSyntax` option.
   *
   * @see https://stylelint.io/user-guide/usage/options#customsyntax
   */
  customSyntax?: string;

  /**
   * Maps to Stylelint's `codeFilename` option.
   *
   * @see https://stylelint.io/user-guide/usage/options#codefilename
   */
  codeFilename?: string;

  /**
   * Maps to Vitest's `test.only`. Default: `false`.
   *
   * @see https://vitest.dev/api/#test-only
   */
  only?: boolean;

  /**
   * Maps to Vitest's `test.skip`. Default: `false`.
   *
   * @see https://vitest.dev/api/#test-skip
   */
  skip?: boolean;
};

/**
 * Test a rule with the specified schema.
 */
export type TestRule = (schema: TestSchema) => void;

type GetTestRuleOptions = {
  plugins?: TestSchema['plugins'];
};

/**
 * Create a `testRule()` function with any specified plugins.
 */
export function getTestRule(options: GetTestRuleOptions): TestRule {
  return function testRule(schema: TestSchema) {
    describe(`${schema.ruleName}`, () => {
      const stylelintConfig = {
        plugins: options.plugins || schema.plugins,
        rules: {
          [schema.ruleName]: schema.config,
        },
      };

      setupTestCases({
        name: 'accept',
        cases: schema.accept,
        schema,
        comparisons(testCase) {
          return async function () {
            const stylelintOptions = {
              code: testCase.code,
              config: stylelintConfig,
              customSyntax: schema.customSyntax,
              codeFilename: schema.codeFilename,
            };

            const output = await lint(stylelintOptions);

            expect(output.results[0].warnings).toEqual([]);
            expect(output.results[0].parseErrors).toEqual([]);
            expect(output.results[0].invalidOptionWarnings).toEqual([]);

            if (!schema.fix) {
              return;
            }

            // Check that --fix doesn't change code
            const outputAfterFix = await lint({
              ...stylelintOptions,
              fix: true,
            });
            const fixedCode = getOutputCss(outputAfterFix);

            expect(fixedCode).toBe(testCase.code);
          };
        },
      });

      setupTestCases<RejectTestCase>({
        name: 'reject',
        cases: schema.reject,
        schema,
        comparisons(testCase) {
          return async function () {
            const stylelintOptions = {
              code: testCase.code,
              config: stylelintConfig,
              customSyntax: schema.customSyntax,
              codeFilename: schema.codeFilename,
            };

            const outputAfterLint = await lint(stylelintOptions);

            const actualWarnings = [
              ...outputAfterLint.results[0].invalidOptionWarnings,
              ...outputAfterLint.results[0].warnings,
            ];

            expect(outputAfterLint.results[0]).toMatchObject({
              parseErrors: [],
            });
            expect(actualWarnings).toHaveLength(
              testCase.warnings ? testCase.warnings.length : 1
            );

            const warnings = testCase.warnings || [testCase];
            warnings.forEach((warning, index) => {
              expect(
                warning.message,
                'Expected "reject" test case to have a "message" property'
              ).toBeDefined();

              const expectedWarning = {
                text: warning.message,
                line: warning.line,
                column: warning.column,
                endLine: warning.endLine,
                endColumn: warning.endColumn,
              };

              Object.entries(expectedWarning).forEach(([key, value]) => {
                if (value === undefined) {
                  delete expectedWarning[key];
                }
              });

              expect(actualWarnings[index]).toMatchObject(expectedWarning);
            });

            if (!schema.fix) {
              return;
            }

            // Check that --fix doesn't change code
            if (
              schema.fix &&
              !testCase.fixed &&
              testCase.fixed !== '' &&
              !testCase.unfixable
            ) {
              throw new Error(
                'If using { fix: true } in test schema, all reject cases must have { fixed: .. }'
              );
            }

            const outputAfterFix = await lint({
              ...stylelintOptions,
              fix: true,
            });

            const fixedCode = getOutputCss(outputAfterFix);

            if (!testCase.unfixable) {
              expect(fixedCode).toBe(testCase.fixed);
              expect(fixedCode).not.toBe(testCase.code);
            } else {
              // can't fix
              if (testCase.fixed) {
                expect(fixedCode).toBe(testCase.fixed);
              }

              expect(fixedCode).toBe(testCase.code);
            }

            // Checks whether only errors other than those fixed are reported
            const outputAfterLintOnFixedCode = await lint({
              ...stylelintOptions,
              code: fixedCode,
              fix: testCase.unfixable,
            });

            expect(outputAfterLintOnFixedCode.results[0]).toMatchObject({
              warnings: outputAfterFix.results[0].warnings,
              parseErrors: [],
            });
          };
        },
      });
    });
  };
}

interface SetupTestCasesOptions<T extends TestCase> {
  name: string;
  cases: T[] | undefined;
  schema: TestSchema;
  comparisons: (testCase: T) => TestFunction;
}
function setupTestCases<T extends TestCase = TestCase>({
  name,
  cases,
  schema,
  comparisons,
}: SetupTestCasesOptions<T>) {
  if (cases && cases.length) {
    const testGroup = schema.only
      ? describe.only
      : schema.skip
      ? describe.skip
      : describe;

    testGroup(`${name}`, () => {
      cases.forEach(testCase => {
        if (testCase) {
          const spec = testCase.only ? it.only : testCase.skip ? it.skip : it;

          describe(`${util.inspect(schema.config)}`, () => {
            describe(`${util.inspect(testCase.code)}`, () => {
              spec(
                testCase.description || 'no description',
                comparisons(testCase)
              );
            });
          });
        }
      });
    });
  }
}

function getOutputCss(output: LinterResult) {
  const result = output.results[0]._postcssResult;

  if (result && result.root && result.opts) {
    return result.root.toString(result.opts.syntax);
  }

  throw new TypeError('Invalid result');
}
