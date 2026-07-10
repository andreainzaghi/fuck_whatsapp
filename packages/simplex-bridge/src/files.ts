/**
 * Attachment staging (uploads from the UI) and confined serving of received
 * files. The bridge never parses or transforms file contents — bytes in,
 * bytes out, strictly inside two allow-listed directories.
 */
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ServerResponse } from 'node:http';

export interface FileAreas {
  /** Directory where the core writes received files (--files-folder). */
  filesDir: string;
  /** Directory where the bridge stages outgoing uploads. */
  stagingDir: string;
}

export async function ensureAreas(areas: FileAreas): Promise<void> {
  await mkdir(areas.filesDir, { recursive: true });
  await mkdir(areas.stagingDir, { recursive: true });
}

/** Keep a conservative charset; the display name shown to peers comes from
 * the message content, not from this on-disk name. */
export function sanitizeFilename(name: string | undefined): string {
  const base = (name ?? 'file').split(/[\\/]/).pop() ?? 'file';
  const cleaned = base.replace(/[^\w.\- ]+/g, '_').slice(0, 80);
  return cleaned.length > 0 && cleaned !== '.' && cleaned !== '..' ? cleaned : 'file';
}

/** Cumulative ceiling for the outgoing-attachment staging area. Bounds disk
 * use if uploads are never followed by a send (staging is otherwise cleared on
 * send completion and at shutdown). */
export const STAGING_MAX_BYTES = 512 * 1024 * 1024;

async function stagingBytes(stagingDir: string): Promise<number> {
  let entries: string[] = [];
  try {
    entries = await readdir(stagingDir);
  } catch {
    return 0;
  }
  let total = 0;
  for (const e of entries) {
    try {
      total += (await stat(path.join(stagingDir, e))).size;
    } catch {
      /* entry vanished — ignore */
    }
  }
  return total;
}

export async function stageUpload(areas: FileAreas, suggestedName: string | undefined, bytes: Buffer): Promise<{ absPath: string; size: number } | 'staging-full'> {
  if ((await stagingBytes(areas.stagingDir)) + bytes.length > STAGING_MAX_BYTES) return 'staging-full';
  const name = `${randomUUID()}-${sanitizeFilename(suggestedName)}`;
  const abs = path.join(areas.stagingDir, name);
  await writeFile(abs, bytes, { flag: 'wx' });
  return { absPath: abs, size: bytes.length };
}

/**
 * Resolve a requested path and verify it lives inside one of the allowed
 * areas. Both the requested path and each allow-listed area are passed through
 * realpath (so symlinks are collapsed on both sides), then the result must be
 * strictly BELOW an area — compared with the path separator appended, so a
 * sibling like `<area>-evil` cannot match, and an area itself is not a file.
 * Served paths are files the core just wrote, so they already exist; a race
 * between this check and the caller's read is out of the local-only threat
 * model (see docs/LOCALHOST_SECURITY.md).
 *
 * A NON-absolute request is treated as a name relative to the files directory:
 * the SimpleX core reports *received* file paths relative to `--files-folder`.
 * It is joined to filesDir and then subjected to the SAME realpath confinement,
 * so a relative traversal (e.g. `../../etc/passwd`) still resolves outside the
 * allowed areas and is rejected. This does not widen the confinement.
 */
export async function confinePath(areas: FileAreas, requested: string): Promise<string | null> {
  if (typeof requested !== 'string' || requested.length === 0 || requested.includes('\0')) return null;
  const candidate = path.isAbsolute(requested) ? requested : path.join(areas.filesDir, requested);
  let real: string;
  try {
    real = await realpath(candidate);
  } catch {
    return null;
  }
  for (const area of [areas.filesDir, areas.stagingDir]) {
    let areaReal: string;
    try {
      areaReal = await realpath(area);
    } catch {
      continue;
    }
    if (real === areaReal) return null; // the directory itself is not a file
    if (real.startsWith(areaReal + path.sep)) return real;
  }
  return null;
}

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};

/** Serve a confined file. Unknown types download as octet-stream (nosniff). */
export async function serveConfinedFile(areas: FileAreas, requested: string, res: ServerResponse): Promise<boolean> {
  const real = await confinePath(areas, requested);
  if (!real) return false;
  let info;
  try {
    info = await stat(real);
  } catch {
    return false;
  }
  if (!info.isFile()) return false;
  const mime = MIME[path.extname(real).toLowerCase()] ?? 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': mime,
    'Content-Length': info.size,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': mime === 'application/octet-stream' ? 'attachment' : 'inline',
    'Cross-Origin-Resource-Policy': 'same-origin',
  });
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(real);
    stream.pipe(res);
    stream.on('end', () => resolve());
    stream.on('error', reject);
  });
  return true;
}

/** Delete a staged upload (voice notes/attachments after delivery or error).
 * Only the staging area is deletable — received files belong to the user. */
export async function deleteStagedFile(areas: FileAreas, requested: string): Promise<boolean> {
  if (typeof requested !== 'string' || !path.isAbsolute(requested) || requested.includes('\0')) return false;
  let real: string;
  try {
    real = await realpath(requested);
  } catch {
    return false;
  }
  let stagingReal: string;
  try {
    stagingReal = await realpath(areas.stagingDir);
  } catch {
    return false;
  }
  if (!real.startsWith(stagingReal + path.sep)) return false;
  try {
    await rm(real, { force: true });
    return true;
  } catch {
    return false;
  }
}

/** Wipe every staged file (called at shutdown). */
export async function cleanStaging(areas: FileAreas): Promise<void> {
  let entries: string[] = [];
  try {
    entries = await readdir(areas.stagingDir);
  } catch {
    return;
  }
  await Promise.allSettled(entries.map((e) => rm(path.join(areas.stagingDir, e), { force: true, recursive: true })));
}

/** Content-addressed name helper for tests. */
export function contentHash(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
