import {closedPayrollMonths} from '../payroll/draft-state';
import {LeaveStateError,readLeaveState,persistLeaveState,openingLink} from './opening';
import {randomUUID,createHash} from 'node:crypto';
import type {Pool} from 'pg';
import {z} from 'zod';
import {ok,fail,type Actor,type AuditContext,type Result} from '../../core/contracts';
import {withTransaction,appendAudit,type DbTx} from '../../server/db';
import {countLeaveUnits,parseDate} from '../calendar';
import {singaporeCalendar} from '../calendar/verified';
import {allocateLeave,type LeaveSlot,type LedgerInput} from './ledger';
import {leaveSchema,profileSchema,exceptionSchema,type LeaveInput} from './types';
class Refusal extends Error {constructor(public code:string,message:string,public fields?:Record<string,string>){super(message);}}
const refuse=(code:string,message:string,fields?:Record<string,string>):never=>{throw new Refusal(code,message,fields);};
const fingerprint=(input:unknown)=>createHash('sha256').update(JSON.stringify(input)).digest('hex');
const own=(actor:Actor,id:string)=>{if(actor.role!=='admin'&&actor.employeeId!==id)refuse('FORBIDDEN','Access denied');};
const admin=(actor:Actor)=>{if(actor.role!=='admin')refuse('FORBIDDEN','Administrator required');};
export function createLeaveService(pool:Pool,clock:()=>string=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Singapore'})) {
 async function guarded<T>(fn:()=>Promise<Result<T>>):Promise<Result<T>> {try{return await fn();}catch(e){if(e instanceof Refusal||e instanceof LeaveStateError)return fail(e.code,e.message,e.fields);throw e;}}
 async function lock(tx:DbTx,id:string){if(!z.uuid().safeParse(id).success)refuse('INPUT','Invalid employee');if(!(await tx.query('SELECT id FROM employee WHERE id=$1 AND active=true FOR UPDATE',[id])).rowCount)refuse('FORBIDDEN','Employee unavailable');}
 async function profile(tx:DbTx,id:string){const {rows:[p]}=await tx.query('SELECT input FROM leave_profile WHERE employee_id=$1',[id]);if(!p)refuse('PROFILE_REQUIRED','Set up the one-time leave opening before requesting leave',{employeeId:id,actionHref:openingLink(id)});return profileSchema.parse(p.input);}
 async function grants(tx:DbTx,id:string){if((await tx.query("SELECT 1 FROM environment_identity WHERE id=1 AND environment='actual-test'")).rowCount&&!(await tx.query('SELECT 1 FROM leave_opening WHERE employee_id=$1',[id])).rowCount)refuse('OPENING_REQUIRED','Accept the one-time leave opening first',{employeeId:id,actionHref:openingLink(id)});if((await tx.query('SELECT 1 FROM leave_opening WHERE employee_id=$1 LIMIT 1',[id])).rowCount)return;await profile(tx,id);const year=Number(clock().slice(0,4));for(const y of [year,year+1])await tx.query("INSERT INTO leave_grant VALUES($1,$2,28,$3) ON CONFLICT(employee_id,vintage) DO UPDATE SET status=CASE WHEN leave_grant.vintage<=$4 THEN 'active' ELSE leave_grant.status END",[id,y,y===year?'active':'projected',year]);}
 async function slotsFor(tx:DbTx,id:string,range:LeaveInput['range']) {
  const p=await profile(tx,id),today=clock(),opening=(await tx.query('SELECT input FROM leave_opening WHERE employee_id=$1 ORDER BY revision DESC LIMIT 1',[id])).rows[0];parseDate(today);const start=parseDate(range.start),end=parseDate(range.end);
  if(end<start||end.getTime()-start.getTime()>732*86400000||Number(range.end.slice(0,4))>Number(today.slice(0,4))+1)refuse('RANGE_UNSUPPORTED','Range is outside the verified booking horizon');
  const employment=(await tx.query("SELECT max(input->'reviewed'->'employee'->>'employmentStart') AS start FROM payroll_profile WHERE employee_id=$1",[id])).rows[0]?.start;if(range.start<p.eligibleSince||employment&&range.start<employment)refuse('EMPLOYMENT_DATE','Leave cannot predate verified employment/leave eligibility');
  const calendars=[];for(let year=start.getUTCFullYear();year<=end.getUTCFullYear();year++){const c=singaporeCalendar(year,p);if(!c.ok)refuse(c.code,c.message);else calendars.push(c.value);}
  const counted=countLeaveUnits(range,calendars);if(!counted.ok)refuse(counted.code,counted.message);
  const slots:LeaveSlot[]=[];
  for(let d=start;d<=end;d=new Date(d.getTime()+86400000)){const date=d.toISOString().slice(0,10);const parts:('am'|'pm')[]=range.start===range.end?(range.startPart==='full'?['am','pm']:[range.startPart]):date===range.start&&range.startPart==='pm'?['pm']:date===range.end&&range.endPart==='am'?['am']:['am','pm'];
   const count=countLeaveUnits({start:date,end:date,startPart:'full',endPart:'full'},calendars);if(!count.ok)refuse(count.code,count.message);else if(count.value)for(const part of parts)slots.push({date,part});
  }
  if(!slots.length)refuse('EMPTY_LEAVE','No working half-days in this range');return slots;
 }
 async function ledger(tx:DbTx,id:string,extra?:any){
  const state=await readLeaveState(tx,id,clock(),extra);if(state)return state;
  const {rows:requests}=await tx.query('SELECT id,kind,state,slots FROM leave_request WHERE employee_id=$1',[id]);
  const {rows:buckets}=await tx.query('SELECT vintage AS year,units FROM leave_grant WHERE employee_id=$1',[id]);
  const {rows:history}=await tx.query(`SELECT a.request_id AS "requestId",a.date,a.part,a.vintage AS year FROM leave_allocation a JOIN leave_request r ON r.id=a.request_id WHERE a.employee_id=$1 AND a.date<$2 AND r.state='approved' ORDER BY a.date,a.part`,[id,clock()]);
  const result=allocateLeave({today:clock(),withMedical:true,buckets,history,requests:extra?[...requests,extra]:requests});if(!result.ok)refuse(result.code,result.message);return result.ok?result.value:refuse('INTERNAL','Allocation failed');
 }
 async function saveLedger(tx:DbTx,id:string){const result=await ledger(tx,id);if(result.coverageStart){await persistLeaveState(tx,id,result);return result;}await tx.query('DELETE FROM leave_allocation WHERE employee_id=$1',[id]);for(const a of result.allocations)await tx.query('INSERT INTO leave_allocation VALUES($1,$2,$3,$4,$5)',[id,a.requestId,a.date,a.part,a.year]);return result;}
 const configureProfile=(context:AuditContext,input:unknown)=>guarded(()=>withTransaction(pool,async tx=>{
  admin(context.actor);if((await tx.query("SELECT 1 FROM environment_identity WHERE id=1 AND environment='actual-test'")).rowCount)refuse('OPENING_REQUIRED','Use the one-time leave opening review');const p=profileSchema.safeParse(input);if(!p.success)refuse('PROFILE_UNSUPPORTED','Only verified continuing Monday–Friday employees are supported');const value=p.data!;
  if(value.eligibleSince>clock().slice(0,4)+'-01-01')refuse('PROFILE_UNSUPPORTED','New starters and partial-year eligibility require review');await lock(tx,value.employeeId);
  const existing=await tx.query('SELECT 1 FROM leave_profile WHERE employee_id=$1',[value.employeeId]);if(existing.rowCount)refuse('PROFILE_LOCKED','Existing profile changes require a reviewed correction');
  await tx.query('INSERT INTO leave_profile VALUES($1,$2,$3)',[value.employeeId,value,context.actor.userId]);await grants(tx,value.employeeId);await appendAudit(tx,{context,action:'leave.profile-verified',entityId:value.employeeId});return ok(undefined);
 }));
 async function validateOrdinary(tx:DbTx,actor:Actor,input:unknown,excludeId?:string){const parsed=leaveSchema.safeParse(input);if(!parsed.success)refuse('INPUT','Invalid leave input');const data=parsed.data!;own(actor,data.employeeId);if(['sick','hospitalisation'].includes(data.type)){const o=(await tx.query('SELECT input FROM leave_opening WHERE employee_id=$1 ORDER BY revision DESC LIMIT 1',[data.employeeId])).rows[0]?.input;if(o&&data.range.end>=o.effectiveDate&&(o.sickRemainingUnits===null||o.combinedRemainingUnits===null))refuse('MEDICAL_SETUP_REQUIRED','Enter the medical balances before requesting medical leave',{employeeId:data.employeeId,actionHref:openingLink(data.employeeId)});}await lock(tx,data.employeeId);await grants(tx,data.employeeId);
  if(data.attachmentIds.length){if(!['sick','hospitalisation'].includes(data.type)||new Set(data.attachmentIds).size!==data.attachmentIds.length)refuse('ATTACHMENT_UNAVAILABLE','Only own medical files may be attached to medical leave');const files=await tx.query('SELECT id FROM medical_file WHERE employee_id=$1 AND id=ANY($2::uuid[])',[data.employeeId,data.attachmentIds]);if(files.rowCount!==data.attachmentIds.length)refuse('ATTACHMENT_UNAVAILABLE','Medical file unavailable for this employee');}
  const slots=await slotsFor(tx,data.employeeId,data.range);const opening=(await tx.query('SELECT input FROM leave_opening WHERE employee_id=$1 ORDER BY revision DESC LIMIT 1',[data.employeeId])).rows[0]?.input;const active=(await tx.query("SELECT slots FROM leave_request WHERE employee_id=$1 AND state IN ('pending','approved') AND ($2::uuid IS NULL OR id<>$2)",[data.employeeId,excludeId??null])).rows;if(active.some(r=>(r.slots as LeaveSlot[]).some(s=>slots.some(v=>v.date===s.date&&v.part===s.part))))refuse('LEAVE_OVERLAP','An active request already covers this half-day');if(data.type==='annual'){const known=(await tx.query('SELECT vintage FROM leave_grant WHERE employee_id=$1',[data.employeeId])).rows.map(r=>r.vintage);if(slots.filter(s=>!opening||s.date>=opening.effectiveDate).some(s=>!known.some(y=>y<=Number(s.date.slice(0,4))&&Number(s.date.slice(0,4))<=y+1)))refuse('HISTORICAL_BALANCE_REQUIRED','Reviewed historical grants and used leave are required; no old balance is assumed');}
  return {data,slots};
 }
 const previewLeave=(actor:Actor,input:unknown)=>guarded(()=>withTransaction(pool,async tx=>{const {data,slots}=await validateOrdinary(tx,actor,input);const result=await ledger(tx,data.employeeId,{id:'preview',kind:data.type,state:'pending',slots});const year=Number(data.range.end.slice(0,4));return ok({countedUnits:slots.length,reservedUnits:slots.length,remainingUnits:data.type==='sick'?Math.min(result.medicalRemaining?.[year]?.sick??28,result.medicalRemaining?.[year]?.combined??120):data.type==='hospitalisation'?(result.medicalRemaining?.[year]?.combined??120):data.type==='unpaid'?undefined:Object.entries(result.remaining).filter(([y])=>Number(y)<=year&&year<=Number(y)+1).reduce((n,[,v])=>n+Number(v),0),allocations:result.allocations.filter((a:any)=>a.requestId==='preview')});}));
 async function existing(tx:DbTx,context:AuditContext,data:unknown){const {rows:[r]}=await tx.query('SELECT id,input_hash FROM leave_request WHERE actor_id=$1 AND request_key=$2',[context.actor.userId,context.requestId]);if(r&&r.input_hash!==fingerprint(data))refuse('IDEMPOTENCY_CONFLICT','Retry payload changed');return r?.id as string|undefined;}
 const submitLeave=(context:AuditContext,input:unknown)=>guarded(()=>withTransaction(pool,async tx=>{
  const parsed=leaveSchema.safeParse(input);if(!parsed.success)refuse('INPUT','Invalid leave input');const data=parsed.data!;own(context.actor,data.employeeId);await lock(tx,data.employeeId);
  const previous=await existing(tx,context,data);if(previous)return ok(previous);
  const {slots}=await validateOrdinary(tx,context.actor,data),id=randomUUID();await tx.query("INSERT INTO leave_request(id,employee_id,actor_id,request_key,input_hash,input,kind,state,slots) VALUES($1,$2,$3,$4,$5,$6,$7,'pending',$8)",[id,data.employeeId,context.actor.userId,context.requestId,fingerprint(data),data,data.type,JSON.stringify(slots)]);await saveLedger(tx,data.employeeId);await appendAudit(tx,{context,action:'leave.submit',entityId:id});return ok(id);
 }));
 async function hold(tx:DbTx,id:string,months:string[],context:AuditContext,reason:string,payload:unknown,source?:{id:string;revision:number;proposal:unknown;snapshot:unknown}){
  const periods=[...new Set(months)].sort();if(!periods.length)return;
  const hash=fingerprint({actor:context.actor.userId,reason,periods,payload,source});
  const {rows:[command]}=await tx.query('SELECT fingerprint FROM leave_hold_command WHERE employee_id=$1 AND request_key=$2',[id,context.requestId]);
  if(command){if(command.fingerprint!==hash)refuse('IDEMPOTENCY_CONFLICT','Hold request key belongs to another command');return;}
  if((await tx.query('SELECT 1 FROM leave_payroll_hold WHERE employee_id=$1 AND request_key=$2',[id,context.requestId])).rowCount)refuse('IDEMPOTENCY_CONFLICT','Legacy hold key cannot be reused');
  await tx.query('INSERT INTO leave_hold_command VALUES($1,$2,$3)',[id,context.requestId,hash]);
  for(const month of periods)await tx.query('INSERT INTO leave_payroll_hold(employee_id,month,request_key,reason,mode,source_request_id,source_revision,proposal,source_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,month,context.requestId,reason,source?'retain-original-only':'correction-required',source?.id??null,source?.revision??null,source?.proposal??null,source?.snapshot??null]);
 }
 const snapshot=(r:any)=>({input:r.input,kind:r.kind,state:r.state,slots:r.slots});
 const decideLeave=(context:AuditContext,id:string,decisionInput:unknown,expectedRevision:number)=>guarded(()=>withTransaction(pool,async tx=>{
  const parsedDecision=z.enum(['approve','reject','cancel']).safeParse(decisionInput);
  if(!z.uuid().safeParse(id).success||!parsedDecision.success||!Number.isSafeInteger(expectedRevision))refuse('INPUT','Invalid decision');
  const decision=parsedDecision.data!;
  const {rows:[r]}=await tx.query('SELECT * FROM leave_request WHERE id=$1',[id]);if(!r)refuse('NOT_FOUND','Leave not found');own(context.actor,r.employee_id);if(decision!=='cancel')admin(context.actor);await lock(tx,r.employee_id);
  const {rows:[current]}=await tx.query('SELECT * FROM leave_request WHERE id=$1',[id]);if(current.revision!==expectedRevision)refuse('REVISION_CONFLICT','Request changed; refresh before deciding');
  if(!['pending','approved'].includes(current.state)||(decision!=='cancel'&&current.state!=='pending'))refuse('STATE_CONFLICT','Invalid transition');
  const slots=current.slots as LeaveSlot[];
  if(current.state==='approved'&&slots.some(s=>s.date<clock())){await hold(tx,r.employee_id,slots.map(s=>s.date.slice(0,7)),context,'Historical leave change requires reviewed correction',{id,decision},{id,revision:current.revision,proposal:{decision},snapshot:snapshot(current)});await appendAudit(tx,{context,action:'leave.correction-held',entityId:id});return fail('HISTORICAL_REVIEW_REQUIRED','Historical request preserved; correction review required');}
  if(decision==='approve'){await slotsFor(tx,r.employee_id,current.input.range);}
  await tx.query('UPDATE leave_request SET state=$2,revision=revision+1 WHERE id=$1',[id,decision==='approve'?'approved':decision==='reject'?'rejected':'cancelled']);await saveLedger(tx,r.employee_id);
  if(decision==='approve'&&slots.some(s=>s.date<clock())){const locked=await closedPayrollMonths(tx,r.employee_id);await hold(tx,r.employee_id,slots.map(s=>s.date.slice(0,7)).filter(m=>locked.some(x=>x.month===m)),context,'Backdated leave approved in locked payroll period',{id,decision,expectedRevision});}
  if(!slots.some(s=>s.date<clock())&&['unpaid','exceptional-unpaid'].includes(current.kind)&&(decision==='approve'||current.state==='approved')){const closed=await closedPayrollMonths(tx,r.employee_id);await hold(tx,r.employee_id,slots.map(s=>s.date.slice(0,7)).filter(m=>closed.some(c=>c.month===m)),context,'Unpaid leave changed after settlement',{id,decision,expectedRevision});}
  await appendAudit(tx,{context,action:'leave.'+(context.actor.employeeId===r.employee_id&&decision==='approve'?'self-approve':decision),entityId:id});return ok(undefined);
 }));
 const list=(actor:Actor,id:string)=>guarded(()=>withTransaction(pool,async tx=>{own(actor,id);await lock(tx,id);await grants(tx,id);const result=await ledger(tx,id);const {rows:requests}=await tx.query(`SELECT r.id,r.input,r.kind,r.state,r.revision,r.slots,r.submitted_at,r.origin,r.source_key,json_build_object('id',e.id,'name',coalesce(nullif((SELECT p.personal->>'Display name' FROM employee_profile_revision p WHERE p.employee_id=e.id ORDER BY p.created_at DESC,p.id DESC LIMIT 1),''),u.name),'email',u.email) AS requester FROM leave_request r JOIN employee e ON e.id=r.employee_id JOIN \"user\" u ON u.id=e.user_id WHERE r.employee_id=$1 ORDER BY r.id`,[id]);return ok({asOf:clock(),requests,allocations:result.allocations,remaining:result.remaining,...(result.medicalRemaining?{medicalRemaining:result.medicalRemaining}:{}),...(result.coverageStart?{coverageStart:result.coverageStart}:{})});}));
 const recordExceptionalLeave=(context:AuditContext,input:unknown)=>guarded(()=>withTransaction(pool,async tx=>{
  admin(context.actor);const parsed=exceptionSchema.safeParse(input);if(!parsed.success)refuse('INPUT','Invalid exceptional leave');const data=parsed.data!;await lock(tx,data.employeeId);await grants(tx,data.employeeId);const slots=await slotsFor(tx,data.employeeId,data.range);
  if(!data.evidenceId||data.verifiedBy!==context.actor.userId||data.verifiedAt>clock()){
   await hold(tx,data.employeeId,slots.map(s=>s.date.slice(0,7)),context,'Exceptional leave treatment unverified',data);await appendAudit(tx,{context,action:'leave.exception-held',entityId:data.employeeId});return fail('EXCEPTION_REVIEW_REQUIRED','Payroll held until exceptional treatment is verified');
  }
  const previous=await existing(tx,context,data);if(previous)return ok(previous);const id=randomUUID();await tx.query("INSERT INTO leave_request(id,employee_id,actor_id,request_key,input_hash,input,kind,state,slots) VALUES($1,$2,$3,$4,$5,$6,$7,'approved',$8)",[id,data.employeeId,context.actor.userId,context.requestId,fingerprint(data),data,'exceptional-'+data.paidTreatment,JSON.stringify(slots)]);await saveLedger(tx,data.employeeId);
  const closed=await closedPayrollMonths(tx,data.employeeId);await hold(tx,data.employeeId,slots.map(s=>s.date.slice(0,7)).filter(m=>closed.some(c=>c.month===m)),context,'Exceptional leave touches settled period',data);await appendAudit(tx,{context,action:'leave.exception-verified',entityId:id});return ok(id);
 }));
 const unpaidUnits=(id:string,month:string)=>guarded(()=>withTransaction(pool,async tx=>{if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))refuse('INPUT','Invalid month');await lock(tx,id);await profile(tx,id);if((await tx.query('SELECT 1 FROM leave_payroll_hold WHERE employee_id=$1 AND month=$2 AND resolved_at IS NULL',[id,month])).rowCount)refuse('PAYROLL_REVIEW_REQUIRED','Unresolved leave treatment or settlement correction');const {rows}=await tx.query("SELECT slots FROM leave_request WHERE employee_id=$1 AND state='approved' AND kind IN ('unpaid','exceptional-unpaid')",[id]);return ok(rows.reduce((n,r)=>n+(r.slots as LeaveSlot[]).filter(s=>s.date.startsWith(month+'-')).length,0));}));
 const amendLeave=(context:AuditContext,id:string,input:unknown,revision:number)=>guarded(()=>withTransaction(pool,async tx=>{
  if(!z.uuid().safeParse(id).success||!Number.isSafeInteger(revision))refuse('INPUT','Invalid revision');
  const parsed=leaveSchema.safeParse(input);if(!parsed.success)refuse('INPUT','Invalid leave input');const data=parsed.data!;
  own(context.actor,data.employeeId);await lock(tx,data.employeeId);
  const {rows:[r]}=await tx.query('SELECT * FROM leave_request WHERE id=$1 AND employee_id=$2',[id,data.employeeId]);
  if(!r)refuse('NOT_FOUND','Leave not found');if(r.revision!==revision)refuse('REVISION_CONFLICT','Request changed');
  if(!['pending','approved'].includes(r.state)||r.kind.startsWith('exceptional'))refuse('STATE_CONFLICT','Request cannot be amended');
  const start=parseDate(data.range.start),end=parseDate(data.range.end);
  if(end<start||end.getTime()-start.getTime()>732*86400000)refuse('INPUT','Invalid amendment range');
  if(data.range.start<clock()||(r.slots as LeaveSlot[]).some(s=>s.date<clock())){
   const months=(r.slots as LeaveSlot[]).map(s=>s.date.slice(0,7));
   for(let d=new Date(data.range.start.slice(0,7)+'-01T00:00:00Z');d<=end;d.setUTCMonth(d.getUTCMonth()+1))months.push(d.toISOString().slice(0,7));
   await hold(tx,data.employeeId,months,context,'Historical amendment requires reviewed correction',{id,input:data},{id,revision:r.revision,proposal:{input:data},snapshot:snapshot(r)});
   await appendAudit(tx,{context,action:'leave.correction-held',entityId:id});
   return fail('HISTORICAL_REVIEW_REQUIRED','Historical request preserved; affected payroll periods held for correction review');
  }
  const {slots}=await validateOrdinary(tx,context.actor,data,id);
  await tx.query("UPDATE leave_request SET input=$2,kind=$3,slots=$4,state='pending',revision=revision+1 WHERE id=$1",[id,data,data.type,JSON.stringify(slots)]);await saveLedger(tx,data.employeeId);
  if(r.state==='approved'&&r.kind==='unpaid'){const closed=await closedPayrollMonths(tx,data.employeeId);await hold(tx,data.employeeId,(r.slots as LeaveSlot[]).map(s=>s.date.slice(0,7)).filter(m=>closed.some(c=>c.month===m)),context,'Approved unpaid leave amended after settlement',{id,input:data,revision});}
  await appendAudit(tx,{context,action:'leave.amend-reapproval-required',entityId:id});return ok(undefined);
 }));
 return {configureProfile,previewLeave,submitLeave,decideLeave,list,recordExceptionalLeave,unpaidUnits,amendLeave};
}
