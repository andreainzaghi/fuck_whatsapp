/**
 * One-time bootstrap code capture. The launcher opens the browser at
 * http://127.0.0.1:<port>/#b=<code> (see BOOTSTRAP_FRAGMENT_PARAM). The code
 * must be read and stripped from the URL BEFORE anything else runs so it never
 * survives in the address bar, browser history, or the hash router state.
 *
 * Supported hash forms (robust parsing, all observed launcher/router shapes):
 *   #b=<code>
 *   #/route&b=<code>
 *   #/route?b=<code>
 */
import { BOOTSTRAP_FRAGMENT_PARAM } from '@fwa/shared-types';

let captured: string | null = null;
let done = false;

/** Idempotent: reads the fragment once and strips the code from the URL. */
export function captureBootstrap(): void {
  if (done) return;
  done = true;

  const raw = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  if (!raw) return;

  // Candidate query-ish tails: the whole fragment (URLSearchParams treats the
  // '&'-separated pairs correctly even with a leading '/route' pair), plus the
  // tails after the first '&' and after the first '?' for '#/route?b=' forms.
  const candidates: string[] = [raw];
  const amp = raw.indexOf('&');
  if (amp !== -1) candidates.push(raw.slice(amp + 1));
  const qs = raw.indexOf('?');
  if (qs !== -1) candidates.push(raw.slice(qs + 1));

  for (const candidate of candidates) {
    const value = new URLSearchParams(candidate).get(BOOTSTRAP_FRAGMENT_PARAM);
    if (value) {
      captured = value;
      break;
    }
  }

  if (captured !== null) {
    // Strip the b=<code> pair wherever it sits in the fragment.
    const pattern = new RegExp(`(^|[&?])${BOOTSTRAP_FRAGMENT_PARAM}=[^&]*&?`, 'g');
    let cleaned = raw.replace(pattern, '$1');
    cleaned = cleaned.replace(/[&?]+$/, '');
    const url = window.location.pathname + window.location.search + (cleaned ? `#${cleaned}` : '');
    window.history.replaceState(null, '', url);
  }
}

/** Consumes the captured code (single use — it is one-time on the bridge too). */
export function takeBootstrap(): string | null {
  const value = captured;
  captured = null;
  return value;
}
