import {DatabaseSync} from 'node:sqlite';
import {createHash,createHmac,randomBytes,createCipheriv,createDecipheriv,randomUUID} from 'node:crypto';
import {chmodSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {HTTPError,requireValue} from './errors.mjs';
export const hash=value=>createHash('sha256').update(value).digest('hex');

export class Store {
  constructor(filename,key){
    requireValue(/^[a-f0-9]{64}$/i.test(key),500,'encryption_key_required');
    this.key=Buffer.from(key,'hex');
    if(filename!==':memory:')mkdirSync(path.dirname(filename),{recursive:true,mode:0o700});
    this.db=new DatabaseSync(filename);
    if(filename!==':memory:')chmodSync(filename,0o600);
    this.db.exec(`
      PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY, subject_hash TEXT UNIQUE NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL, refresh TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS refresh_sessions(id TEXT PRIMARY KEY, account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE, token_hash TEXT UNIQUE NOT NULL, previous_hash TEXT, previous_until INTEGER, replay TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS challenges(id TEXT PRIMARY KEY, nonce TEXT NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS quotas(key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS purchase_owners(original_hash TEXT PRIMARY KEY, owner_hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS purchases(id_hash TEXT PRIMARY KEY, original_hash TEXT NOT NULL, owner_hash TEXT NOT NULL, data TEXT NOT NULL, signed_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS notifications(id_hash TEXT PRIMARY KEY, created_at INTEGER NOT NULL);
    `);
    // Additive migration: existing access sessions retain their original one-hour expiry.
    if(!this.db.prepare('PRAGMA table_info(sessions)').all().some(x=>x.name==='family_id')){
      this.db.exec('ALTER TABLE sessions ADD COLUMN family_id TEXT');
    }
  }
  close(){this.db.close();}
  seal(value,aad){
    const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,iv);
    cipher.setAAD(Buffer.from(aad));
    const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
    return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64');
  }
  open(value,aad){
    const bytes=Buffer.from(value,'base64'),cipher=createDecipheriv('aes-256-gcm',this.key,bytes.subarray(0,12));
    cipher.setAAD(Buffer.from(aad));cipher.setAuthTag(bytes.subarray(12,28));
    return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString('utf8'));
  }
  keyed(value){return createHmac('sha256',this.key).update(value).digest('hex');}
  accountID(subject){
    const x=this.keyed('apple-account:'+subject).slice(0,32).split('');
    x[12]='5';x[16]=((parseInt(x[16],16)&3)|8).toString(16);
    const s=x.join('');return [s.slice(0,8),s.slice(8,12),s.slice(12,16),s.slice(16,20),s.slice(20)].join('-');
  }
  atomic(fn){
    this.db.exec('BEGIN IMMEDIATE');
    try{const result=fn();this.db.exec('COMMIT');return result;}
    catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  quota(subject,scope,limit,window,now=Date.now()){
    const bucket=Math.floor(now/window),key=this.keyed(subject+':'+scope+':'+bucket);
    return this.atomic(()=>{
      this.db.prepare('DELETE FROM quotas WHERE expires_at < ?').run(now);
      const result=this.db.prepare('INSERT INTO quotas VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').get(key,(bucket+2)*window);
      return result.count<=limit;
    });
  }
  challenge(now=Date.now()){
    const id=randomUUID(),nonce=hash(randomBytes(32));
    this.db.prepare('DELETE FROM challenges WHERE expires_at < ?').run(now);
    this.db.prepare('INSERT INTO challenges VALUES(?,?,?)').run(id,nonce,now+300000);
    return {challengeID:id,nonceSHA256:nonce};
  }
  consumeChallenge(id,now=Date.now()){
    const row=this.db.prepare('DELETE FROM challenges WHERE id=? RETURNING *').get(id);
    requireValue(row&&row.expires_at>now,401,'challenge_invalid');return row.nonce;
  }
  login(subject,refresh,now=Date.now()){
    const id=this.accountID(subject),subjectHash=this.keyed('apple:'+subject);
    this.atomic(()=>{
      const old=this.db.prepare('SELECT id FROM accounts WHERE id=?').get(id);
      if(!old)this.db.prepare('INSERT INTO accounts(id,subject_hash,status,data,refresh) VALUES(?,?,?,?,?)')
        .run(id,subjectHash,'active',this.seal({},id),this.seal(refresh,id+':refresh'));
      else this.db.prepare('UPDATE accounts SET refresh=? WHERE id=?').run(this.seal(refresh,id+':refresh'),id);
    });
    return this.atomic(()=>{
      this.db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
      this.db.prepare('DELETE FROM refresh_sessions WHERE expires_at < ?').run(now);
      const family=randomUUID(),refreshToken=randomBytes(32).toString('base64url'),expires=now+30*86400000;
      this.db.prepare('INSERT INTO refresh_sessions(id,account_id,token_hash,created_at,expires_at) VALUES(?,?,?,?,?)')
        .run(family,id,hash(refreshToken),now,expires);
      return this.issueSession(id,family,refreshToken,now,expires,now);
    });
  }
  issueSession(id,family,refreshToken,signedInAt,expires,now){
    const accessToken=randomBytes(32).toString('base64url'),accessExpiry=Math.min(now+3600000,expires);
    this.db.prepare('INSERT INTO sessions(token_hash,account_id,created_at,expires_at,family_id) VALUES(?,?,?,?,?)')
      .run(hash(accessToken),id,signedInAt,accessExpiry,family);
    return {accountID:id,accessToken,refreshToken,accessExpiresAt:new Date(accessExpiry).toISOString(),refreshExpiresAt:new Date(expires).toISOString()};
  }
  revokeFamily(family){
    this.db.prepare('DELETE FROM sessions WHERE family_id=?').run(family);
    this.db.prepare('DELETE FROM refresh_sessions WHERE id=?').run(family);
  }
  renew(refreshToken,now=Date.now()){
    requireValue(typeof refreshToken==='string'&&/^[A-Za-z0-9_-]{43}$/.test(refreshToken),401,'refresh_invalid');
    const digest=hash(refreshToken);
    const result=this.atomic(()=>{
      const family=this.db.prepare('SELECT r.*,a.status FROM refresh_sessions r JOIN accounts a ON a.id=r.account_id WHERE r.token_hash=? OR r.previous_hash=?').get(digest,digest);
      if(!family)return null;
      if(family.expires_at<=now||family.status!=='active'){this.revokeFamily(family.id);return null;}
      if(family.previous_hash===digest){
        // Recover a lost response briefly; stale reuse then revokes this device's family.
        if(family.previous_until>now&&family.replay)return this.open(family.replay,family.id+':rotation');
        this.revokeFamily(family.id);return null;
      }
      const next=randomBytes(32).toString('base64url');
      this.db.prepare('DELETE FROM sessions WHERE family_id=?').run(family.id);
      const issued=this.issueSession(family.account_id,family.id,next,family.created_at,family.expires_at,now);
      this.db.prepare('UPDATE refresh_sessions SET token_hash=?,previous_hash=?,previous_until=?,replay=? WHERE id=?')
        .run(hash(next),digest,now+60000,this.seal(issued,family.id+':rotation'),family.id);
      return issued;
    });
    requireValue(result,401,'refresh_invalid');return result;
  }
  refreshAccount(refreshToken,now=Date.now()){
    requireValue(typeof refreshToken==='string'&&/^[A-Za-z0-9_-]{43}$/.test(refreshToken),401,'refresh_invalid');
    const row=this.db.prepare('SELECT r.account_id,r.expires_at,a.refresh,a.status FROM refresh_sessions r JOIN accounts a ON a.id=r.account_id WHERE r.token_hash=? OR r.previous_hash=?').get(hash(refreshToken),hash(refreshToken));
    requireValue(row&&row.expires_at>now&&row.status==='active',401,'refresh_invalid');
    return {id:row.account_id,appleRefresh:this.open(row.refresh,row.account_id+':refresh')};
  }
  revokeAllSessions(id){
    this.atomic(()=>{
      this.db.prepare('DELETE FROM sessions WHERE account_id=?').run(id);
      this.db.prepare('DELETE FROM refresh_sessions WHERE account_id=?').run(id);
    });
  }
  revokeRefresh(refreshToken){
    if(typeof refreshToken!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(refreshToken))return;
    this.atomic(()=>{
      const family=this.db.prepare('SELECT id FROM refresh_sessions WHERE token_hash=? OR previous_hash=?').get(hash(refreshToken),hash(refreshToken));
      if(family)this.revokeFamily(family.id);
    });
  }
  logout(accessToken){
    const row=this.db.prepare('SELECT family_id FROM sessions WHERE token_hash=?').get(hash(accessToken));
    if(row?.family_id)this.atomic(()=>this.revokeFamily(row.family_id));
    else this.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(accessToken));
  }
  authenticate(token,allowDeleting=false,now=Date.now()){
    requireValue(typeof token==='string'&&/^[A-Za-z0-9_-]{43}$/.test(token),401,'session_required');
    const row=this.db.prepare('SELECT s.account_id,s.created_at,a.status FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_at>?').get(hash(token),now);
    requireValue(row,401,'session_expired');
    requireValue(row.status==='active'||allowDeleting,409,'account_deletion_pending');return row;
  }
  load(id){
    const row=this.db.prepare('SELECT * FROM accounts WHERE id=?').get(id);
    requireValue(row,404,'account_missing');return {id,status:row.status,revision:row.revision,...this.open(row.data,id)};
  }
  update(id,fn,expectedRevision=null){
    return this.atomic(()=>{
      const current=this.load(id);
      requireValue(current.status==='active',409,'account_deletion_pending');
      requireValue(expectedRevision===null||current.revision===expectedRevision,409,'state_changed');
      const data={...current};delete data.id;delete data.status;delete data.revision;
      const result=fn(data,current.revision);
      this.db.prepare('UPDATE accounts SET data=?, revision=revision+1 WHERE id=?').run(this.seal(data,id),id);
      return result;
    });
  }
  beginDeletion(id){
    this.db.prepare("UPDATE accounts SET status='deleting' WHERE id=?").run(id);
    const row=this.db.prepare('SELECT refresh FROM accounts WHERE id=?').get(id);
    requireValue(row,404,'account_missing');return this.open(row.refresh,id+':refresh');
  }
  finishDeletion(id){
    // Minimal keyed purchase ownership is retained to prevent cross-account receipt reassignment.
    this.atomic(()=>{this.db.prepare('DELETE FROM accounts WHERE id=?').run(id);});
  }
  recordPurchase(tx){
    const original=hash(tx.originalTransactionId),owner=this.keyed('purchase:'+tx.appAccountToken),id=hash(tx.transactionId);
    const old=this.db.prepare('SELECT owner_hash FROM purchase_owners WHERE original_hash=?').get(original);
    requireValue(!old||old.owner_hash===owner,409,'purchase_account_mismatch');
    this.db.prepare('INSERT OR IGNORE INTO purchase_owners VALUES(?,?)').run(original,owner);
    const prior=this.db.prepare('SELECT signed_at,data FROM purchases WHERE id_hash=?').get(id);
    if(prior){
      const data=this.open(prior.data,'purchase:'+id);
      if(prior.signed_at>tx.signedDate || (prior.signed_at===tx.signedDate&&data.revocationDate))return;
    }
    this.db.prepare('INSERT INTO purchases VALUES(?,?,?,?,?) ON CONFLICT(id_hash) DO UPDATE SET data=excluded.data,signed_at=excluded.signed_at')
      .run(id,original,owner,this.seal(tx,'purchase:'+id),tx.signedDate);
  }
  purchase(tx){return this.atomic(()=>this.recordPurchase(tx));}
  notify(id,tx,now=Date.now()){
    this.atomic(()=>{
      const seen=this.db.prepare('INSERT OR IGNORE INTO notifications VALUES(?,?)').run(hash(id),now);
      if(seen.changes&&tx)this.recordPurchase(tx);
    });
  }
  purchases(id){
    return this.db.prepare('SELECT id_hash,data FROM purchases WHERE owner_hash=?').all(this.keyed('purchase:'+id))
      .map(row=>this.open(row.data,'purchase:'+row.id_hash));
  }
}

