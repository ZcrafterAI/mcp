// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    { ignores: ['dist/', 'node_modules/'] },
    js.configs.recommended,
    {
        // The server itself: linted with full type information.
        files: ['src/**/*.ts'],
        extends: [...tseslint.configs.recommendedTypeChecked],
        languageOptions: {
            parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
            globals: globals.node,
        },
        rules: {
            // A name prefixed with "_" is deliberately unused (e.g. a tool with no inputs).
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
            ],
            // Type-only imports keep dead requires out of the compiled output.
            '@typescript-eslint/consistent-type-imports': [
                'error',
                { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
            ],
            // Always throw one of the typed errors from utils/errors.ts.
            '@typescript-eslint/only-throw-error': 'error',
            // stdout belongs to the MCP protocol — log through utils/logger.ts.
            'no-console': 'error',
            eqeqeq: ['error', 'always', { null: 'ignore' }],
        },
    },
    {
        // Tests, scripts, and this config are plain JavaScript, outside the build.
        files: ['test/**/*.mjs', 'scripts/**/*.mjs', 'eslint.config.js'],
        languageOptions: { globals: globals.node },
    },
);
