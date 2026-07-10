/**
 * Sanitized error-code -> calm human sentence. Codes come from the bridge
 * (ApiError.code) or the core (protocol error types). NEVER echo user input,
 * passwords, links or message content here.
 */
const ERROR_TEXT: Record<string, string> = {
  'wrong-password': 'Wrong password. Try again.',
  'weak-password': 'Password too weak — use at least 12 characters.',
  'profile-exists': 'A profile already exists on this device.',
  'core-already-running': 'The core is already running — reload the page.',
  'core-not-running': 'The core is not running yet — try again in a moment.',
  'rate-limited': 'Too many attempts. Wait a minute and try again.',
  unauthorized: 'Session expired — restart from the terminal and use the printed link.',
  network: 'Could not reach the local bridge. Is the launcher running?',
  disconnected: 'Not connected to the core. Try again in a moment.',
  timeout: 'The core did not answer in time. Try again.',
  internal: 'Something went wrong on the local bridge. Try again.',
};

export function errorText(code: string): string {
  return ERROR_TEXT[code] ?? `Something went wrong (code: ${code}).`;
}
