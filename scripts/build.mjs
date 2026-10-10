import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporaryDirectory = path.join(root, '.tmp', 'build');
fs.mkdirSync(temporaryDirectory, { recursive: true });

const next = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
const result = spawnSync(process.execPath, [next, 'build', '--webpack'], {
  cwd: root,
  env: {
    ...process.env,
    TEMP: temporaryDirectory,
    TMP: temporaryDirectory,
    TMPDIR: temporaryDirectory,
  },
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
