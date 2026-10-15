import {createHmac,timingSafeEqual} from 'node:crypto';
import {requireValue} from './errors.mjs';
const ascii=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7e]/g,'-');
const escape=value=>ascii(value).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
export function archiveFor(account,key){
  const payload=Buffer.from(JSON.stringify({schema:'hercules-commercial-backup-v1',accountID:account.id,exportedAt:new Date().toISOString(),
    profile:account.profile,plan:account.plan,state:account.state,monthID:account.monthID})).toString('base64url');
  const signature=createHmac('sha256',key).update(payload).digest('hex');
  return Buffer.from(JSON.stringify({payload,signature})).toString('base64url');
}
export function readArchive(archive,accountID,key){
  requireValue(typeof archive==='string'&&archive.length<800000,400,'backup_invalid');
  let wrapper,data;try{wrapper=JSON.parse(Buffer.from(archive,'base64url').toString('utf8'));}catch{requireValue(false,400,'backup_invalid');}
  requireValue(typeof wrapper.payload==='string'&&/^[a-f0-9]{64}$/.test(wrapper.signature),400,'backup_invalid');
  const expected=createHmac('sha256',key).update(wrapper.payload).digest();
  requireValue(timingSafeEqual(expected,Buffer.from(wrapper.signature,'hex')),400,'backup_integrity_invalid');
  try{data=JSON.parse(Buffer.from(wrapper.payload,'base64url').toString('utf8'));}catch{requireValue(false,400,'backup_invalid');}
  requireValue(data.schema==='hercules-commercial-backup-v1'&&data.accountID===accountID&&data.state&&data.profile&&data.plan,403,'backup_account_mismatch');
  return data;
}
export function buildReport(account,archive){
  const rows=[
    'HERCULES HUB - Monthly report',account.profile.name,
    'Cycle: '+account.state.cycleNumber,'Started: '+account.state.startedAt,
    'Goal: '+account.plan.summary.goal,'Training location: '+account.plan.summary.location,
    'Sessions completed: '+Object.values(account.state.completedSessions||{}).filter(Boolean).length,
    'Tracked days: '+(account.state.checkins||[]).length,
    'Training safety hold: '+(account.plan.trainingHold?'YES':'NO'),
    'Additional activity: '+account.profile.activityType+' / '+account.profile.activityDays.join(', '),
    ...['baseline','checkpoint','finalMark'].map(key=>key+': '+(account.state[key]?.weight||'UNKNOWN')),
    ...(account.plan.training.progression||[]),
    'Recovery: sleep '+account.profile.sleep+'; stress '+account.profile.stress,
    'This is a private progress report. Missing data remains UNKNOWN.',
    'Recovery payload is account-bound. It contains no credentials or subscription entitlement.'
  ];
  const pages=[];for(let i=0;i<rows.length;i+=40)pages.push(rows.slice(i,i+40));
  const objects=[];const add=s=>{objects.push(s);return objects.length;};
  add('<< /Type /Catalog /Pages 2 0 R >>');add('');add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const kids=[];
  for(const lines of pages){
    const content='BT /F1 11 Tf 45 790 Td 16 TL '+lines.map((line,i)=>(i?'T* ':'')+'('+escape(line).slice(0,450)+') Tj').join('\n')+' ET';
    const stream=add('<< /Length '+Buffer.byteLength(content)+' >>\nstream\n'+content+'\nendstream');
    const page=add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents '+stream+' 0 R >>');
    kids.push(page+' 0 R');
  }
  objects[1]='<< /Type /Pages /Count '+kids.length+' /Kids ['+kids.join(' ')+'] >>';
  let pdf='%PDF-1.4\n',offsets=[0];
  objects.forEach((obj,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=(i+1)+' 0 obj\n'+obj+'\nendobj\n';});
  const xref=Buffer.byteLength(pdf);
  pdf+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('');
  pdf+='trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n%%HERCULES_BACKUP '+archive+'\n';
  return Buffer.from(pdf);
}

