import { cp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(scriptDir, '..');
const sourceWebDist = path.resolve(extensionRoot, '../web/dist');
const packagedWebDist = path.resolve(extensionRoot, 'media/web');

await rm(packagedWebDist, { force: true, recursive: true });
await cp(sourceWebDist, packagedWebDist, { recursive: true });
