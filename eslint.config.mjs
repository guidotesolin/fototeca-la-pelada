import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Claude Design consultation material, not part of the product. It is
    // gitignored, but the flat config does not read .gitignore, and its noise was
    // burying the findings from src/.
    '.design-ref/**',
    // Local worktrees for parallel sessions, gitignored for the same reason.
    '.claude/worktrees/**',
  ]),
])

export default eslintConfig
