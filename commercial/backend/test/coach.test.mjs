import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
import {Store} from '../src/store.mjs';
import {createHandler} from '../src/app.mjs';
import {CoachProvider,CoachService,coachConfiguration,coachPrompt} from '../src/coach.mjs';

function setup(provider){
 const store=new Store(':memory:','c'.repeat(64));
 const identity=store.login('person','refresh'),other=store.login('other','refresh');
 store.update(identity.accountID,data=>{
   data.profile={name:'PRIVATE_NAME',language:'pt-BR',allergies:'peanuts',mealPrepPreference:'batch_cook'};
   data.plan={summary:{selectedDays:['Mon','Wed']},trainingHold:true,reviewRouting:{status:'REVIEW_NOTIFY'},nutrition:{reviewRequired:true}};
   data.state={cycleNumber:1,startedAt:new Date().toISOString(),completedSessions:{'w1:A':true,'w2:B':true},checkins:[{energy:2,sleep:1}]};
   data.monthID=randomUUID();
 });
 const service=new CoachService(store,provider);return {store,identity,other,service};
}
const question=()=>({question:'Como cuidar da recuperação?',requestID:randomUUID()});
test('coach requires consent, uses authoritative context and stores bounded encrypted account-scoped history',async()=>{
 let calls=0;
 const provider={names:()=>['gemini'],answer:async(system,input)=>{
   calls++;const data=JSON.parse(input);assert.match(system,/Brazilian Portuguese/);assert.match(system,/trainingHold/);
   assert.equal(data.profile.name,undefined);assert.equal(data.profile.allergies,'peanuts');
   assert.equal(data.plan.trainingHold,true);assert.equal(data.progress.checkins[0].training,undefined);
   assert.deepEqual(data.progress.completedSessions,{'w1:A':true});
   assert.equal(data.recentChat.length<=10,true);
   return {text:'Respeite o descanso e a restrição do seu plano.',provider:'gemini'};
 }};
 const c=setup(provider);try{
   await assert.rejects(c.service.ask(c.identity.accountID,question(),[]),/coach_consent_required/);
   c.service.consent(c.identity.accountID,true);
   const q=question(),weeks=[{number:1}];
   const result=await c.service.ask(c.identity.accountID,q,weeks);
   assert.equal(result.authoritativeState,true);assert.equal(calls,1);
   assert.deepEqual(await c.service.ask(c.identity.accountID,q,weeks),result);assert.equal(calls,1);
   await assert.rejects(c.service.ask(c.identity.accountID,{...q,question:'Different'},weeks),/coach_request_conflict/);
   assert.equal(c.service.status(c.other.accountID).messages.length,0);
   for(let i=0;i<12;i++)await c.service.ask(c.identity.accountID,question(),weeks);
   assert.equal(c.service.status(c.identity.accountID).messages.length,20);
   assert.equal(c.store.load(c.identity.accountID).plan.trainingHold,true);
   const encrypted=c.store.db.prepare('SELECT data FROM accounts WHERE id=?').get(c.identity.accountID).data;
   assert.equal(encrypted.includes('PRIVATE_NAME'),false);assert.equal(encrypted.includes('Respeite'),false);
   c.service.clear(c.identity.accountID);assert.equal(c.service.status(c.identity.accountID).messages.length,0);
   assert.equal(c.store.load(c.identity.accountID).coachLastRequest,undefined);
   c.service.consent(c.identity.accountID,false);assert.equal(c.service.status(c.identity.accountID).consented,false);
 }finally{c.store.close();}
});
test('revoked consent or changed safety state during an answer cannot publish stale advice',async()=>{
 let release;const provider={names:()=>['openai'],answer:()=>new Promise(resolve=>{release=resolve;})};
 const c=setup(provider);try{
   c.service.consent(c.identity.accountID,true);
   const pending=c.service.ask(c.identity.accountID,question(),[]);
   await assert.rejects(c.service.ask(c.identity.accountID,question(),[]),/coach_busy/);
   c.service.consent(c.identity.accountID,false);
   release({text:'stale',provider:'openai'});await assert.rejects(pending,/state_changed|coach_context_changed/);
   assert.equal(c.service.status(c.identity.accountID).messages.length,0);
   c.service.consent(c.identity.accountID,true);
   const changed=c.service.ask(c.identity.accountID,question(),[]);
   c.store.update(c.identity.accountID,data=>data.plan.trainingHold=false);
   release({text:'stale',provider:'openai'});await assert.rejects(changed,/state_changed/);
 }finally{c.store.close();}
});
test('configuration requires explicit enablement, keys and models; provider failure never masquerades as AI',async()=>{
 assert.deepEqual(coachConfiguration({OPENAI_API_KEY:'key',OPENAI_MODEL:'selected'}),{providers:[]});
 assert.throws(()=>coachConfiguration({HERCULES_COACH_ENABLED:'true',OPENAI_API_KEY:'key'}),/configuration/);
 assert.throws(()=>coachConfiguration({HERCULES_COACH_ENABLED:'true',HERCULES_COACH_PROVIDERS:'unknown'}),/configuration/);
 const disabled=new CoachProvider();await assert.rejects(disabled.answer('s','q'),/coach_unavailable/);
 const configured=coachConfiguration({HERCULES_COACH_ENABLED:'true',GEMINI_API_KEY:'secret1',GEMINI_MODEL:'chosen-gemini',OPENAI_API_KEY:'secret2',OPENAI_MODEL:'chosen-openai'});
 let calls=0;
 const provider=new CoachProvider(configured,async(url,options)=>{
   calls++;assert.equal(options.redirect,'error');assert.ok(options.signal);
   if(url.includes('googleapis'))return new Response(JSON.stringify({error:{message:'private upstream detail'}}),{status:503});
   const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.model,'chosen-openai');
   return Response.json({choices:[{message:{content:'Resposta real do provedor de teste'}}]});
 });
 assert.equal((await provider.answer('system','question')).provider,'openai');assert.equal(calls,2);
 const failed=new CoachProvider(configured,async()=>{throw Error('secret-key-and-provider-error');});
 await assert.rejects(failed.answer('system','question'),error=>error.code==='coach_unavailable'&&!error.message.includes('secret'));
});
test('all beta provider protocols are supported and reject oversized or empty responses',async()=>{
 for(const name of ['gemini','anthropic','openai','openrouter']){
   const provider=new CoachProvider({providers:[{name,key:'secret',model:'selected',base:'https://provider.invalid'}]},async(url,options)=>{
     const body=JSON.parse(options.body);
     if(name==='gemini'){assert.ok(body.systemInstruction);return Response.json({candidates:[{content:{parts:[{text:'ok'}]}}]});}
     if(name==='anthropic'){assert.equal(options.headers['anthropic-version'],'2023-06-01');return Response.json({content:[{type:'text',text:'ok'}]});}
     assert.ok(body.messages);return Response.json({choices:[{message:{content:'ok'}}]});
   });assert.equal((await provider.answer('s','q')).text,'ok');
 }
 const huge=new CoachProvider({providers:[{name:'openai',key:'k',model:'m',base:'https://provider.invalid'}]},async()=>new Response('x'.repeat(130000)));
 await assert.rejects(huge.answer('s','q'),/coach_unavailable/);
});
test('coach quotas survive service recreation and clearing messages does not reset limits',async()=>{
 const c=setup({names:()=>['openai'],answer:async()=>({text:'ok',provider:'openai'})});try{
   c.service.consent(c.identity.accountID,true);
   for(let i=0;i<30;i++)await c.service.ask(c.identity.accountID,question(),[]);
   c.service.clear(c.identity.accountID);
   const restarted=new CoachService(c.store,c.service.provider);
   await assert.rejects(restarted.ask(c.identity.accountID,question(),[]),/coach_limit/);
 }finally{c.store.close();}
});
test('HTTP coach is authenticated, rejects client context, and is explicitly unavailable without a provider',async()=>{
 const c=setup(new CoachProvider());try{
   const handler=createHandler({store:c.store,identity:{},purchases:{current:async()=>[]},config:{productIDs:['monthly']}});
   async function request(method,route,input,token=c.identity.accessToken){
     const req=Readable.from(input?[Buffer.from(JSON.stringify(input))]:[]);
     Object.assign(req,{method,url:route,headers:token?{authorization:'Bearer '+token}:{},socket:{remoteAddress:'test'}});
     let status,data;await handler(req,{writeHead:value=>status=value,end:value=>data=JSON.parse(value)});return {status,data};
   }
   assert.equal((await request('GET','/account/coach',null,null)).status,401);
   assert.equal((await request('GET','/account/coach')).data.available,false);
   assert.equal((await request('POST','/account/coach',{...question(),profile:{name:'injected'}})).status,400);
   assert.equal((await request('POST','/account/coach/consent',{accepted:true})).status,200);
   assert.equal((await request('DELETE','/account/coach')).status,200);
 }finally{c.store.close();}
});
