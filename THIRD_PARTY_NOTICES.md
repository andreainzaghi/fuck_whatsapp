# Third-Party Notices

FWA (codename `fwa-chat`) is licensed under **AGPL-3.0-only** (see
[`LICENSE`](./LICENSE) and [`docs/LICENSES.md`](./docs/LICENSES.md)). This file
lists all third-party software FWA uses, with exact pinned versions. License
identifiers below were verified against each installed package's
`node_modules/<pkg>/package.json` `license` field and the resolved
`package-lock.json`; full license texts ship inside each package's directory
under `node_modules/`.

---

## SimpleX Chat CLI (the cryptographic core)

> **This is the most important third-party component.** All end-to-end
> encryption in FWA — double ratchet, X3DH-like key exchange, message queues,
> XFTP file encryption, forward secrecy, post-compromise security, and the
> SQLCipher database encryption — is implemented by the official, unmodified
> SimpleX Chat CLI. FWA implements zero cryptography.

| | |
|---|---|
| Component | SimpleX Chat CLI **v6.5.6** (binary reports `6.5.6.1`) |
| Copyright | SimpleX Chat Ltd and the SimpleX Chat contributors |
| Source | <https://github.com/simplex-chat/simplex-chat> |
| License | **AGPL-3.0** |
| Distribution | **Not vendored in this repository.** Downloaded unmodified from the official GitHub release by `npm run setup` (`scripts/install-simplex.mjs`) into `runtime/bin/simplex-chat`. |

Pinned SHA-256 checksums enforced by the install script (mismatch aborts):

| Release asset | SHA-256 | Provenance |
|---|---|---|
| `simplex-chat-macos-aarch64` | `06eedfcad8cbf31abb2c13892592a1a532c4043c4954be645dfe8a1447ee9066` | Computed by FWA at integration time over TLS from the official repository (the official `_sha256sums` for v6.5.6 covers Linux assets only — see `docs/KNOWN_LIMITATIONS.md`) |
| `simplex-chat-ubuntu-22_04-x86_64` | `eaa3106616a39acdca75b2312d56e41babb6ebca54204c943a992ec4b9461154` | Official signed `_sha256sums` release asset |
| `simplex-chat-ubuntu-24_04-x86_64` | `0aec0a1ebd35ec3dfbb9f969f5d58e4269c8eca236f5be096780b9465dda2dbe` | Official signed `_sha256sums` release asset |

The SimpleX name and logo are not used as FWA branding; attribution here and in
the app is factual. On macOS the CLI additionally links against Homebrew
`openssl@3.0` (Apache-2.0), installed and managed by the user's system.

---

## npm dependencies

All versions are pinned exactly (no ranges). `npm audit` reported
**0 vulnerabilities** for this tree at build time. FWA's own workspace packages
(`@fwa/launcher`, `@fwa/web`, `@fwa/ui`, `@fwa/shared-types`,
`@fwa/simplex-bridge`, all `0.1.0`) are AGPL-3.0-only and are omitted from the
tables below.

### Direct runtime dependencies

| Package | Version | License | Used by / for |
|---|---|---|---|
| react | 19.2.7 | MIT | web UI |
| react-dom | 19.2.7 | MIT | web UI |
| react-router-dom | 7.18.1 | MIT | web UI routing |
| zustand | 5.0.14 | MIT | web UI state |
| qrcode | 1.5.4 | MIT | invitation QR rendering |
| jsqr | 1.4.0 | Apache-2.0 | invitation QR scanning |
| ws | 8.21.0 | MIT | launcher/bridge WebSocket (core proxy) |

### Transitive runtime dependencies

Resolved as non-dev in `package-lock.json`.

| Package | Version | License | Pulled in by |
|---|---|---|---|
| react-router | 7.18.1 | MIT | react-router-dom |
| cookie | 1.1.1 | MIT | react-router |
| set-cookie-parser | 2.7.2 | MIT | react-router |
| scheduler | 0.27.0 | MIT | react-dom |
| @types/react ¹ | 19.2.17 | MIT | zustand (optional peer) |
| csstype ¹ | 3.2.3 | MIT | @types/react |
| dijkstrajs | 1.0.3 | MIT | qrcode |
| pngjs | 5.0.0 | MIT | qrcode |
| yargs ² | 15.4.1 | MIT | qrcode (its bundled CLI) |
| yargs-parser ² | 18.1.3 | ISC | yargs |
| cliui ² | 6.0.0 | ISC | yargs |
| camelcase ² | 5.3.1 | MIT | yargs-parser |
| decamelize ² | 1.2.0 | MIT | yargs-parser |
| find-up ² | 4.1.0 | MIT | yargs |
| locate-path ² | 5.0.0 | MIT | find-up |
| p-limit ² | 2.3.0 | MIT | p-locate |
| p-locate ² | 4.1.0 | MIT | locate-path |
| p-try ² | 2.2.0 | MIT | p-limit |
| path-exists ² | 4.0.0 | MIT | locate-path |
| require-directory ² | 2.1.1 | MIT | yargs |
| require-main-filename ² | 2.0.0 | ISC | yargs |
| set-blocking ² | 2.0.0 | ISC | yargs |
| string-width ² | 4.2.3 | MIT | yargs / cliui |
| strip-ansi ² | 6.0.1 | MIT | string-width |
| ansi-regex ² | 5.0.1 | MIT | strip-ansi |
| ansi-styles ² | 4.3.0 | MIT | wrap-ansi |
| color-convert ² | 2.0.1 | MIT | ansi-styles |
| color-name ² | 1.1.4 | MIT | color-convert |
| emoji-regex ² | 8.0.0 | MIT | string-width |
| is-fullwidth-code-point ² | 3.0.0 | MIT | string-width |
| which-module ² | 2.0.1 | ISC | yargs |
| wrap-ansi ² | 6.2.0 | MIT | cliui |
| y18n ² | 4.0.3 | ISC | yargs / cliui |
| get-caller-file ² | 2.0.5 | ISC | yargs |

¹ Type declarations only; contributes no runtime code to the built app.
² Installed to support `qrcode`'s command-line tool; FWA imports only the
`qrcode` library API, so these are not part of the built frontend bundle.

### Direct development dependencies

Build/test tooling only; not shipped with the application.

| Package | Version | License |
|---|---|---|
| typescript | 5.9.3 | Apache-2.0 |
| vite | 8.1.4 | MIT |
| vitest | 4.1.10 | MIT |
| @vitejs/plugin-react | 6.0.3 | MIT |
| jsdom | 29.1.1 | MIT |
| @types/node | 26.1.1 | MIT |
| @types/qrcode | 1.5.6 | MIT |
| @types/react-dom | 19.2.3 | MIT |
| @types/ws | 8.18.1 | MIT |

### Transitive development dependencies

| Package | Version | License |
|---|---|---|
| @asamuzakjp/css-color | 5.1.11 | MIT |
| @asamuzakjp/dom-selector | 7.1.1 | MIT |
| @asamuzakjp/generational-cache | 1.0.1 | MIT |
| @asamuzakjp/nwsapi | 2.3.9 | MIT |
| @bramus/specificity | 2.4.2 | MIT |
| @csstools/color-helpers | 6.1.0 | MIT-0 |
| @csstools/css-calc | 3.2.1 | MIT |
| @csstools/css-color-parser | 4.1.9 | MIT |
| @csstools/css-parser-algorithms | 4.0.0 | MIT |
| @csstools/css-syntax-patches-for-csstree | 1.1.6 | MIT-0 |
| @csstools/css-tokenizer | 4.0.0 | MIT |
| @emnapi/core | 1.11.1 | MIT |
| @emnapi/runtime | 1.11.1 | MIT |
| @emnapi/wasi-threads | 1.2.2 | MIT |
| @exodus/bytes | 1.15.1 | MIT |
| @jridgewell/sourcemap-codec | 1.5.5 | MIT |
| @napi-rs/wasm-runtime | 1.1.6 | MIT |
| @oxc-project/types | 0.139.0 | MIT |
| @rolldown/binding-* ³ | 1.1.5 | MIT |
| @rolldown/pluginutils | 1.0.1 | MIT |
| @standard-schema/spec | 1.1.0 | MIT |
| @tybys/wasm-util | 0.10.3 | MIT |
| @types/chai | 5.2.3 | MIT |
| @types/deep-eql | 4.0.2 | MIT |
| @types/estree | 1.0.9 | MIT |
| @vitest/expect | 4.1.10 | MIT |
| @vitest/mocker | 4.1.10 | MIT |
| @vitest/pretty-format | 4.1.10 | MIT |
| @vitest/runner | 4.1.10 | MIT |
| @vitest/snapshot | 4.1.10 | MIT |
| @vitest/spy | 4.1.10 | MIT |
| @vitest/utils | 4.1.10 | MIT |
| assertion-error | 2.0.1 | MIT |
| bidi-js | 1.0.3 | MIT |
| chai | 6.2.2 | MIT |
| convert-source-map | 2.0.0 | MIT |
| css-tree | 3.2.1 | MIT |
| data-urls | 7.0.0 | MIT |
| decimal.js | 10.6.0 | MIT |
| detect-libc | 2.1.2 | Apache-2.0 |
| entities | 8.0.0 | BSD-2-Clause |
| es-module-lexer | 2.3.0 | MIT |
| estree-walker | 3.0.3 | MIT |
| expect-type | 1.4.0 | Apache-2.0 |
| fdir | 6.5.0 | MIT |
| fsevents | 2.3.3 | MIT |
| html-encoding-sniffer | 6.0.0 | MIT |
| is-potential-custom-element-name | 1.0.1 | MIT |
| lightningcss (+ platform bindings ⁴) | 1.32.0 | MPL-2.0 |
| lru-cache | 11.5.2 | BlueOak-1.0.0 |
| magic-string | 0.30.21 | MIT |
| mdn-data | 2.27.1 | CC0-1.0 |
| nanoid | 3.3.15 | MIT |
| obug | 2.1.3 | MIT |
| parse5 | 8.0.1 | MIT |
| pathe | 2.0.3 | MIT |
| picocolors | 1.1.1 | ISC |
| picomatch | 4.0.5 | MIT |
| postcss | 8.5.16 | MIT |
| punycode | 2.3.1 | MIT |
| require-from-string | 2.0.2 | MIT |
| rolldown | 1.1.5 | MIT |
| saxes | 6.0.0 | ISC |
| siginfo | 2.0.0 | ISC |
| source-map-js | 1.2.1 | BSD-3-Clause |
| stackback | 0.0.2 | MIT |
| std-env | 4.2.0 | MIT |
| symbol-tree | 3.2.4 | MIT |
| tinybench | 2.9.0 | MIT |
| tinyexec | 1.2.4 | MIT |
| tinyglobby | 0.2.17 | MIT |
| tinyrainbow | 3.1.0 | MIT |
| tldts | 7.4.8 | MIT |
| tldts-core | 7.4.8 | MIT |
| tough-cookie | 6.0.2 | BSD-3-Clause |
| tr46 | 6.0.0 | MIT |
| tslib | 2.8.1 | 0BSD |
| undici | 7.28.0 | MIT |
| undici-types | 8.3.0 | MIT |
| w3c-xmlserializer | 5.0.0 | MIT |
| webidl-conversions | 8.0.1 | BSD-2-Clause |
| whatwg-mimetype | 5.0.0 | MIT |
| whatwg-url | 16.0.1 | MIT |
| why-is-node-running | 2.3.0 | MIT |
| xml-name-validator | 5.0.0 | Apache-2.0 |
| xmlchars | 2.2.0 | MIT |

³ Rolldown platform bindings, all `1.1.5`, MIT: `android-arm64`,
`darwin-arm64`, `darwin-x64`, `freebsd-x64`, `linux-arm-gnueabihf`,
`linux-arm64-gnu`, `linux-arm64-musl`, `linux-ppc64-gnu`, `linux-s390x-gnu`,
`linux-x64-gnu`, `linux-x64-musl`, `openharmony-arm64`, `wasm32-wasi`,
`win32-arm64-msvc`, `win32-x64-msvc`.

⁴ Lightningcss platform bindings, all `1.32.0`, MPL-2.0:
`lightningcss-android-arm64`, `-darwin-arm64`, `-darwin-x64`, `-freebsd-x64`,
`-linux-arm-gnueabihf`, `-linux-arm64-gnu`, `-linux-arm64-musl`,
`-linux-x64-gnu`, `-linux-x64-musl`, `-win32-arm64-msvc`, `-win32-x64-msvc`.
MPL-2.0 is a file-level copyleft; these packages are used unmodified, at build
time only, and are not distributed with the application.

---

## Trademark notices

- **SimpleX** is a product of SimpleX Chat Ltd. FWA uses the official SimpleX
  Chat CLI unmodified and credits it factually; the SimpleX name and logo are
  not used as FWA branding, and no affiliation or endorsement is implied.
- **WhatsApp** is a trademark of Meta Platforms, Inc. FWA has no affiliation
  with WhatsApp or Meta and uses none of their assets. The application name is
  provisional.
