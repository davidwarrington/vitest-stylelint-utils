# Vitest Stylelint Utils

Utilities for testing Stylelint plugins.

Currently this package is just a port of [jest-preset-stylelint](https://github.com/stylelint/jest-preset-stylelint) to Vitest.

Unlike `jest-preset-stylelint` it doesn't add a `toHaveMessage` custom matcher to `expect`. If you'd like to have that matcher, copy [this code from `jest-preset-stylelint`](https://github.com/stylelint/jest-preset-stylelint/blob/main/getTestRule.js#L136-L150) and [follow these Vitest docs](https://vitest.dev/guide/extending-matchers.html) to extend the Vi namespace if you're using TypeScript.

**Currently `describe`, `expect` and `it` must be passed to `getTestRule` as simply using Vitest as a peer dependency doesn't work.**

## Installation

Install this alongside Stylelint and Vitest

```bash
pnpm install --save-dev vitest-stylelint-utils stylelint vitest
# or using yarn
yarn add --dev vitest-stylelint-utils stylelint vitest
# or using npm
npm install --save-dev vitest-stylelint-utils stylelint vitest
```

## Setup

There is no required setup.

Optionally you can make it global to avoid rewriting setup boilerplate in multiple test files. There are 2 steps to do this:

1. Create `vitest.setup.ts` in the root of your project. Provide the required options to `getTestRule`:

   ```ts
   import { describe, expect, it } from 'vitest';
   import { getTestRule, type TestRule } from 'vitest-stylelint-utils';

   global.testRule = getTestRule({ plugins: ['./'], describe, expect, it });

   declare global {
     var testRule: TestRule;
   }
   ```

2. Add `vitest.setup.ts` to your `vitest.config.ts`:

   ```ts
   import { defineConfig } from 'vitest/config';

   export default defineConfig({
     test: {
       setupFiles: ['./vitest.setup.ts'],
     },
   });
   ```

## Usage

### getTestRule

```ts
import { messages, ruleName } from '.';

testRule({
  ruleName,
  config: [true, { type: 'kebab' }],
  fix: true,

  accept: [
    {
      code: '.class {}',
      description: 'simple class selector',
    },
    {
      code: '.my-class {}',
      description: 'simple class selector',
    },
  ],

  reject: [
    {
      code: '.myClass {}',
      fixed: '.my-class {}',
      description: 'camel case class selector',
      message: messages.expected(),
      line: 1,
      column: 1,
      endLine: 1,
      endColumn: 8,
    },
    {
      code: '.MyClass,\n.MyOtherClass {}',
      fixed: '.my-class,\n.my-other-class {}',
      description: 'two pascal class selectors in a selector list',
      warnings: [
        {
          message: messages.expected(),
          line: 1,
          column: 1,
          endLine: 1,
          endColumn: 8,
        },
        {
          message: messages.expected(),
          line: 2,
          column: 1,
          endLine: 2,
          endColumn: 13,
        },
      ],
    },
  ],
});
```
