import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

const rootDir = process.cwd();
const tmpDir = join(rootDir, '.tmp');
const siteDist = join(tmpDir, 'site-dist');
const systemDist = join(tmpDir, 'sistema-dist');
const outputDist = join(rootDir, 'dist');

const assertExists = async (targetPath, label) => {
  try {
    await stat(targetPath);
  } catch {
    throw new Error(`Missing ${label} at ${targetPath}. Run the corresponding build step first.`);
  }
};

await assertExists(siteDist, 'site build');
await assertExists(systemDist, 'system build');

await rm(outputDist, { recursive: true, force: true });
await mkdir(outputDist, { recursive: true });

// Root output: institutional website.
await cp(siteDist, outputDist, { recursive: true });

// Nested output: POS system available under /sistema.
await cp(systemDist, join(outputDist, 'sistema'), { recursive: true });

// Cleanup temporary artifacts to keep workspace tidy.
await rm(tmpDir, { recursive: true, force: true });

console.log('Merged deploy build: site at / and system at /sistema');
