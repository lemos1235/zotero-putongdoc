import { copyFile, readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const source = join(root, 'dist', `${pkg.config.xpiName}.xpi`);
const target = join(root, 'dist', `${pkg.config.xpiName}-${pkg.version}.xpi`);

// Reuse the packaged artifact from `zotero-plugin build` so both XPI files are identical.
await copyFile(source, target);
const { size } = await stat(target);
console.log(`Packed: ${target} (${size} bytes)`);
