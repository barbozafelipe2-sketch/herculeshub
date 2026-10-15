import test from 'node:test';
test('a refunded latest subscription period cannot fall back to an older overlapping receipt',async()=>{
 const c=await setup();try{
 const a=await c.login(),token=a.accessToken;
 await c.request('/account/onboarding',{token,method:'POST',body:{profile}});
 const now=Date.now();
 const older={...c.tx(a.accountID,'old'),originalTransactionId:'chain',purchaseDate:now-100000,expiresDate:now+3600000};
 const newer={...c.tx(a.accountID,'new'),originalTransactionId:'chain',purchaseDate:now-1000,expiresDate:now+7200000,revocationDate:now};
 c.store.purchase(older);c.store.purchase(newer);
 assert.equal((await c.request('/account/weeks/2',{token})).status,403);
 assert.equal((await c.request('/account/weeks/1',{token})).status,200);
 }finally{await c.cleanup();}
});
test('next-month approval is explicit, account-scoped, atomic and cannot be replayed',async()=>{
 const c=await setup();try{
 const a=await c.login(),token=a.accessToken;
 await c.request('/account/onboarding',{token,method:'POST',body:{profile}});
 const now=Date.now(),iso=d=>new Date(now-d*86400000).toISOString();
 c.store.update(a.accountID,data=>{
  data.state.startedAt=iso(30);data.state.finalMark={ts:iso(1),weight:'78'};
  data.state.baseline={ts:iso(30),weight:'80',targetWeight:'78'};
  data.state.checkpoint={ts:iso(14),weight:'79'};
  data.state.checkins=Array.from({length:14},(_,i)=>({ts:iso(i+1),energy:4,sleep:4,training:4,nutrition:4}));
  data.state.completedSessions=Object.fromEntries([1,2,3,4].flatMap(w=>data.plan.training.pattern.map(p=>['w'+w+':'+p,true])));
 });
 const staged=await c.request('/account/next-month/propose',{token,method:'POST'});
 assert.equal(staged.status,200);
 const proposalID=staged.data.proposalID;
 assert.equal((await c.request('/account/next-month/approve',{token,method:'POST',body:{proposalID,approveDiet:true,approveCalendar:false}})).status,400);
 const attempt=()=>c.request('/account/next-month/approve',{token,method:'POST',body:{proposalID,approveDiet:true,approveCalendar:true}});
 const results=await Promise.all([attempt(),attempt()]);
 assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);
 assert.equal(c.store.load(a.accountID).state.cycleNumber,2);
 assert.equal((await attempt()).status,409);
 }finally{await c.cleanup();}
});
test('notification replay is idempotent and cannot undo a newer revocation',async()=>{
 const c=await setup();try{
 const a=await c.login(),tx=c.tx(a.accountID);
 c.store.notify('refund',{...tx,signedDate:tx.signedDate+20,revocationDate:Date.now()});
 c.store.notify('old-purchase',{...tx,signedDate:tx.signedDate});
 c.store.notify('refund',{...tx,signedDate:tx.signedDate+50});
 assert.ok(c.store.purchases(a.accountID)[0].revocationDate);
 assert.equal(c.store.db.prepare('SELECT count(*) AS count FROM notifications').get().count,2);
 }finally{await c.cleanup();}
});
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../src/store.mjs';
import {createHandler} from '../src/app.mjs';
import {HTTPError} from '../src/errors.mjs';
const profile={name:'Teste',language:'pt-BR',primaryGoal:'general_fitness',level:'beginner',days:['Mon','Wed','Fri'],
 location:'gym',minutes:'45',units:'metric',meals:'3',cooking:'basic',mealPrepPreference:'mixed',eatOutFrequency:'rare',
 sleep:'7',stress:'2',currentPain:'no',redFlags:'no',professionalRestrictions:'no',activityType:'cycling',
 activityDays:['Tue'],proteinPreferences:[],grainPreferences:[],veggiePreferences:[],foodStyles:[],painAreas:[],
 accuracy:true,prototypeAck:true,openToOtherVeggies:true,weight:'80',targetWeight:'78'};
async function setup(coachProvider){
 const folder=mkdtempSync(path.join(os.tmpdir(),'hercules-api-')),filename=path.join(folder,'state.db'),key='a'.repeat(64);
 const store=new Store(filename,key),config={productIDs:['monthly']};
 let revoked=false,appleDown=false,failRevoke=false;
 const identity={exchange:async token=>({subject:token,refresh:'secret-refresh-'+token}),revoke:async()=>{if(failRevoke)throw Error('Apple down');}};
 const tx=(accountID,transactionId='tx-1')=>({appAccountToken:accountID,productId:'monthly',transactionId,originalTransactionId:transactionId,expiresDate:Date.now()+3600000,signedDate:Date.now(),revocationDate:revoked?Date.now():undefined});
 const purchases={transaction:async(jws,id)=>{const data=JSON.parse(jws);if(data.appAccountToken!==id)throw new HTTPError(403,'purchase_account_mismatch');return data;},
   current:async known=>{if(appleDown)throw Error('Apple unavailable');return known.map(t=>({...t,revocationDate:revoked?Date.now():t.revocationDate,signedDate:Date.now()}));},
   notification:async jws=>JSON.parse(jws)};
 const handler=createHandler({store,identity,purchases,config,coachProvider});
 async function request(route,{token,method='GET',body}={}){
   const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);
   Object.assign(req,{method,url:route,socket:{remoteAddress:'127.0.0.1'},headers:token?{authorization:'Bearer '+token}:{}});
   let status,headers,bytes;
   const res={writeHead:(code,value)=>{status=code;headers=value;},end:value=>{bytes=Buffer.from(value);}};
   await handler(req,res);
   return {status,data:headers['Content-Type'].startsWith('application/pdf')?bytes:JSON.parse(bytes.toString())};
 }
 async function login(subject='apple-person'){
   const challenge=(await request('/auth/apple/challenge',{method:'POST'})).data;
   const result=await request('/auth/apple/session',{method:'POST',body:{...challenge,identityToken:subject,authorizationCode:'verified-code'}});
   assert.equal(result.status,200);return result.data;
 }
 const cleanup=async()=>{store.close();rmSync(folder,{recursive:true,force:true});};
 return {store,request,login,tx,cleanup,folder,filename,key,setRevoked:v=>revoked=v,setAppleDown:v=>appleDown=v,setFailRevoke:v=>failRevoke=v};
}
test('onboarding, locked weeks, account-bound purchase, check-in, refund and PDF report',async()=>{
 const c=await setup();try{
 const a=await c.login(),b=await c.login('other');
 assert.equal((await c.request('/account/month',{token:a.accessToken})).status,409);
 assert.equal((await c.request('/account/onboarding',{token:a.accessToken,method:'POST',body:{profile}})).status,200);
 const month=await c.request('/account/month',{token:a.accessToken});assert.equal(month.data.weeks.length,4);
 assert.equal((await c.request('/account/weeks/1',{token:a.accessToken})).status,200);
 assert.equal((await c.request('/account/weeks/2',{token:a.accessToken})).status,403);
 assert.equal((await c.request('/account/checkins',{token:a.accessToken,method:'POST',body:{week:2,energy:4,sleep:4}})).status,403);
 const purchase=c.tx(a.accountID);
 assert.equal((await c.request('/account/storekit',{token:b.accessToken,method:'POST',body:{signedTransaction:JSON.stringify(purchase)}})).status,403);
 assert.equal((await c.request('/account/storekit',{token:a.accessToken,method:'POST',body:{signedTransaction:JSON.stringify(purchase)}})).status,200);
 assert.equal((await c.request('/account/weeks/2',{token:a.accessToken})).status,200);
 c.setAppleDown(true);assert.equal((await c.request('/account/weeks/2',{token:a.accessToken})).status,503);c.setAppleDown(false);
 c.setRevoked(true);assert.equal((await c.request('/account/weeks/2',{token:a.accessToken})).status,403);
 assert.equal((await c.request('/account/checkins',{token:a.accessToken,method:'POST',body:{week:1,energy:4,sleep:4,training:4,nutrition:4,redFlagSymptom:true}})).status,200);
 assert.equal((await c.request('/account/sessions',{token:a.accessToken,method:'POST',body:{week:1,session:'fullA'}})).status,409);
 const report=await c.request('/account/report',{token:a.accessToken});assert.equal(report.status,200);assert.ok(report.data.toString().startsWith('%PDF-'));
 assert.ok(report.data.toString().includes('WEEK 4 - complete month preview'));
 const archive=report.data.toString().match(/%%HERCULES_BACKUP ([A-Za-z0-9_-]+)/)[1];
 assert.equal((await c.request('/account/restore',{token:b.accessToken,method:'POST',body:{archive}})).status,403);
 assert.equal((await c.request('/account/restore',{token:a.accessToken,method:'POST',body:{archive}})).status,200);
 assert.equal(c.store.load(a.accountID).plan.trainingHold,true);
 assert.equal((await c.request('/account/month',{token:b.accessToken})).status,409);
 }finally{await c.cleanup();}
});
test('sessions, meals, replacements, photo confirmation, milestones and missing tracking remain truthful',async()=>{
 const c=await setup();try{
 const a=await c.login(),token=a.accessToken;
 assert.equal((await c.request('/account/onboarding',{token,method:'POST',body:{profile}})).status,200);
 const detail=(await c.request('/account/weeks/1',{token})).data;
 assert.ok(detail.sessions.length>0&&detail.days.length===7);
 assert.equal((await c.request('/account/sessions',{token,method:'POST',body:{week:1,session:'fullA'}})).status,200);
 assert.equal((await c.request('/account/post-workout',{token,method:'POST',body:{week:1,session:'fullA',step:'water'}})).status,200);
 const meal=detail.days[0].rows[0],mealBody={week:1,day:0,mealID:meal.id};
 assert.equal((await c.request('/account/meals',{token,method:'POST',body:{...mealBody,action:'check'}})).status,200);
 assert.equal((await c.request('/account/meals',{token,method:'POST',body:{...mealBody,action:'photo',confirmed:false,image:'/9j/AA=='}})).status,400);
 assert.equal((await c.request('/account/meals',{token,method:'POST',body:{...mealBody,action:'photo',confirmed:true,image:'/9j/AA=='}})).status,200);
 assert.equal((await c.request('/account/meals',{token,method:'POST',body:{...mealBody,action:'replace'}})).status,200);
 assert.equal((await c.request('/account/milestones',{token,method:'POST',body:{week:1,kind:'finalMark',weight:'79'}})).status,409);
 assert.equal((await c.request('/account/milestones',{token,method:'POST',body:{week:1,kind:'baseline',weight:'80'}})).status,200);
 assert.equal((await c.request('/account/checkins',{token,method:'POST',body:{week:1,energy:3,sleep:3}})).status,200);
 assert.equal(c.store.load(a.accountID).state.checkins[0].training,undefined);
 assert.equal((await c.request('/account/next-month/propose',{token,method:'POST'})).status,409);
 }finally{await c.cleanup();}
});
test('deletion waits for Apple revocation and then removes sessions and encrypted account data',async()=>{
 const c=await setup();try{
 const a=await c.login(),token=a.accessToken;
 await c.request('/account/onboarding',{token,method:'POST',body:{profile}});
 c.setFailRevoke(true);
 assert.equal((await c.request('/account',{token,method:'DELETE'})).status,503);
 assert.equal((await c.request('/account/month',{token})).status,409);
 c.setFailRevoke(false);
 assert.equal((await c.request('/account',{token,method:'DELETE'})).status,200);
 assert.equal((await c.request('/account/month',{token})).status,401);
 assert.throws(()=>c.store.load(a.accountID));
 }finally{await c.cleanup();}
});
test('durable encrypted storage, quotas and purchase ownership survive restart',()=>{
 const folder=mkdtempSync(path.join(os.tmpdir(),'hh-store-')),filename=path.join(folder,'state.db'),key='b'.repeat(64);
 let store=new Store(filename,key);
 const account=store.login('apple-identifier','refresh-secret');
 store.update(account.accountID,data=>data.privateNote='UNIQUE_SENSITIVE_HEALTH_TEXT');
 assert.equal(store.quota('a','scope',1,60000),true);assert.equal(store.quota('a','scope',1,60000),false);
 const tx={transactionId:'1',originalTransactionId:'original',appAccountToken:account.accountID,signedDate:1,expiresDate:Date.now()+1000};
 store.purchase(tx);store.close();
 assert.equal(readFileSync(filename).includes(Buffer.from('UNIQUE_SENSITIVE_HEALTH_TEXT')),false);
 store=new Store(filename,key);
 assert.equal(store.load(account.accountID).privateNote,'UNIQUE_SENSITIVE_HEALTH_TEXT');
 assert.equal(store.quota('a','scope',1,60000),false);
 assert.throws(()=>store.purchase({...tx,transactionId:'2',appAccountToken:'other'}),/purchase_account_mismatch/);
 store.close();rmSync(folder,{recursive:true,force:true});
});


test('commercial Coach HTTP uses only authorized weeks, preserves safety holds, and never writes the plan',async()=>{
 let prompt,called=0;
 const coachProvider={names:()=>['gemini'],answer:async(system,input)=>{called++;prompt={system,data:JSON.parse(input)};return {text:'Seu plano está disponível no aplicativo.',provider:'gemini'};}};
 const c=await setup(coachProvider);try{
 const account=await c.login(),token=account.accessToken;
 await c.request('/account/onboarding',{token,method:'POST',body:{profile}});
 const request={question:'Qual o meu treino?',requestID:'11111111-1111-4111-8111-111111111111'};
 assert.equal((await c.request('/account/coach',{token,method:'POST',body:request})).status,403);
 await c.request('/account/coach/consent',{token,method:'POST',body:{accepted:true}});
 const before=structuredClone(c.store.load(account.accountID).plan);
 const answer=await c.request('/account/coach',{token,method:'POST',body:request});
 assert.equal(answer.status,200);assert.equal(answer.data.authoritativeState,true);
 assert.deepEqual(prompt.data.plan.allowedWeeks.map(w=>w.number),[1]);
 assert.deepEqual(c.store.load(account.accountID).plan,before);
 assert.equal((await c.request('/account/coach',{token,method:'POST',body:request})).status,200);assert.equal(called,1);
 c.store.update(account.accountID,data=>{data.plan.trainingHold=true;});
 const held=await c.request('/account/coach',{token,method:'POST',body:{...request,requestID:'22222222-2222-4222-8222-222222222222'}});
 assert.equal(held.status,200);assert.equal(prompt.data.plan.trainingHold,true);
 assert.deepEqual(prompt.data.plan.allowedWeeks[0].sessions,[]);
 assert.equal(c.store.load(account.accountID).plan.trainingHold,true);
 await c.request('/account/coach/consent',{token,method:'POST',body:{accepted:false}});
 assert.equal((await c.request('/account/coach',{token})).data.messages.length,0);
 }finally{await c.cleanup();}
});
