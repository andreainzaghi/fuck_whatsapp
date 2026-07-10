/**
 * The honest security wording, reused by views. Never claim absolute
 * security — the truthful statement is exactly this sentence.
 */
export const SECURITY_SENTENCE =
  'Content is end-to-end encrypted. It can be read on participating devices after decryption.';

export default function SecurityBadge({ withSentence = false }: { withSentence?: boolean }) {
  return (
    <div className="security-badge-wrap">
      <span className="badge badge-security">
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
        End-to-end encrypted by SimpleX Core
      </span>
      {withSentence ? <p className="security-sentence">{SECURITY_SENTENCE}</p> : null}
    </div>
  );
}
