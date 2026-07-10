/**
 * Entry shim so `node --test tests/security/` works on Node >= 21, where
 * positional --test arguments are glob patterns (a bare directory is executed
 * as a single entry instead of being scanned). Node resolves the directory to
 * this index.js, which pulls in every security test file. On runners that DO
 * scan directories (Node 20), this file is ignored because it does not match
 * the *.test.* pattern — the suite never runs twice.
 */
import './bridge-auth.test.mjs';
