<!--
Thanks for contributing! Keep PRs focused. Read CONTRIBUTING.md first.
Do not include any personal data, real chat content, invitations, or secrets.
-->

## What does this PR do?

<!-- One or two sentences. Link the issue it closes: "Closes #123". -->

## Type

- [ ] Bug fix
- [ ] Feature
- [ ] Docs
- [ ] Build / CI / packaging
- [ ] Refactor (no behavior change)

## Checklist

- [ ] `npm run build` passes (all workspaces, TypeScript strict).
- [ ] `node --test tests/security/bridge-auth.test.mjs` passes.
- [ ] `npm run test:security` passes (no plaintext / canary leaks).
- [ ] I did **not** add tracking, analytics, remote assets, fonts, or CDNs.
- [ ] I did **not** add custom cryptography or a remote backend.
- [ ] I did **not** weaken the loopback-only + authenticated bridge model, or log message content / tokens / file names.
- [ ] I did **not** add unpinned or unnecessary dependencies.
- [ ] No personal data, secrets, databases, or runtime files are included.
- [ ] Docs updated if behavior changed (README / relevant `docs/`).

## Security / privacy impact

<!-- Note any change that touches the launcher, bridge, auth, logging, packaging,
or the SimpleX integration. "None" is a valid answer if truly none. -->
