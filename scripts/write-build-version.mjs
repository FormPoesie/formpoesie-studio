import { writeFile } from 'node:fs/promises';

await writeFile(
  new URL('../public/build-version.json', import.meta.url),
  JSON.stringify({ version: new Date().toISOString() }) + '\n',
  'utf8',
);
