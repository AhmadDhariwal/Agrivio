import nx from '@nx/eslint-plugin';

/**
 * Shared ESLint flat-config fragments for Agrivio workspace projects.
 * Formatting remains Prettier's responsibility.
 */
export const agrivioEslintIgnores = {
  ignores: ['**/dist', '**/out-tsc', '**/vitest.config.*.timestamp*', '**/.angular'],
};

export const agrivioModuleBoundaryRules = {
  files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
  rules: {
    '@nx/enforce-module-boundaries': [
      'error',
      {
        enforceBuildableLibDependency: true,
        allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
        depConstraints: [
          {
            sourceTag: '*',
            onlyDependOnLibsWithTags: ['*'],
          },
        ],
      },
    ],
  },
};

export const agrivioEslintBase = [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  agrivioEslintIgnores,
  agrivioModuleBoundaryRules,
];

export default agrivioEslintBase;
