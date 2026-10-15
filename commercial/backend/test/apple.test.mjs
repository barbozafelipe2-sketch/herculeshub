import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {AppleIdentity,ApplePurchases} from '../src/apple.mjs';
const b64=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
test('Apple JWT verification rejects wrong nonce, issuer, audience, expiry, algorithm and signature',async()=>{
 const keys=generateKeyPairSync('rsa',{modulusLength:2048});
 const jwk={...keys.publicKey.export({format:'jwk'}),kid:'test-key',alg:'RS256',use:'sig'};
 const validator=new AppleIdentity({bundleID:'com.test'},async()=>({ok:true,json:async()=>({keys:[jwk]})}));
 const payload={iss:'https://appleid.apple.com',aud:'com.test',sub:'apple-sub',nonce:'expected',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+300};
 const jwt=(p,h={alg:'RS256',kid:'test-key'})=>{const input=b64(h)+'.'+b64(p);return input+'.'+sign('RSA-SHA256',Buffer.from(input),keys.privateKey).toString('base64url');};
 assert.equal((await validator.verifyIdentity(jwt(payload),'expected')).sub,'apple-sub');
 for(const change of [{nonce:'other'},{iss:'attacker'},{aud:'other'},{exp:1}])await assert.rejects(validator.verifyIdentity(jwt({...payload,...change}),'expected'));
 await assert.rejects(validator.verifyIdentity(jwt(payload,{alg:'none',kid:'test-key'}),'expected'));
 const valid=jwt(payload);await assert.rejects(validator.verifyIdentity(valid.slice(0,-8)+'AAAAAAAA','expected'));
});
test('StoreKit adapter calls official verifier and current Apple API; enforces product/account/environment',async()=>{
 const config={bundleID:'com.test',environment:'Sandbox',productIDs:['monthly']};
 const account='01234567-89ab-4cde-8fab-0123456789ab';
 const tx={bundleId:'com.test',environment:'Sandbox',productId:'monthly',type:'Auto-Renewable Subscription',
  transactionId:'tx',originalTransactionId:'original',appAccountToken:account,purchaseDate:Date.now()-1000,expiresDate:Date.now()+10000,signedDate:Date.now()};
 let current={...tx,revocationDate:Date.now()},calls=0;
 const verifier={verifyAndDecodeTransaction:async value=>{calls++;return value==='old'?{...tx}:{...current};}};
 const client={getTransactionInfo:async()=>({signedTransactionInfo:'current'})};
 const service=new ApplePurchases(config,verifier,client);
 assert.ok((await service.transaction('old',account)).revocationDate);assert.equal(calls,2);
 for(const changes of [{environment:'Production'},{productId:'unknown'},{bundleId:'other'},{appAccountToken:'other'}]){
  current={...tx,...changes};await assert.rejects(service.transaction('old',account));
 }
});

