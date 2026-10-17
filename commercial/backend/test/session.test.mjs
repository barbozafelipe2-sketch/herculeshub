import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Store,hash} from '../src/store.mjs';

const start=1800000000000;
test('refresh rotates device credentials, recovers a lost response, and preserves original Apple sign-in time',()=>{
 const store=new Store(':memory:','d'.repeat(64));try{
  const first=store.login('apple-person','apple-refresh',start);
  assert.equal(store.authenticate(first.accessToken,false,start).created_at,start);
  assert.throws(()=>store.authenticate(first.accessToken,false,start+3600001),/session_expired/);
  const next=store.renew(first.refreshToken,start+3600001);
  assert.notEqual(next.refreshToken,first.refreshToken);assert.notEqual(next.accessToken,first.accessToken);
  assert.equal(next.accountID,first.accountID);assert.equal(next.refreshExpiresAt,first.refreshExpiresAt);
  assert.equal(store.authenticate(next.accessToken,false,start+3600002).created_at,start);
  assert.deepEqual(store.renew(first.refreshToken,start+3600003),next);
  const row=store.db.prepare('SELECT * FROM refresh_sessions').get();
  assert.notEqual(row.token_hash,next.refreshToken);assert.equal(row.token_hash,hash(next.refreshToken));
  assert.equal(row.replay.includes(next.refreshToken),false);
 }finally{store.close();}
});
test('stale reuse, logout and expiry revoke one family without logging out another device',()=>{
 const store=new Store(':memory:','e'.repeat(64));try{
  const a=store.login('person','apple-refresh',start),b=store.login('person','apple-refresh',start);
  const rotated=store.renew(a.refreshToken,start+1000);
  assert.throws(()=>store.renew(a.refreshToken,start+61001),/refresh_invalid/);
  assert.throws(()=>store.authenticate(rotated.accessToken,false,start+61002),/session_expired/);
  assert.throws(()=>store.renew(rotated.refreshToken,start+61002),/refresh_invalid/);
  assert.equal(store.authenticate(b.accessToken,false,start+61002).account_id,b.accountID);
  store.logout(b.accessToken);
  assert.throws(()=>store.renew(b.refreshToken,start+62000),/refresh_invalid/);
  const c=store.login('other','apple-refresh',start);
  assert.throws(()=>store.renew(c.refreshToken,start+30*86400000),/refresh_invalid/);
  assert.throws(()=>store.renew('invalid',start),/refresh_invalid/);
 }finally{store.close();}
});
test('revoke is idempotent, deletion blocks renewal and deleted accounts lose all refresh sessions',()=>{
 const store=new Store(':memory:','f'.repeat(64));try{
  const a=store.login('person','apple-refresh',start);
  store.revokeRefresh(a.refreshToken);store.revokeRefresh(a.refreshToken);
  assert.throws(()=>store.authenticate(a.accessToken,false,start+1),/session_expired/);
  const b=store.login('person','apple-refresh',start);
  store.beginDeletion(b.accountID);
  assert.throws(()=>store.renew(b.refreshToken,start+1),/refresh_invalid/);
  const c=store.login('person','apple-refresh',start);
  store.finishDeletion(c.accountID);
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM refresh_sessions').get().n,0);
 }finally{store.close();}
});
test('old SQLite session schema migrates additively and refreshed sessions survive restart',()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'hercules-session-')),filename=path.join(directory,'state.db');
 let store;
 try{
  const old=new DatabaseSync(filename);
  old.exec('CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,account_id TEXT,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL)');old.close();
  store=new Store(filename,'1'.repeat(64));
  const first=store.login('person','apple-refresh',start);store.close();
  store=new Store(filename,'1'.repeat(64));
  const next=store.renew(first.refreshToken,start+3600001);
  assert.equal(next.accountID,first.accountID);
  assert.ok(store.db.prepare('PRAGMA table_info(sessions)').all().some(x=>x.name==='family_id'));
 }finally{store?.close();rmSync(directory,{recursive:true,force:true});}
});
