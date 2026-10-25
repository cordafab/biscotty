import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
async function walk(path) {
  const entries = await readdir(path, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? walk(resolve(path, entry.name)) : resolve(path, entry.name)))).flat();
}
const errors = [];
const files = await walk(resolve(root, 'src'));
for (const path of files) {
  const name = relative(root, path).replaceAll('\\', '/');
  const source = await readFile(path, 'utf8');
  if (!source.endsWith('\n') || /[\t ]+$/m.test(source)) errors.push(`${name}: whitespace`);
  if (path.endsWith('.js')) {
    const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
    if (result.status !== 0) errors.push(`${name}: ${result.stderr}`);
    if (!name.startsWith('src/backend/') && /\b(?:browser|chrome)\s*\./.test(source)) errors.push(`${name}: Firefox access outside backend`);
    if (/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|eval)\s*\(|new\s+Function\s*\(/.test(source)) errors.push(`${name}: forbidden network or dynamic execution`);
    for (const match of source.matchAll(/(?:from\s*|import\s*\()\s*['"]([^'"]+)['"]/g)) {
      const target = match[1];
      if (!target.startsWith('.')) { errors.push(`${name}: nonlocal import ${target}`); continue; }
      try { await stat(resolve(dirname(path), target)); } catch { errors.push(`${name}: missing module ${target}`); }
      if (name.startsWith('src/core/') && /\/backend\/|\/frontend\//.test(resolve(dirname(path), target))) errors.push(`${name}: pure module depends on GUI or Firefox`);
      if (name.startsWith('src/frontend/') && target.includes('backend/') && !target.includes('backend/client/')) errors.push(`${name}: frontend bypasses client`);
    }
  }
  if (path.endsWith('.html') && (/<script(?![^>]*\bsrc=)[^>]*>/i.test(source) || /\son\w+=/i.test(source))) errors.push(`${name}: inline script`);
}
const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
if (manifest.manifest_version !== 3 || manifest.version !== pkg.version || manifest.browser_specific_settings.gecko.strict_min_version !== '153.0' || manifest.incognito !== 'not_allowed') errors.push('Manifest does not match product platform');
if (pkg.dependencies || pkg.devDependencies || pkg.optionalDependencies) errors.push('External dependencies are prohibited');
if (JSON.stringify([...manifest.permissions].sort()) !== JSON.stringify(['cookies','storage','contextualIdentities','publicSuffix'].sort())) errors.push('Unexpected permissions');
if (manifest.content_security_policy.extension_pages.indexOf("connect-src 'none'") === -1) errors.push('Outbound connections must be blocked');
const resources = [manifest.action.default_popup, manifest.action.default_icon, manifest.options_ui.page, ...manifest.background.scripts, ...Object.values(manifest.icons)];
for (const path of resources) try { await stat(resolve(root, path)); } catch { errors.push(`Missing manifest resource: ${path}`); }
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`Checked ${files.length} native source files, imports, module boundaries, privacy restrictions, and manifest.`);
