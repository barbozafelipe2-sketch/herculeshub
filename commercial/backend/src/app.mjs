import {randomUUID} from 'node:crypto';
import {HTTPError,requireValue,iso} from './errors.mjs';
import {validateProfile} from './profile.mjs';
import {materialize} from '../../engine/src/materialize.mjs';
import {proposeNextMonth,approveNextMonth} from '../../engine/src/next-month.mts';
import {milestoneTimeValid,dedupeDailyCheckins} from '../../engine/upstream/netlify/functions/cycle-lib.mts';
import {makeTrace} from '../../engine/upstream/netlify/functions/trace-lib.mts';
import {archiveFor,readArchive,buildReport} from './reports.mjs';

const integer=(x,min,max)=>Number.isInteger(x)&&x>=min&&x<=max;
const short=(x,max)=>typeof x==='string'&&x.length<=max;
const cycleState=()=>({cycleNumber:1,startedAt:iso(),completedSessions:{},completedExercises:{},checkins:[],baseline:null,checkpoint:null,finalMark:null,traceLab:[],cycleHistory:[],mealEvents:[],postWorkout:[],proposals:null});
function freeWeek(data,now=Date.now()){
  return data.state.cycleNumber===1?1:Math.max(1,Math.min(4,Math.floor((now-Date.parse(data.state.startedAt))/604800000)+1));
}
function grant(store,config,id,now=Date.now()){
  const active=store.purchases(id).filter(t=>config.productIDs.includes(t.productId)&&!t.revocationDate&&t.expiresDate>now)
    .sort((a,b)=>b.expiresDate-a.expiresDate)[0];
  return active?{accountID:id,productID:active.productId,expiresAt:iso(active.expiresDate),revoked:false}:null;
}
function assertWeek(store,config,id,data,week,action){
  requireValue(data.plan&&data.state,409,'onboarding_required');
  requireValue(integer(week,1,4),400,'week_invalid');
  requireValue(week===freeWeek(data)||grant(store,config,id),403,'subscription_required');
  if(action==='training')requireValue(!data.plan.trainingHold,409,'training_safety_hold');
}
function content(data,week){
  const built=materialize(data.profile,data.plan,data.state.cycleNumber),selected=built.weeks[week-1];
  const overrides=data.state.mealReplacements||{};
  for(const day of selected.meals)for(let i=0;i<day.rows.length;i++){
    const row=day.rows[i],key=week+':'+day.day+':'+row.role+':'+row.occurrence;
    if(overrides[key])day.rows[i]=overrides[key];
  }
  return selected;
}
function month(data){
  requireValue(data.plan&&data.state,409,'onboarding_required');
  const built=materialize(data.profile,data.plan,data.state.cycleNumber);
  return {id:data.monthID,cycleNumber:data.state.cycleNumber,freeWeek:freeWeek(data),trainingHold:data.plan.trainingHold,
    startedAt:data.state.startedAt,selectedDays:data.plan.summary.selectedDays,profileLanguage:data.profile.language,
    weeks:built.weeks.map(w=>({number:w.number,title:data.plan.training.progression[w.number-1],
      summary:w.training.map(t=>t.rows.map(r=>r.title).join(', ')).join(' / ')+(data.plan.nutrition.reviewRequired?' | NOURISH: review required':' | '+w.meals[0]?.rows.map(m=>m.title).join(' / '))}))};
}
async function body(req,max=350000){
  const chunks=[];let bytes=0;
  for await(const chunk of req){bytes+=chunk.length;requireValue(bytes<=max,413,'body_too_large');chunks.push(chunk);}
  if(!bytes)return {};
  try{const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));requireValue(data&&typeof data==='object'&&!Array.isArray(data),400,'json_invalid');return data;}
  catch(error){if(error instanceof HTTPError)throw error;throw new HTTPError(400,'json_invalid');}
}
function response(res,status,data){
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(data));
}
export function createHandler({store,identity,purchases,config}){
  async function refreshPurchases(id){
    const known=store.purchases(id);
    if(known.length){for(const tx of await purchases.current(known,id))store.purchase(tx);}
  }
  return async(req,res)=>{
    try{
      const path=new URL(req.url,'http://internal').pathname,method=req.method;
      if(path==='/health'&&method==='GET')return response(res,200,{ok:true});
      const remote=req.socket.remoteAddress||'unknown';
      requireValue(store.quota(remote,'requests',240,60000),429,'rate_limit');
      if(method==='POST'&&path==='/auth/apple/challenge')return response(res,200,store.challenge());
      if(method==='POST'&&path==='/auth/apple/session'){
        requireValue(store.quota(remote,'apple-login',30,900000),429,'rate_limit');
        const input=await body(req,24000);
        requireValue(short(input.challengeID,100),400,'challenge_invalid');
        const nonce=store.consumeChallenge(input.challengeID);
        const verified=await identity.exchange(input.identityToken,input.authorizationCode,nonce);
        return response(res,200,store.login(verified.subject,verified.refresh));
      }
      if(method==='POST'&&path==='/apple/notifications'){
        const input=await body(req,120000);requireValue(short(input.signedPayload,110000),400,'notification_invalid');
        const verified=await purchases.notification(input.signedPayload);
        store.notify(verified.id,verified.tx);return response(res,200,{ok:true});
      }
      const token=req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]+)$/)?.[1];
      const auth=store.authenticate(token,path==='/account'&&method==='DELETE'),id=auth.account_id;
      requireValue(store.quota(id,'account',120,60000),429,'rate_limit');
      if(method==='POST'&&path==='/account/logout'){
        store.db.prepare('DELETE FROM sessions WHERE token_hash=?').run((await import('./store.mjs')).hash(token));
        return response(res,200,{ok:true});
      }
      if(method==='DELETE'&&path==='/account'){
        requireValue(Date.now()-auth.created_at<600000,401,'recent_signin_required');
        const refresh=store.beginDeletion(id);
        await identity.revoke(refresh);store.finishDeletion(id);return response(res,200,{ok:true});
      }
      if(method==='POST'&&path==='/account/storekit'){
        requireValue(store.quota(id,'storekit',30,3600000),429,'rate_limit');
        const input=await body(req,120000);requireValue(short(input.signedTransaction,110000),400,'purchase_invalid');
        const tx=await purchases.transaction(input.signedTransaction,id);store.purchase(tx);
        return response(res,200,{entitlement:grant(store,config,id)});
      }
      if(method==='GET'&&path==='/account/entitlement'){
        await refreshPurchases(id);return response(res,200,{entitlement:grant(store,config,id)});
      }
      if(method==='POST'&&path==='/account/onboarding'){
        const input=await body(req,30000),profile=validateProfile(input.profile);
        const built=materialize(profile);
        requireValue(!built.audits.some(a=>a.verdict==='BLOCK')&&!built.nutritionAudits.some(a=>a.verdict==='BLOCK'),422,'plan_audit_failed');
        const trace=await makeTrace({kind:'initial-generation',appVersion:'commercial-0.2.0',cycleNumber:1,input:profile,output:built.plan,
          deterministic:{audits:built.audits,nutritionAudits:built.nutritionAudits},reviewers:[],decision:built.plan.reviewRouting.ownerReviewRequired?'REVIEW':'PASS',authority:'DETERMINISTIC',notes:['Commercial account; no automatic safety clearance.']});
        store.update(id,data=>{
          requireValue(!data.plan,409,'plan_already_exists');
          data.profile=profile;data.plan=built.plan;data.state=cycleState();data.monthID=randomUUID();
          data.state.traceLab=[trace];
          // Review is durable account state, never a notification falsely marked as delivered.
          data.ownerReview=built.plan.reviewRouting.ownerReviewRequired?{pending:true,reasons:built.plan.reviewRouting.reasons,createdAt:iso()}:null;
        });
        return response(res,200,{ok:true,month:month(store.load(id))});
      }
      if(method==='GET'&&path==='/account/month')return response(res,200,month(store.load(id)));
      if(path.startsWith('/admin/reviews')){
        requireValue((config.reviewerAccountIDs||[]).includes(id),403,'reviewer_required');
        if(method==='GET'&&path==='/admin/reviews'){
          const rows=store.db.prepare("SELECT id FROM accounts WHERE status='active'").all().map(row=>store.load(row.id))
            .filter(data=>data.ownerReview?.pending).map(data=>({accountID:data.id,name:data.profile.name,review:data.ownerReview}));
          return response(res,200,{reviews:rows});
        }
        const reviewMatch=path.match(/^\/admin\/reviews\/([a-f0-9-]{36})$/i);
        if(method==='POST'&&reviewMatch){
          const input=await body(req,3000);requireValue(input.reviewed===true&&short(input.note,2000)&&input.note.trim().length>0,400,'review_note_required');
          store.update(reviewMatch[1],data=>{
            requireValue(data.ownerReview?.pending,409,'review_not_pending');
            // Acknowledging ordinary limitations cannot clear clinical/no-exercise or allergy restrictions.
            requireValue(!data.plan.trainingHold&&!data.plan.allergyReview,409,'qualified_safety_resolution_required');
            data.ownerReview={...data.ownerReview,pending:false,reviewerID:id,note:input.note,reviewedAt:iso()};
            data.plan.reviewRouting.ownerReviewRequired=false;data.plan.reviewRouting.status='REVIEWED';
            data.plan.training.reviewRequired=false;delete data.pendingProposal;
          });return response(res,200,{ok:true});
        }
      }
      const weekMatch=path.match(/^\/account\/weeks\/([1-4])$/);
      if(method==='GET'&&weekMatch){
        const week=Number(weekMatch[1]);
        const prior=store.load(id);if(prior.state&&week!==freeWeek(prior))await refreshPurchases(id);
        const data=store.load(id);
        assertWeek(store,config,id,data,week,'read');
        const details=content(data,week);
        return response(res,200,{training:details.training.flatMap(t=>t.rows.map(r=>r.title+' — '+r.rx)),meals:details.meals.flatMap(d=>d.rows.map(m=>m.title)),sessions:details.training,sessionDays:data.plan.summary.selectedDays,days:details.meals,completedSessions:data.state.completedSessions,startedAt:data.state.startedAt});
      }
      if(method==='GET'&&path==='/account/report'){
        const data=store.load(id);requireValue(data.plan,409,'onboarding_required');
        const pdf=buildReport(data,archiveFor(data,store.key));
        res.writeHead(200,{'Content-Type':'application/pdf','Cache-Control':'no-store','Content-Disposition':'attachment; filename="Hercules-month.pdf"','X-Content-Type-Options':'nosniff'});return res.end(pdf);
      }
      if(method==='POST'&&path==='/account/restore'){
        const input=await body(req,900000),backup=readArchive(input.archive,id,store.key),profile=validateProfile(backup.profile);
        store.update(id,data=>{
          // Existing authoritative state wins. A portable report cannot clear new safety flags or rewind a cycle.
          if(data.plan)return;
          const restored=structuredClone(backup);requireValue(integer(restored.state.cycleNumber,1,600),400,'backup_invalid');
          data.profile=profile;data.plan=restored.plan;data.state=restored.state;data.monthID=restored.monthID;
          delete data.state.proposals;
          data.ownerReview=data.plan.reviewRouting?.ownerReviewRequired?{pending:true,reasons:data.plan.reviewRouting.reasons,createdAt:iso()}:null;
        });
        return response(res,200,{ok:true});
      }
      if(method==='POST'&&path==='/account/next-month/propose'){
        requireValue(store.quota(id,'next-month',8,86400000),429,'rate_limit');
        const data=store.load(id);requireValue(data.plan,409,'onboarding_required');
        let proposal;try{proposal=await proposeNextMonth(id,data.profile,data.plan,data.state);}catch{throw new HTTPError(409,'next_month_not_eligible');}
        const proposalID=randomUUID();
        store.update(id,current=>{current.pendingProposal={id:proposalID,proposal};},data.revision);
        return response(res,200,{proposalID,requiresReview:proposal.requiresReview,trainingAction:proposal.delta.trainingAction,nutritionAction:proposal.delta.nutritionAction,
          recoveryAction:proposal.delta.recoveryAction,summary:proposal.nextPlan.training.progression.join('\n')+'\n'+proposal.nextPlan.nutrition.adaptationNote});
      }
      if(method==='POST'&&path==='/account/next-month/approve'){
        const input=await body(req,2000),data=store.load(id),pending=data.pendingProposal;
        requireValue(input.approveDiet===true&&input.approveCalendar===true,400,'explicit_approval_required');
        requireValue(pending&&pending.id===input.proposalID,409,'proposal_missing');
        let plan;try{plan=await approveNextMonth(pending.proposal,{accountID:id,profile:data.profile,plan:data.plan,state:data.state},async()=>true);}
        catch{throw new HTTPError(409,'proposal_stale_or_review_required');}
        store.update(id,current=>{
          requireValue(current.pendingProposal?.id===input.proposalID,409,'proposal_consumed');
          const history={cycleNumber:current.state.cycleNumber,startedAt:current.state.startedAt,endedAt:iso(),checkins:current.state.checkins.length,
            completedSessions:Object.values(current.state.completedSessions).filter(Boolean).length,baseline:current.state.baseline,checkpoint:current.state.checkpoint,finalMark:current.state.finalMark};
          const next=cycleState();next.cycleNumber=current.state.cycleNumber+1;next.cycleHistory=[...(current.state.cycleHistory||[]),history].slice(-120);
          if(current.state.finalMark&&current.profile.targetWeight)next.baseline={...current.state.finalMark,ts:iso(),targetWeight:current.profile.targetWeight};
          current.state=next;current.plan=plan;current.monthID=randomUUID();delete current.pendingProposal;
        },data.revision);
        return response(res,200,{ok:true,month:month(store.load(id))});
      }
      const writes=new Set(['/account/checkins','/account/milestones','/account/sessions','/account/meals','/account/post-workout']);
      if(method==='POST'&&writes.has(path)){
        const input=await body(req);const prior=store.load(id);
        if(prior.state&&input.week!==freeWeek(prior))await refreshPurchases(id);
        store.update(id,data=>{
          const week=input.week;assertWeek(store,config,id,data,week,path==='/account/sessions'?'training':'write');
          if(path==='/account/checkins'){
            requireValue(integer(input.energy,1,5)&&integer(input.sleep,1,5),400,'checkin_invalid');
            for(const key of ['training','nutrition'])requireValue(input[key]===undefined||input[key]===null||integer(input[key],1,5),400,'checkin_invalid');
            requireValue(short(input.note??'',1200),400,'note_invalid');
            for(const key of ['painFlag','redFlagSymptom'])requireValue(input[key]===undefined||typeof input[key]==='boolean',400,'checkin_invalid');
            const checkin={ts:iso(),dayKey:iso().slice(0,10),energy:input.energy,sleep:input.sleep,painFlag:input.painFlag===true,
              redFlagSymptom:input.redFlagSymptom===true,note:input.note||''};
            requireValue(input.activityMinutes===undefined||input.activityMinutes===null||integer(input.activityMinutes,0,600),400,'activity_minutes_invalid');
            requireValue(input.activityEffort===undefined||input.activityEffort===null||integer(input.activityEffort,1,10),400,'activity_effort_invalid');
            if(integer(input.activityMinutes,0,600))checkin.activityMinutes=input.activityMinutes;
            if(integer(input.activityEffort,1,10))checkin.activityEffort=input.activityEffort;
            checkin.activityType=data.profile.activityType;
            if(integer(input.training,1,5))checkin.training=input.training;
            if(integer(input.nutrition,1,5))checkin.nutrition=input.nutrition;
            data.state.checkins=[checkin,...data.state.checkins.filter(x=>x.dayKey!==checkin.dayKey)].slice(0,90);
            if(checkin.painFlag||checkin.redFlagSymptom){
              data.plan.reviewRouting={...data.plan.reviewRouting,ownerReviewRequired:true,reasons:[...new Set([...(data.plan.reviewRouting?.reasons||[]),checkin.redFlagSymptom?'TRACK_RED_FLAG':'TRACK_PAIN'])]};
              data.plan.training.reviewRequired=true;
              if(checkin.redFlagSymptom)data.plan.trainingHold=true;
              data.ownerReview={pending:true,reasons:data.plan.reviewRouting.reasons,createdAt:iso()};
            }
          }
          if(path==='/account/milestones'){
            requireValue(['baseline','checkpoint','finalMark'].includes(input.kind)&&short(input.weight,24)&&input.weight.trim().length>0,400,'milestone_invalid');
            requireValue(short(input.waist??'',24),400,'milestone_invalid');
            const mark={ts:iso(),weight:input.weight,waist:input.waist||''};
            if(input.kind==='baseline'){requireValue(data.profile.targetWeight,400,'target_weight_required');mark.targetWeight=data.profile.targetWeight;}
            requireValue(milestoneTimeValid(input.kind,data.state.startedAt,mark),409,'milestone_too_early');
            data.state[input.kind]=mark;
          }
          if(path==='/account/sessions'){
            requireValue(data.plan.training.pattern.includes(input.session),400,'session_invalid');
            data.state.completedSessions['w'+week+':'+input.session]=true;
          }
          if(path==='/account/post-workout'){
            requireValue(data.plan.training.pattern.includes(input.session)&&data.state.completedSessions['w'+week+':'+input.session]===true,409,'session_not_complete');
            requireValue(['water','alignment','breathing'].includes(input.step),400,'post_workout_invalid');
            data.state.postWorkout=[...(data.state.postWorkout||[]),{week,session:input.session,step:input.step,ts:iso()}].slice(-300);
          }
          if(path==='/account/meals'){
            requireValue(integer(input.day,0,6)&&short(input.mealID,100),400,'meal_invalid');
            const details=content(data,week),day=details.meals[input.day],item=day?.rows.find(m=>m.id===input.mealID);
            requireValue(item&&!data.plan.nutrition.reviewRequired,409,'meal_review_or_missing');
            requireValue(['check','replace','photo'].includes(input.action),400,'meal_action_invalid');
            const event={week,day:input.day,mealID:item.id,action:input.action,ts:iso()};
            if(input.action==='replace'){
              const candidates=materialize(data.profile,data.plan,data.state.cycleNumber).weeks.flatMap(w=>w.meals.flatMap(d=>d.rows)).filter(m=>m.role===item.role&&m.id!==item.id);
              requireValue(candidates.length,409,'replacement_unavailable');
              data.state.mealReplacements??={};data.state.mealReplacements[week+':'+input.day+':'+item.role+':'+item.occurrence]={...candidates[0],occurrence:item.occurrence};
              event.replacementID=candidates[0].id;
            }
            if(input.action==='photo'){
              requireValue(input.confirmed===true&&typeof input.image==='string'&&/^[A-Za-z0-9+/]+={0,2}$/.test(input.image)&&input.image.length<250000,400,'photo_confirmation_required');
              const bytes=Buffer.from(input.image,'base64');requireValue(bytes.length>3&&bytes.length<180000&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255,400,'jpeg_required');
              event.photoDigest=(awaitHash(bytes));event.userConfirmed=true;
            }
            data.state.mealEvents=[...(data.state.mealEvents||[]),event].slice(-1000);
          }
          delete data.pendingProposal;
        });
        return response(res,200,{ok:true});
      }
      throw new HTTPError(404,'route_not_found');
    }catch(error){
      // Do not return Apple/provider errors, credentials or raw profile payloads.
      response(res,error instanceof HTTPError?error.status:503,{error:error instanceof HTTPError?error.code:'service_unavailable'});
    }
  };
}
import {hash as awaitHash} from './store.mjs';

