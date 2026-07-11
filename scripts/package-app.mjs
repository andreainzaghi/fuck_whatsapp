#!/usr/bin/env node
/**
 * package-app.mjs — assemble a double-click package for the HOST platform.
 *
 *   macOS  -> dist-pkg/Fuck WhatsApp.app  + Fuck-WhatsApp-macOS-<arch>.zip
 *   Linux  -> dist-pkg/Fuck WhatsApp/     + Fuck-WhatsApp-Linux-<arch>.tar.gz
 *   Windows-> dist-pkg/Fuck WhatsApp/     + Fuck-WhatsApp-Windows-x64.zip  (CI)
 *
 * The package is fully self-contained: the SEA executable (embeds Node), the
 * frontend, the SHA-256-verified SimpleX core, and — on macOS — the openssl
 * dylibs the core needs. No Node/Docker/SimpleX install required by the user.
 *
 * Run per-platform (SEA cannot be cross-injected): CI runs this on each OS.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const buildDir = path.join(repoRoot, 'build');
const outRoot = path.join(repoRoot, 'dist-pkg');
const version = readFileSync(path.join(repoRoot, 'VERSION'), 'utf8').trim();
const manifest = JSON.parse(readFileSync(path.join(repoRoot, 'vendor', 'simplex', 'simplex-manifest.json'), 'utf8'));

const platform = process.platform;
const arch = process.arch; // arm64 | x64
const platKey = `${platform === 'win32' ? 'windows' : platform === 'darwin' ? 'darwin' : 'linux'}-${arch === 'x64' ? 'x64' : 'arm64'}`;

function run(cmd, args, opts = {}) {
  execFileSync(cmd, args, { stdio: 'inherit', ...opts });
}
function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/* ---------------- preconditions ---------------- */
const webDist = path.join(repoRoot, 'apps', 'web', 'dist', 'index.html');
if (!existsSync(webDist)) {
  console.error('Frontend not built — run: npm run build');
  process.exit(1);
}
const exeName = platform === 'win32' ? 'fuck-whatsapp.exe' : 'fuck-whatsapp';
if (!existsSync(path.join(buildDir, exeName))) {
  console.error('SEA executable not built — run: npm run bundle:launcher && node scripts/build-sea.mjs');
  process.exit(1);
}
const coreName = platform === 'win32' ? 'simplex-chat.exe' : 'simplex-chat';
const corePath = path.join(repoRoot, 'runtime', 'bin', coreName);
const coreManifest = path.join(repoRoot, 'runtime', 'bin', 'simplex-chat.sha256');
if (!existsSync(corePath) || !existsSync(coreManifest)) {
  console.error('SimpleX core not present/verified — run: npm run setup');
  process.exit(1);
}
// Re-verify the core against the pinned manifest before packaging it.
const pinned = manifest.platforms[platKey]?.sha256;
if (pinned && sha256(corePath) !== pinned) {
  console.error(`SimpleX core SHA-256 does not match the manifest for ${platKey} — refusing to package.`);
  process.exit(1);
}

rmSync(outRoot, { recursive: true, force: true });
mkdirSync(outRoot, { recursive: true });

/* ---------------- assemble resources ---------------- */
function writeResources(resDir) {
  mkdirSync(path.join(resDir, 'bin'), { recursive: true });
  cpSync(path.join(repoRoot, 'apps', 'web', 'dist'), path.join(resDir, 'web'), { recursive: true });
  copyFileSync(corePath, path.join(resDir, 'bin', coreName));
  chmodSync(path.join(resDir, 'bin', coreName), 0o755);
  // integrity manifest sits NEXT TO the binary (launcher looks for
  // "<dir>/simplex-chat.sha256")
  copyFileSync(coreManifest, path.join(resDir, 'bin', 'simplex-chat.sha256'));
  // macOS: bundle openssl dylibs the core links against (kept out of the
  // binary; DYLD_LIBRARY_PATH points here at spawn, binary stays pristine).
  if (platform === 'darwin') {
    const libDir = path.join(resDir, 'lib');
    mkdirSync(libDir, { recursive: true });
    for (const lib of ['libcrypto.3.dylib', 'libssl.3.dylib']) {
      const src = `/opt/homebrew/opt/openssl@3.0/lib/${lib}`;
      if (existsSync(src)) {
        copyFileSync(src, path.join(libDir, lib));
        chmodSync(path.join(libDir, lib), 0o755);
      } else {
        console.warn(`! openssl dylib not found: ${src} (macOS package will need system openssl@3.0)`);
      }
    }
  }
}

const files = {
  readme: path.join(repoRoot, 'packaging', 'README-FIRST.txt'),
  notices: path.join(repoRoot, 'THIRD_PARTY_NOTICES.md'),
};

let pkgDirName;
let artifactPath;

if (platform === 'darwin') {
  const appDir = path.join(outRoot, 'Fuck WhatsApp.app');
  const contents = path.join(appDir, 'Contents');
  mkdirSync(path.join(contents, 'MacOS'), { recursive: true });
  mkdirSync(path.join(contents, 'Resources'), { recursive: true });
  // executable
  copyFileSync(path.join(buildDir, exeName), path.join(contents, 'MacOS', 'Fuck WhatsApp'));
  chmodSync(path.join(contents, 'MacOS', 'Fuck WhatsApp'), 0o755);
  writeResources(path.join(contents, 'Resources'));
  // Info.plist
  writeFileSync(
    path.join(contents, 'Info.plist'),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Fuck WhatsApp</string>
  <key>CFBundleDisplayName</key><string>Fuck WhatsApp</string>
  <key>CFBundleIdentifier</key><string>com.fuckwhatsapp.app</string>
  <key>CFBundleVersion</key><string>${version}</string>
  <key>CFBundleShortVersionString</key><string>${version}</string>
  <key>CFBundleExecutable</key><string>Fuck WhatsApp</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict></plist>
`,
  );
  // ad-hoc sign the whole bundle (unsigned test build)
  try {
    run('codesign', ['--sign', '-', '--force', '--deep', appDir]);
  } catch {
    console.warn('! codesign failed; app remains unsigned');
  }
  // Stage the .app + extras under a single, cleanly-named folder so the zip
  // extracts to "Fuck-WhatsApp-macOS-<arch>/Fuck WhatsApp.app" (no stray dir).
  pkgDirName = `Fuck-WhatsApp-macOS-${arch === 'x64' ? 'x64' : 'arm64'}`;
  const zipStage = path.join(outRoot, pkgDirName);
  mkdirSync(zipStage, { recursive: true });
  cpSync(appDir, path.join(zipStage, 'Fuck WhatsApp.app'), { recursive: true });
  if (existsSync(files.readme)) copyFileSync(files.readme, path.join(zipStage, 'README-FIRST.txt'));
  copyFileSync(files.notices, path.join(zipStage, 'THIRD_PARTY_NOTICES.txt'));
  writeChecksums(zipStage);
  artifactPath = path.join(outRoot, `${pkgDirName}.zip`);
  run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', zipStage, artifactPath]);

  // Also build a double-clickable .dmg (drag-to-Applications layout).
  try {
    const dmgStage = path.join(outRoot, 'dmg-stage');
    rmSync(dmgStage, { recursive: true, force: true });
    mkdirSync(dmgStage, { recursive: true });
    cpSync(appDir, path.join(dmgStage, 'Fuck WhatsApp.app'), { recursive: true });
    execFileSync('ln', ['-s', '/Applications', path.join(dmgStage, 'Applications')]);
    if (existsSync(files.readme)) copyFileSync(files.readme, path.join(dmgStage, 'README-FIRST.txt'));
    const dmgPath = path.join(outRoot, `${pkgDirName}.dmg`);
    rmSync(dmgPath, { force: true });
    run('hdiutil', ['create', '-volname', 'Fuck WhatsApp', '-srcfolder', dmgStage, '-ov', '-format', 'UDZO', '-quiet', dmgPath]);
    rmSync(dmgStage, { recursive: true, force: true });
    const dmgSum = sha256(dmgPath);
    writeFileSync(`${dmgPath}.sha256`, `${dmgSum}  ${path.basename(dmgPath)}\n`);
    console.log(`✓ ${path.relative(repoRoot, dmgPath)}\n  sha256: ${dmgSum}`);
  } catch (e) {
    console.warn(`! DMG build skipped (${e.message}); the .zip is the primary macOS artifact`);
  }
} else {
  // Linux / Windows portable directory
  const dirName = 'Fuck WhatsApp';
  const appDir = path.join(outRoot, dirName);
  mkdirSync(appDir, { recursive: true });
  copyFileSync(path.join(buildDir, exeName), path.join(appDir, platform === 'win32' ? 'Fuck WhatsApp.exe' : 'Fuck WhatsApp'));
  chmodSync(path.join(appDir, platform === 'win32' ? 'Fuck WhatsApp.exe' : 'Fuck WhatsApp'), 0o755);
  writeResources(path.join(appDir, 'resources'));
  if (existsSync(files.readme)) copyFileSync(files.readme, path.join(appDir, 'README-FIRST.txt'));
  copyFileSync(files.notices, path.join(appDir, 'THIRD_PARTY_NOTICES.txt'));
  writeChecksums(appDir);
  if (platform === 'win32') {
    pkgDirName = 'Fuck-WhatsApp-Windows-x64';
    artifactPath = path.join(outRoot, `${pkgDirName}.zip`);
    run('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path "${appDir}\\*" -DestinationPath "${artifactPath}" -Force`]);
  } else {
    pkgDirName = `Fuck-WhatsApp-Linux-${arch === 'x64' ? 'x64' : 'arm64'}`;
    artifactPath = path.join(outRoot, `${pkgDirName}.tar.gz`);
    run('tar', ['-czf', artifactPath, '-C', outRoot, dirName]);
  }
}

/* SHA256SUMS.txt over every shipped file under `root`. */
function writeChecksums(root) {
  const lines = [];
  const walk = (dir, rel) => {
    for (const e of readdirSync(dir)) {
      if (e === 'SHA256SUMS.txt') continue;
      const abs = path.join(dir, e);
      const r = rel ? `${rel}/${e}` : e;
      if (statSync(abs).isDirectory()) walk(abs, r);
      else lines.push(`${sha256(abs)}  ${r}`);
    }
  };
  walk(root, '');
  writeFileSync(path.join(root, 'SHA256SUMS.txt'), lines.sort().join('\n') + '\n');
}

const finalSum = sha256(artifactPath);
writeFileSync(`${artifactPath}.sha256`, `${finalSum}  ${path.basename(artifactPath)}\n`);
console.log(`\n✓ ${path.relative(repoRoot, artifactPath)}`);
console.log(`  sha256: ${finalSum}`);
