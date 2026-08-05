import { agrivioEslintBase } from '@agrivio/tooling-config/eslint/base';

export default [
  ...agrivioEslintBase,
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    rules: {},
  },
];
