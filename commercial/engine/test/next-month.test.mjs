import assert from 'node:assert/strict';
import test from 'node:test';
import {proposeNextMonth, approveNextMonth} from '../src/next-month.mts';
import {safetyRouting} from '../upstream/netlify/functions/safety-lib.mts';
import {clampDelta, dedupeSessionCompletions} from '../upstream/netlify/functions/cycle-lib.mts';

const now = Date.UTC(2026, 9, 14, 12), iso = days => new Date(now - days*86400000).toISOString();
function records() {
  return {
    accountID: 'account-1',
    profile: {level:'intermediate',minutes:'60',mealPrepPreference:'mixed'},
    plan: {version:'0.14.1',risk:'green',trainingHold:false,
      training:{pattern:['fullA','fullB'],sets:2,reviewRequired:false},
      nutrition:{},recover:{},mind:{},evolve:{safetyReleaseAutomatic:false}},
    state: {startedAt:iso(30),cycleNumber:1,
      completedSessions:Object.fromEntries([1,2,3,4].flatMap(w=>['fullA','fullB'].map(p=>[`w${w}:gym:${p}`,true]))),
      checkins:Array.from({length:14},(_,i)=>({ts:iso(i+1),energy:4,sleep:4,training:4,nutrition:4})),
      baseline:{ts:iso(30),weight:'80',targetWeight:'78'},
      checkpoint:{ts:iso(14),weight:'79'},finalMark:{ts:iso(1),weight:'78'}}
  };
}
const proposal = r => proposeNextMonth(r.accountID,r.profile,r.plan,r.state,now);

test('commercial adaptation always requires explicit consent',async()=>{
  const r=records(), p=await proposal(r);
  assert.equal(p.userApprovalRequired,true);
  assert.equal(p.nextPlan.evolve.materialChangesAutomatic,false);
  assert.equal(p.nextPlan.evolve.safetyReleaseAutomatic,false);
  await assert.rejects(approveNextMonth(p,r,async()=>false,now),/explicit_user_approval_required/);
  const next=await approveNextMonth(p,r,async()=>true,now);
  assert.equal(next.adaptation.cycle,2);
});
test('account mismatch, stale evidence, tampered plans and expired proposals are rejected',async()=>{
  const r=records(),p=await proposal(r), consent=async()=>true;
  await assert.rejects(approveNextMonth(p,{...r,accountID:'other'},consent,now),/account_mismatch/);
  const stale=structuredClone(r);stale.state.checkins[0].energy=1;
  await assert.rejects(approveNextMonth(p,stale,consent,now),/proposal_stale/);
  const tampered=structuredClone(p);tampered.nextPlan.training.sets=99;
  await assert.rejects(approveNextMonth(tampered,r,consent,now),/proposal_tampered/);
  await assert.rejects(approveNextMonth(p,r,consent,now+86400001),/proposal_expired/);
});
test('payment or user consent cannot clear a training safety hold or pending owner review',async()=>{
  for(const kind of ['hold','review','symptom']){
    const r=records();
    if(kind==='hold')r.plan.trainingHold=true;
    if(kind==='review')r.plan.reviewRouting={ownerReviewRequired:true};
    if(kind==='symptom')r.state.checkins[0].redFlagSymptom=true;
    const p=await proposal(r);
    assert.equal(p.requiresReview,true);
    await assert.rejects(approveNextMonth(p,r,async()=>true,now),/owner_review_required/);
  }
});
test('eligibility retains elapsed-day, completed final week and final-mark gates',async()=>{
  for(const alter of [
    r=>r.state.startedAt=iso(20),
    r=>r.state.completedSessions={},
    r=>r.state.finalMark=null,
    r=>r.state.finalMark.ts=iso(4)
  ]){
    const r=records();alter(r);
    await assert.rejects(proposal(r),/next_month_not_eligible/);
  }
});
test('missing tracking stays unknown and cannot authorize progression',async()=>{
  const r=records();r.state.checkins=[];
  const p=await proposal(r);
  assert.notEqual(p.delta.trainingAction,'progress');
  assert.ok(p.delta.unknowns.includes('daily_tracking'));
});
test('beta safety routing and AI ceilings remain intact',()=>{
  assert.equal(safetyRouting({currentPain:'yes'}).trainingRestricted,false);
  assert.equal(safetyRouting({redFlags:'yes'}).trainingRestricted,true);
  const base={trainingAction:'hold',nutritionAction:'maintain',recoveryAction:'prioritize',mindAction:'maintain',evidence:['real'],unknowns:[]};
  const bounded=clampDelta({trainingAction:'progress',evidence:['invented']},base);
  assert.equal(bounded.trainingAction,'hold');assert.deepEqual(bounded.evidence,['real']);
  assert.deepEqual(dedupeSessionCompletions({'w1:gym:fullA':true,'w1:home:fullA':true}),{'w1:fullA':true});
});

