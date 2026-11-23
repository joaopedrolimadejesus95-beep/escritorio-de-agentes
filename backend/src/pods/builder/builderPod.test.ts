import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  isAllowedBuilderSourcePath,
  TEMPLATE_MVP_DIR,
} from './builderPod.js';

test('isAllowedBuilderSourcePath restricts writes strictly to editable MVP folders', () => {
  // Permitidos
  assert.equal(isAllowedBuilderSourcePath('src/App.tsx'), true);
  assert.equal(isAllowedBuilderSourcePath('src/types/domain.ts'), true);
  assert.equal(isAllowedBuilderSourcePath('src/services/api.ts'), true);
  assert.equal(isAllowedBuilderSourcePath('src/services/seed.ts'), true);
  assert.equal(isAllowedBuilderSourcePath('src/components/Navbar.tsx'), true);
  assert.equal(isAllowedBuilderSourcePath('src/pages/Dashboard.tsx'), true);

  // Bloqueados (arquivos fixos do template e traversal)
  assert.equal(isAllowedBuilderSourcePath('package.json'), false);
  assert.equal(isAllowedBuilderSourcePath('vite.config.ts'), false);
  assert.equal(isAllowedBuilderSourcePath('tsconfig.json'), false);
  assert.equal(isAllowedBuilderSourcePath('index.html'), false);
  assert.equal(isAllowedBuilderSourcePath('src/main.tsx'), false);
  assert.equal(isAllowedBuilderSourcePath('src/index.css'), false);
  assert.equal(isAllowedBuilderSourcePath('../secret.ts'), false);
  assert.equal(isAllowedBuilderSourcePath('src/pages/hack.html'), false);
});

test('frontend-mvp template has required fixed files and node_modules ready', async () => {
  for (const rel of [
    'package.json',
    'vite.config.ts',
    'tsconfig.json',
    'index.html',
    'src/main.tsx',
    'src/index.css',
    'node_modules',
  ]) {
    await fs.access(path.join(TEMPLATE_MVP_DIR, rel));
  }
});
