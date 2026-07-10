/**
 * Typed client for the local bridge REST endpoints. All requests are
 * same-origin (127.0.0.1 bridge) and authenticated by the HttpOnly session
 * cookie — credentials are kept explicit on every call.
 *
 * SECURITY: no message content, names or paths are ever logged from here.
 * Failures collapse to null / sanitized error codes.
 */
import {
  BRIDGE_ROUTES,
  type ApiError,
  type ProfileActionResponse,
  type SessionResponse,
  type StatusResponse,
} from '@fwa/shared-types';

async function postJson(route: string, body: unknown): Promise<Response | null> {
  try {
    return await fetch(route, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

async function readJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Exchange the one-time bootstrap code for the session cookie. */
export async function exchangeSession(bootstrap: string): Promise<StatusResponse | null> {
  const res = await postJson(BRIDGE_ROUTES.session, { bootstrap });
  if (!res || !res.ok) return null;
  const data = await readJson<SessionResponse>(res);
  return data?.status ?? null;
}

/** Current core status; null when the session cookie is missing/invalid. */
export async function getStatus(): Promise<StatusResponse | null> {
  try {
    const res = await fetch(BRIDGE_ROUTES.status, { credentials: 'same-origin' });
    if (!res.ok) return null;
    return await readJson<StatusResponse>(res);
  } catch {
    return null;
  }
}

async function profileAction(
  route: string,
  body: unknown,
): Promise<{ ok: boolean; code?: string; status?: StatusResponse }> {
  const res = await postJson(route, body);
  if (!res) return { ok: false, code: 'network' };
  const data = await readJson<ProfileActionResponse | ApiError>(res);
  if (res.ok && data && data.ok) return { ok: true, status: (data as ProfileActionResponse).status };
  return { ok: false, code: (data as ApiError | null)?.code ?? 'internal' };
}

export async function createProfile(
  displayName: string,
  password: string,
): Promise<{ ok: boolean; code?: string; status?: StatusResponse }> {
  return profileAction(BRIDGE_ROUTES.profileCreate, { displayName, password });
}

export async function openProfile(
  password: string,
): Promise<{ ok: boolean; code?: string; status?: StatusResponse }> {
  return profileAction(BRIDGE_ROUTES.profileOpen, { password });
}

/**
 * Stage attachment bytes on the local disk for the core to encrypt and send.
 * Returns the absolute staged path to pass as `filePath` in a composed send.
 */
export async function uploadBlob(blob: Blob, filename: string): Promise<{ absPath: string; size: number } | null> {
  // Header values must be ISO-8859-1 safe or fetch() throws; the bridge
  // sanitizes the suggested name again on its side.
  const safeName = filename.replace(/[^\x20-\x7e]/g, '_').slice(0, 200) || 'file';
  try {
    const res = await fetch(BRIDGE_ROUTES.upload, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-FWA-Filename': safeName,
      },
      body: blob,
    });
    if (!res.ok) return null;
    const data = await readJson<{ ok: boolean; absPath: string; size: number }>(res);
    if (!data || !data.ok) return null;
    return { absPath: data.absPath, size: data.size };
  } catch {
    return null;
  }
}

/** Same-origin URL that streams a confined local file (files/ or staging/). */
export function fileUrl(absPath: string): string {
  return `${BRIDGE_ROUTES.file}?path=${encodeURIComponent(absPath)}`;
}

/** Delete a staged upload after the core finished sending it. Best-effort. */
export async function deleteStaged(absPath: string): Promise<void> {
  try {
    await fetch(`${BRIDGE_ROUTES.file}?path=${encodeURIComponent(absPath)}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });
  } catch {
    // best-effort: the bridge also garbage-collects staging on shutdown
  }
}

/**
 * "Lock and close": ask the launcher to lock the database (stop the core) and
 * shut everything down cleanly. Returns true if the request was accepted.
 */
export async function lockAndClose(): Promise<boolean> {
  const res = await postJson(BRIDGE_ROUTES.shutdown, {});
  return !!res && res.ok;
}
