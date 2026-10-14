import {createHash} from 'node:crypto';
import {readFileSync, existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(readFileSync(path.join(root,'UPSTREAM.json'),'utf8'));
assert.equal(manifest.role,'immutable upstream reference; not deployed commercial endpoints');
for(const item of manifest.files){
  const file=path.resolve(root,'upstream',item.path);
  assert.ok(file.startsWith(path.join(root,'upstream')+path.sep),'invalid manifest path');
  const bytes=readFileSync(file);
  const blob=createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
  assert.equal(bytes.length,item.bytes,item.path+' length');
  assert.equal(blob,item.gitBlobSHA,item.path+' Git blob');
}
for(const excluded of manifest.excluded){
  assert.equal(existsSync(path.join(root,'upstream',excluded)),false,'beta adapter must not be mirrored: '+excluded);
}
console.log(`Verified ${manifest.files.length} upstream files from ${manifest.commit}.`);

