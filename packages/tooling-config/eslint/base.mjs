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
        allow: [
          '^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$',
          '^.*/vitest\\.config\\.[cm]?[jt]s$',
          '^.*/vitest\\..+\\.config\\.[cm]?[jt]s$',
          '^.*/tools/architecture/.*$',
        ],
        depConstraints: [
          {
            sourceTag: 'scope:frontend',
            onlyDependOnLibsWithTags: ['type:contracts', 'type:tooling'],
            notDependOnLibsWithTags: ['scope:backend', 'type:test-support'],
          },
          {
            sourceTag: 'scope:backend',
            onlyDependOnLibsWithTags: ['type:contracts', 'type:tooling', 'type:test-support'],
            notDependOnLibsWithTags: ['scope:frontend'],
          },
          {
            sourceTag: 'type:contracts',
            onlyDependOnLibsWithTags: ['type:contracts'],
            notDependOnLibsWithTags: [
              'type:app',
              'type:test-support',
              'type:tooling',
              'scope:frontend',
              'scope:backend',
            ],
          },
          {
            sourceTag: 'type:tooling',
            onlyDependOnLibsWithTags: ['type:tooling'],
            notDependOnLibsWithTags: [
              'type:app',
              'type:contracts',
              'type:test-support',
              'scope:frontend',
              'scope:backend',
            ],
          },
          {
            sourceTag: 'type:test-support',
            onlyDependOnLibsWithTags: ['type:test-support', 'type:contracts', 'type:tooling'],
            notDependOnLibsWithTags: ['scope:frontend', 'scope:backend', 'type:app'],
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
