import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/.turbo/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  // Module-boundary enforcement for the core monolith (blueprint doc 15):
  // bounded-context modules may be imported only through their public `api.ts`.
  {
    files: ['apps/core/src/**/*.ts'],
    plugins: { boundaries },
    settings: {
      'import/resolver': { typescript: { project: 'apps/core/tsconfig.json' } },
      'boundaries/include': ['apps/core/src/**/*.ts'],
      'boundaries/elements': [
        { type: 'module', pattern: 'apps/core/src/modules/*', capture: ['name'] },
        { type: 'shared', pattern: 'apps/core/src/(common|config|database)/**' },
        { type: 'root', pattern: 'apps/core/src/*.ts', mode: 'file' },
      ],
    },
    rules: {
      // Any import that resolves into a module must target that module's api.ts.
      'boundaries/entry-point': [
        'error',
        {
          default: 'disallow',
          rules: [
            { target: ['module'], allow: 'api.ts' },
            { target: ['shared', 'root'], allow: '**' },
          ],
        },
      ],
    },
  },
  {
    // NestJS DI + emitDecoratorMetadata needs value (not type-only) imports for
    // injected classes and DTOs, which consistent-type-imports would wrongly demote.
    files: ['apps/core/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
);
