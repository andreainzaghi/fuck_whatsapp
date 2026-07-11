/**
 * Shared helpers for the SimpleX download/verify/update scripts. Single source
 * of truth: vendor/simplex/simplex-manifest.json.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = fileURLToPath(new URL('..', import.meta.url));
export const manifestPath = path.join(repoRoot, 'vendor', 'simplex', 'simplex-manifest.json');

export function loadManifest() {
  return JSON.parse(readFileSync(manifestPath, 'utf8'));
}

/** Manifest platform key for the host, e.g. "darwin-arm64". */
export function hostPlatformKey() {
  const os = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'darwin' : 'linux';
  const arch = process.arch === 'x64' ? 'x64' : process.arch === 'arm64' ? 'arm64' : process.arch;
  return `${os}-${arch}`;
}

export function coreFileName() {
  return process.platform === 'win32' ? 'simplex-chat.exe' : 'simplex-chat';
}

export function sha256File(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

export const EXPECTED_VERSION_PREFIX = (() => {
  const v = loadManifest().version;
  return `SimpleX Chat v${v}`;
})();
