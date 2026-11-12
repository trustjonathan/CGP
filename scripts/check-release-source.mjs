import { readFile } from 'node:fs/promises';

const rootUrl = new URL('../', import.meta.url);
const packageJson = JSON.parse(await readFile(new URL('package.json', rootUrl), 'utf8'));
const packageLock = JSON.parse(await readFile(new URL('package-lock.json', rootUrl), 'utf8'));
const version = packageJson.version;

if (typeof version !== 'string'
  || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error('package.json must define a valid application version.');
}
if (packageLock.version !== version || packageLock.packages?.['']?.version !== version) {
  throw new Error('package.json and package-lock.json must use the same application version.');
}

if ((process.env.GITHUB_REF ?? '').startsWith('refs/tags/')) {
  const expectedTag = `v${version}`;
  if (process.env.GITHUB_REF_NAME !== expectedTag) {
    throw new Error(`Release tag ${process.env.GITHUB_REF_NAME ?? '(missing)'} must match ${expectedTag}.`);
  }
}

console.log(`Release source verified: v${version}.`);
