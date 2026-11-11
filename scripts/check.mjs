import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const files = ['server.mjs', 'lib.mjs'];
for (const directory of ['core', 'public', 'scripts', 'test'])
  for (const file of await readdir(directory))
    if (/\.m?js$/.test(file)) files.push(`${directory}/${file}`);
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(1);
  }
}
const inventory = JSON.parse(await readFile('docs/features.json', 'utf8'));
if (inventory.features.length < 301)
  throw new Error('Feature inventory must preserve the 300+ scope');
if (new Set(inventory.features.map((f) => f.id)).size !== inventory.features.length)
  throw new Error('Duplicate feature IDs');
console.log(
  `Syntax checked ${files.length} JavaScript modules. Inventory tracks ${inventory.features.length} capabilities; planned entries are not counted as delivered.`,
);
