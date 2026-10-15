import {requireValue} from './errors.mjs';
const enums={
 language:['pt-BR','en-US','es'],primaryGoal:['build_muscle','general_fitness','fat_loss','consistency','strength'],
 level:['beginner','intermediate','advanced'],location:['gym','home','both'],minutes:['20','30','45','60'],
 units:['metric','imperial'],meals:['2','3','4','5'],cooking:['minimal','basic','comfortable'],
 mealPrepPreference:['mixed','fresh_daily','batch_cook'],eatOutFrequency:['rare','1-2_week','3plus_week'],
 sleep:['<5','5','6','7','8','9+'],stress:['1','2','3','4','5'],currentPain:['yes','no'],
 redFlags:['yes','no'],professionalRestrictions:['yes','no'],
 professionalRestrictionScope:['','avoid_specific','no_exercise','other_guidance'],
 activityType:['none','swimming','soccer','running','cycling','walking','yoga','dancing','other']
};
const texts={name:60,preferredTime:120,height:12,weight:12,targetWeight:12,foodPreferences:1200,dislikes:1200,allergies:1200,safetyDetails:2000,activityOther:80};
const lists={days:7,activityDays:7,proteinPreferences:16,grainPreferences:16,veggiePreferences:16,foodStyles:12,painAreas:10};
const weekdays=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const pain=['shoulder','elbow','wrist_hand','neck','upper_back','low_back','hip','knee','ankle_foot','other'];
export function validateProfile(input){
  requireValue(input&&typeof input==='object'&&!Array.isArray(input),400,'profile_invalid');
  const allowed=new Set([...Object.keys(enums),...Object.keys(texts),...Object.keys(lists),'openToOtherVeggies','accuracy','prototypeAck']);
  requireValue(Object.keys(input).every(k=>allowed.has(k)),400,'profile_unknown_field');
  const result={units:'metric',activityType:'none',professionalRestrictionScope:'',openToOtherVeggies:true,...input};
  for(const [key,values] of Object.entries(enums))requireValue(values.includes(result[key]),400,'profile_'+key);
  for(const [key,max] of Object.entries(texts)){
    result[key]=result[key]??'';requireValue(typeof result[key]==='string'&&result[key].length<=max,400,'profile_'+key);
    result[key]=result[key].trim();
  }
  requireValue(result.name.length>0,400,'profile_name');
  for(const [key,max] of Object.entries(lists)){
    result[key]=result[key]??[];const rows=result[key];
    requireValue(Array.isArray(rows)&&rows.length<=max&&rows.every(x=>typeof x==='string'&&x.length>0&&x.length<=80)&&new Set(rows).size===rows.length,400,'profile_'+key);
  }
  requireValue(result.days.length>=2&&result.days.every(d=>weekdays.includes(d))&&result.activityDays.every(d=>weekdays.includes(d))&&result.painAreas.every(d=>pain.includes(d)),400,'profile_days_or_pain');
  requireValue(typeof result.openToOtherVeggies==='boolean'&&result.accuracy===true&&result.prototypeAck===true,400,'profile_acknowledgement_required');
  if(result.professionalRestrictions==='yes')requireValue(result.professionalRestrictionScope!=='',400,'professional_scope_required');
  if(result.activityType==='other')requireValue(result.activityOther.length>0,400,'activity_description_required');
  return result;
}

