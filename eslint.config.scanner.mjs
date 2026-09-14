// Scanner-parity config: mirrors the eslint-plugin-obsidianmd "recommended"
// preset (including typescript-eslint's type-checked rules) that Obsidian's
// review scanner runs against production sources. Run via `npm run lint:scanner`.
// Findings here fail locally before submission instead of during review.
import tsparser from '@typescript-eslint/parser';
import obsidianmd from 'eslint-plugin-obsidianmd';
import { DEFAULT_ACRONYMS } from 'eslint-plugin-obsidianmd/dist/lib/rules/ui/acronyms.js';
import { DEFAULT_BRANDS } from 'eslint-plugin-obsidianmd/dist/lib/rules/ui/brands.js';
import { defineConfig } from 'eslint/config';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const tsconfigRootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig([
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'main.js'],
  },
  ...obsidianmd.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir,
      },
    },
    rules: {
      // The scanner's default sentence-case lexicon does not know this
      // fork's product brands, so it would demand lowercasing correct UI
      // strings like "MiMo" or "Codex". Mirror the brand/acronym
      // customizations from eslint.config.mjs; every other rule keeps the
      // scanner's exact recommended severity.
      'obsidianmd/ui/sentence-case': [
        'error',
        {
          ignoreWords: ['Claudian', 'Codex', 'MiMo', 'OpenCode', 'Pi', 'WSL'],
          brands: [...DEFAULT_BRANDS, 'Claudian', 'Codex', 'MiMo', 'OpenCode', 'Pi'],
          acronyms: [...DEFAULT_ACRONYMS, 'TOML', 'WSL'],
          ignoreRegex: ['\\.(?:claude|codex|opencode)/'],
          enforceCamelCaseLower: true,
        },
      ],
    },
  },
]);
