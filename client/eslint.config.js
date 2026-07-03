import js from '@eslint/js'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser }
    },
    settings: { react: { version: 'detect' } },
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // Vite/React 18 automatic JSX runtime — no need to import React in scope.
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      // Noisy for Korean helper text with literal quotes; renders fine.
      'react/no-unescaped-entities': 'off',
      // React-Compiler-aware rule flags idiomatic mount-fetch effects; keep as a
      // hint, not a CI blocker (refactor tracked in Phase 3).
      'react-hooks/set-state-in-effect': 'warn',
      // The rule that would have caught the missing ErrorBoundary import (FE-01).
      'no-undef': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['src/**/*.test.{js,jsx}', 'src/test/**/*.{js,jsx}'],
    languageOptions: { globals: { ...globals.node, ...globals.vitest } }
  }
]
