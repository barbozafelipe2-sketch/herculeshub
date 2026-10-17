import {createPublicKey,verify,sign} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {HTTPError,requireValue} from './errors.mjs';
const decode=part=>JSON.parse(Buffer.from(part,'base64url').toString('utf8'));
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
export class AppleIdentity {
  constructor(config,fetcher=fetch){this.config=config;this.fetch=fetcher;this.keys=null;this.keysUntil=0;}
  async json(url,options={}){
    const response=await this.fetch(url,{...options,signal:AbortSignal.timeout(12000),redirect:'error'});
    requireValue(response.ok,503,'apple_unavailable');return response.json();
  }
  clientSecret(){
    const now=Math.floor(Date.now()/1000),head=encode({alg:'ES256',kid:this.config.signInKeyID,typ:'JWT'});
    const body=encode({iss:this.config.teamID,iat:now,exp:now+300,aud:'https://appleid.apple.com',sub:this.config.bundleID});
    const input=head+'.'+body;
    return input+'.'+sign('sha256',Buffer.from(input),{key:this.config.signInPrivateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');
  }
  async verifyIdentity(token,nonce){
    requireValue(typeof token==='string'&&token.length<16000,401,'apple_token_invalid');
    const parts=token.split('.');requireValue(parts.length===3,401,'apple_token_invalid');
    let header,payload;try{header=decode(parts[0]);payload=decode(parts[1]);}catch{throw new HTTPError(401,'apple_token_invalid');}
    requireValue(header.alg==='RS256'&&typeof header.kid==='string'&&!header.crit,401,'apple_token_invalid');
    if(!this.keys||this.keysUntil<Date.now()||!this.keys.some(k=>k.kid===header.kid)){
      const data=await this.json('https://appleid.apple.com/auth/keys');
      requireValue(Array.isArray(data.keys),503,'apple_keys_invalid');
      this.keys=data.keys;this.keysUntil=Date.now()+3600000;
    }
    const key=this.keys.find(k=>k.kid===header.kid&&k.kty==='RSA'&&k.alg==='RS256'&&k.use==='sig');
    requireValue(key,401,'apple_key_invalid');
    requireValue(verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),createPublicKey({key,format:'jwk'}),Buffer.from(parts[2],'base64url')),401,'apple_signature_invalid');
    const now=Math.floor(Date.now()/1000);
    requireValue(payload.iss==='https://appleid.apple.com'&&payload.aud===this.config.bundleID&&
      Number.isFinite(payload.exp)&&payload.exp>now&&Number.isFinite(payload.iat)&&payload.iat<=now+60&&
      payload.nonce===nonce&&typeof payload.sub==='string'&&payload.sub.length>0,401,'apple_claims_invalid');
    return payload;
  }
  async exchange(identityToken,code,nonce){
    const identity=await this.verifyIdentity(identityToken,nonce);
    requireValue(typeof code==='string'&&code.length>0&&code.length<4096,400,'authorization_code_required');
    const response=await this.json('https://appleid.apple.com/auth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({client_id:this.config.bundleID,client_secret:this.clientSecret(),code,grant_type:'authorization_code'})});
    const exchanged=await this.verifyIdentity(response.id_token,nonce);
    requireValue(exchanged.sub===identity.sub&&typeof response.refresh_token==='string'&&response.refresh_token.length>0,401,'apple_exchange_invalid');
    return {subject:identity.sub,refresh:response.refresh_token};
  }
  async validateRefresh(token){
    const response=await this.fetch('https://appleid.apple.com/auth/token',{method:'POST',signal:AbortSignal.timeout(12000),redirect:'error',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:this.config.bundleID,
        client_secret:this.clientSecret(),refresh_token:token,grant_type:'refresh_token'})});
    const payload=await response.json().catch(()=>({}));
    if(response.status===400&&payload.error==='invalid_grant')throw new HTTPError(401,'apple_authorization_revoked');
    requireValue(response.ok&&typeof payload.access_token==='string'&&payload.access_token.length>0,503,'apple_unavailable');
  }
  async revoke(token){
    await this.jsonRevoke(token);
  }
  async jsonRevoke(token){
    const response=await this.fetch('https://appleid.apple.com/auth/revoke',{method:'POST',signal:AbortSignal.timeout(12000),redirect:'error',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:this.config.bundleID,
        client_secret:this.clientSecret(),token,token_type_hint:'refresh_token'})});
    requireValue(response.ok,503,'apple_revocation_unavailable');
  }
}
export class ApplePurchases {
  constructor(config,verifier,client){this.config=config;this.verifier=verifier;this.client=client;}
  static async create(config){
    const {SignedDataVerifier,Environment,AppStoreServerAPIClient}=await import('@apple/app-store-server-library');
    const environment=config.environment==='Production'?Environment.PRODUCTION:Environment.SANDBOX;
    const roots=config.rootCertificatePaths.map(p=>readFileSync(p));
    const verifier=new SignedDataVerifier(roots,true,environment,config.bundleID,config.appAppleID);
    const client=new AppStoreServerAPIClient(config.storePrivateKey,config.storeKeyID,config.issuerID,config.bundleID,environment);
    return new ApplePurchases(config,verifier,client);
  }
  validate(tx,accountID=null){
    requireValue(tx.bundleId===this.config.bundleID&&tx.environment===this.config.environment&&
      this.config.productIDs.includes(tx.productId)&&tx.type==='Auto-Renewable Subscription'&&
      typeof tx.transactionId==='string'&&typeof tx.originalTransactionId==='string'&&
      typeof tx.appAccountToken==='string'&&/^[a-f0-9-]{36}$/i.test(tx.appAccountToken)&&
      Number.isFinite(tx.expiresDate)&&Number.isFinite(tx.purchaseDate)&&tx.purchaseDate<=Date.now()+60000&&
      Number.isFinite(tx.signedDate)&&tx.signedDate<=Date.now()+300000,
      403,'purchase_invalid');
    tx.appAccountToken=tx.appAccountToken.toLowerCase();
    requireValue(!accountID||tx.appAccountToken===accountID,403,'purchase_account_mismatch');return tx;
  }
  async transaction(jws,accountID){
    const decoded=this.validate(await this.verifier.verifyAndDecodeTransaction(jws),accountID);
    // Check current Apple state so replaying a previously valid receipt cannot undo a refund.
    const current=await this.client.getTransactionInfo(decoded.transactionId);
    const tx=this.validate(await this.verifier.verifyAndDecodeTransaction(current.signedTransactionInfo),accountID);
    requireValue(tx.transactionId===decoded.transactionId,403,'purchase_invalid');return tx;
  }
  async current(transactions,accountID){
    const originals=[...new Set(transactions.map(t=>t.originalTransactionId))];
    const results=[];
    for(const original of originals){
      const response=await this.client.getAllSubscriptionStatuses(original);
      requireValue(Array.isArray(response.data)&&response.data.some(group=>(group.lastTransactions||[]).some(last=>last.signedTransactionInfo)),503,'apple_status_unavailable');
      for(const group of response.data||[])for(const last of group.lastTransactions||[]){
        if(last.signedTransactionInfo)results.push(this.validate(await this.verifier.verifyAndDecodeTransaction(last.signedTransactionInfo),accountID));
      }
    }
    return results;
  }
  async notification(jws){
    const envelope=await this.verifier.verifyAndDecodeNotification(jws);
    requireValue(typeof envelope.notificationUUID==='string',400,'notification_invalid');
    const tx=envelope.data?.signedTransactionInfo
      ?this.validate(await this.verifier.verifyAndDecodeTransaction(envelope.data.signedTransactionInfo)):null;
    requireValue(tx||envelope.notificationType==='TEST',400,'notification_transaction_required');
    return {id:envelope.notificationUUID,tx};
  }
}

