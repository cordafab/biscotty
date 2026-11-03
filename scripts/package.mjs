import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { deflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const check = spawnSync(process.execPath, ['scripts/check.mjs'], { cwd: root, stdio: 'inherit' });
if (check.status !== 0) process.exit(check.status || 1);
async function walk(path) {
  return (await Promise.all((await readdir(path, { withFileTypes: true })).map(entry => entry.isDirectory() ? walk(resolve(path, entry.name)) : resolve(path, entry.name)))).flat();
}
const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
const paths = ['LICENSE', 'manifest.json', ...(await walk(resolve(root, 'src'))).map(path => relative(root, path).replaceAll('\\', '/')), ...(await walk(resolve(root, 'assets'))).map(path => relative(root, path).replaceAll('\\', '/'))].sort();
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
// Standard ZIP records with deterministic timestamps; no bundler or ZIP dependency.
const local = [], directory = [];
let offset = 0;
for (const path of paths) {
  if (!/^(LICENSE|manifest\.json|src\/.*\.(js|html|css)|assets\/.*\.svg)$/.test(path)) throw new Error(`Unexpected package entry: ${path}`);
  const name = Buffer.from(path);
  const content = await readFile(resolve(root, path));
  const compressed = deflateRawSync(content, { level: 9 });
  const checksum = crc32(content);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(8, 8); header.writeUInt16LE(33, 12);
  header.writeUInt32LE(checksum, 14); header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(content.length, 22); header.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10); central.writeUInt16LE(33, 14);
  central.writeUInt32LE(checksum, 16); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(content.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
  local.push(header, name, compressed); directory.push(central, name);
  offset += header.length + name.length + compressed.length;
}
const central = Buffer.concat(directory);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50); end.writeUInt16LE(paths.length, 8); end.writeUInt16LE(paths.length, 10); end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
const archive = Buffer.concat([...local, central, end]);
await mkdir(resolve(root, 'dist'), { recursive: true });
const output = resolve(root, `dist/biscotty-${manifest.version}.zip`);
await writeFile(output, archive);
await writeFile(`${output}.sha256`, `${createHash('sha256').update(archive).digest('hex')}  biscotty-${manifest.version}.zip\n`);
console.log(`Unsigned native-source package: ${output} (${paths.length} files)`);
