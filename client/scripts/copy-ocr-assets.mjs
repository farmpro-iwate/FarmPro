import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.resolve(here, '..');
const publicRoot = path.join(clientRoot, 'public', 'ocr');
const coreOut = path.join(publicRoot, 'core');
const langOut = path.join(publicRoot, 'lang');

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function findFile(root, fileName) {
  if (!(await exists(root))) return null;
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isFile() && entry.name === fileName) return full;
    if (entry.isDirectory()) {
      const nested = await findFile(full, fileName);
      if (nested) return nested;
    }
  }
  return null;
}

await rm(publicRoot, { recursive: true, force: true });
await mkdir(coreOut, { recursive: true });
await mkdir(langOut, { recursive: true });

const workerSource = path.join(clientRoot, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js');
if (!(await exists(workerSource))) {
  throw new Error(`Tesseract worker not found: ${workerSource}`);
}
await cp(workerSource, path.join(publicRoot, 'worker.min.js'));

const coreRoot = path.join(clientRoot, 'node_modules', 'tesseract.js-core');
const coreEntries = await readdir(coreRoot, { withFileTypes: true });
const coreFiles = coreEntries
  .filter((entry) => entry.isFile() && /^tesseract-core.*\.(?:js|wasm)$/.test(entry.name))
  .map((entry) => entry.name);

if (coreFiles.length === 0) {
  throw new Error(`Tesseract core assets not found: ${coreRoot}`);
}
for (const fileName of coreFiles) {
  await cp(path.join(coreRoot, fileName), path.join(coreOut, fileName));
}

const langPackageRoot = path.join(clientRoot, 'node_modules', '@tesseract.js-data', 'jpn');
const trainedData = await findFile(langPackageRoot, 'jpn.traineddata.gz');
if (!trainedData) {
  throw new Error(`Japanese traineddata not found under: ${langPackageRoot}`);
}
await cp(trainedData, path.join(langOut, 'jpn.traineddata.gz'));

console.log(`OCR assets copied to ${publicRoot}`);
