import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync, mkdirSync, rmSync, cpSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
execFileSync(process.execPath,[path.join(root,'scripts/verify-upstream.mjs')],{stdio:'inherit'});
execFileSync(process.execPath,[path.join(root,'upstream/scripts/prepare-assets.mjs')],{stdio:'inherit'});
const assets=path.join(root,'upstream/public/assets');
const manifest=JSON.parse(readFileSync(path.join(assets,'asset-manifest.json'),'utf8'));
assert.equal(manifest.assets.length,manifest.counts.total);
for(const asset of manifest.assets){
  assert.ok(asset.path.startsWith('/assets/'));
  const file=path.resolve(assets,asset.path.slice('/assets/'.length));
  assert.ok(file.startsWith(assets+path.sep),'invalid asset path');
  const bytes=readFileSync(file);
  assert.equal(bytes.length,asset.bytes,asset.path+' size');
  assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256,asset.path+' SHA-256');
}
const target=path.resolve(root,'../ios/App/Resources/Catalog');
rmSync(target,{recursive:true,force:true});
mkdirSync(path.dirname(target),{recursive:true});
cpSync(assets,target,{recursive:true});
console.log(`Bundled ${manifest.assets.length} verified catalog images for native iOS.`);

