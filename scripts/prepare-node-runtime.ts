import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const VERSION = '22.20.0';
const ARCHIVE = `node-v${VERSION}-win-x64.zip`;
const URL = `https://nodejs.org/dist/v${VERSION}/${ARCHIVE}`;
const EXPECTED_SHA256 = 'BB819D6EB8F5BFDA294BBC83A7E4EC6539DA67C4233D54B0D655B9248B15E29D';

const root = path.resolve(process.env.OMNIKES_NODE_PACKAGE_DIR || 'vendor/node');
const download = path.join(root, ARCHIVE);
const extracted = path.join(root, 'runtime');

async function main(): Promise<void> {
  mkdirSync(root, { recursive: true });
  if (!existsSync(download)) {
    const response = await fetch(URL);
    if (!response.ok || !response.body) throw new Error(`Node.js download failed: HTTP ${response.status}`);
    await pipeline(Readable.fromWeb(response.body as never), createWriteStream(download));
  }

  const hash = createHash('sha256').update(readFileSync(download)).digest('hex').toUpperCase();
  if (hash !== EXPECTED_SHA256) throw new Error(`Node.js SHA-256 mismatch: expected ${EXPECTED_SHA256}, got ${hash}`);

  if (existsSync(extracted)) rmSync(extracted, { recursive: true, force: true });
  mkdirSync(extracted, { recursive: true });

  execFileSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command',
    'Expand-Archive', '-LiteralPath', download, '-DestinationPath', extracted, '-Force',
  ], { stdio: 'inherit' });

  const nodeExe = path.join(extracted, `node-v${VERSION}-win-x64`, 'node.exe');
  if (!existsSync(nodeExe)) throw new Error('Node.js runtime extraction did not produce node.exe');

  console.log(`Node.js ${VERSION} Windows x64 runtime: PASS`);
}

main().catch((error) => {
  console.error('NODE RUNTIME PACKAGE: FAIL', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
