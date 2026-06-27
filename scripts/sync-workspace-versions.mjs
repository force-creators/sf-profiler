import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJsonPaths = [
  'packages/core/package.json',
  'apps/web/package.json',
  'apps/desktop/package.json',
  'apps/vscode/package.json',
];
const lockfilePath = 'package-lock.json';
const rootPackageJson = await readJson('package.json');
const targetVersion = rootPackageJson.version;

if (!targetVersion) {
  throw new Error('Root package.json must define a version.');
}

for (const packageJsonPath of packageJsonPaths) {
  const packageJson = await readJson(packageJsonPath);

  if (packageJson.version === targetVersion) {
    continue;
  }

  packageJson.version = targetVersion;
  await writeJson(packageJsonPath, packageJson);
}

await syncLockfileVersions();

async function syncLockfileVersions() {
  const lockfile = await readJson(lockfilePath);

  if (lockfile.packages?.['']) {
    lockfile.packages[''].version = targetVersion;
  }

  for (const packageJsonPath of packageJsonPaths) {
    if (lockfile.packages?.[packageJsonPath]) {
      lockfile.packages[packageJsonPath].version = targetVersion;
    }
  }

  await writeJson(lockfilePath, lockfile);
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(repoRoot, relativePath), 'utf8'));
}

async function writeJson(relativePath, value) {
  await writeFile(
    path.join(repoRoot, relativePath),
    `${JSON.stringify(value, null, 2)}\n`
  );
}
