import {freezeBranding} from '../branding/service';
import {reviewedPaidData,reviewedCorrectionData} from '../payroll/reviewed';
import {createHash,randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {z} from 'zod';
import {ok,fail,type Actor,type AuditContext} from '../../core/contracts';
import {withTransaction,appendAudit,type DbTx} from '../../server/db';
import {lockClaimsCutoff} from '../claims/service';
// Canonical encoding keeps the frozen JSONB snapshot hash independent of key order.
const canonical=(v:any):string=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const syntheticAddress=(s:string)=>/^[^\s@]+@[^\s@]+\.invalid$/i.test(s);
async function environment(tx:DbTx){const r=await tx.query('SELECT environment FROM environment_identity WHERE id=1');if(!['dev','test'].includes(r.rows[0]?.environment))throw Error('Synthetic delivery requires dev/test identity');}
async function active(tx:DbTx,a:Actor){return !!(await tx.query('SELECT 1 FROM employee WHERE id=$1 AND user_id=$2 AND active=true AND role=$3',[a.employeeId,a.userId,a.role])).rowCount;}
export class ReviewedPublicationBlocked extends Error {}
// Called inside the payment/resolution transaction; failure rolls back the event too.
export async function freezePayslipObligation(tx:DbTx,entryId:string,kind:'payment'|'correction',eventId:string){
 await environment(tx);
 if((await tx.query('SELECT 1 FROM payslip_obligation WHERE event_kind=$1 AND event_id=$2',[kind,eventId])).rowCount)return;
 const e=(await tx.query('SELECT p.*,u.name,u.email FROM payroll_entry p JOIN employee e ON e.id=p.employee_id JOIN "user" u ON u.id=e.user_id WHERE p.id=$1',[entryId])).rows[0];
 const payments=(await tx.query('SELECT id,input,wage_cents,reimbursement_cents,exception,issue_due_at FROM payroll_payment WHERE entry_id=$1 ORDER BY id',[entryId])).rows;
 const paymentEvidence=[];
 for(const p of payments){
  const allocations=p.exception?(await tx.query('SELECT claim_id,amount_cents FROM payroll_claim_payment WHERE payment_id=$1 ORDER BY claim_id',[p.id])).rows:e.snapshot.claims.map((c:any)=>({claim_id:c.id,amount_cents:c.amount_cents}));
  paymentEvidence.push({id:p.id,...p.input,wageCents:Number(p.wage_cents),reimbursementCents:Number(p.reimbursement_cents),claimAllocations:allocations.map((a:any)=>({paymentId:p.id,claimId:a.claim_id,amountCents:Number(a.amount_cents)}))});
 }
 const resolutions=(await tx.query("SELECT r.*,c.id AS correction_id FROM payroll_correction_resolution r JOIN payroll_correction c ON c.id=r.correction_id WHERE c.entry_id=$1 AND r.input->>'outcome'='accept' ORDER BY r.sequence",[entryId])).rows;
 const source=kind==='payment'?payments.find(p=>p.id===eventId):resolutions.find(r=>r.correction_id===eventId);
 if(!source)throw Error('Missing paid or accepted correction event');
 const version=Number((await tx.query('SELECT COALESCE(max(version),0)+1 AS n FROM payslip_obligation WHERE entry_id=$1',[entryId])).rows[0].n);
 let reviewedData;
 if(e.snapshot.input.reviewed){
  const facts=paymentEvidence.map(p=>({id:p.id,date:p.date,wageCents:p.wageCents,reimbursementCents:p.reimbursementCents,evidenceId:p.reference}));
  for(const r of resolutions){if(!r.input.payment)throw Error('Reviewed noncash correction remains held');facts.push({id:r.correction_id,date:r.input.payment.date,wageCents:r.input.payment.amountCents,reimbursementCents:0,evidenceId:r.input.payment.reference});}
  let data;
  if(kind==='correction'){
   const prior=(await tx.query('SELECT snapshot FROM payslip_obligation WHERE entry_id=$1 ORDER BY version DESC LIMIT 1',[entryId])).rows[0]?.snapshot.reviewedData;
   if(!prior||!source.settled_snapshot||!source.input.publication)throw new ReviewedPublicationBlocked('Verified original correction lineage required');
   data=reviewedCorrectionData(source.settled_snapshot.input,e.snapshot.claims,facts,prior,eventId,source.input);
  }else{if(resolutions.length)throw Error('Post-correction payment requires supervised reconciliation');data=reviewedPaidData(e.snapshot.input,e.snapshot.claims,facts);}
  if(!data.ok){if(kind==='correction')throw new ReviewedPublicationBlocked(data.message);throw Error(data.message);}reviewedData=await freezeBranding(tx,data.value);
 }
 const snapshot={...(reviewedData?{reviewedData}:{}),purpose:'SYNTHETIC PREVIEW — NOT A LEGAL PAYSLIP',schemaVersion:1,company:'Synthetic development company',employee:{id:e.employee_id,name:e.name},period:e.snapshot.input.salaryMonth,original:e.snapshot,corrections:resolutions.map(r=>({id:r.correction_id,evidence:r.input,settled:r.settled_snapshot})),payments:paymentEvidence,ytd:{status:'unverified_not_available'},event:{kind,id:eventId},version};
 const id=randomUUID(),due=kind==='payment'?source.issue_due_at:source.input.issueDueAt;
 await tx.query('INSERT INTO payslip_obligation(id,entry_id,employee_id,event_kind,event_id,version,snapshot,snapshot_hash,due_at,recipient) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id,entryId,e.employee_id,kind,eventId,version,snapshot,hash(canonical(snapshot)),due,e.email]);
 const preference=(await tx.query('SELECT enabled FROM delivery_preference WHERE employee_id=$1',[e.employee_id])).rows[0];
 // Partial and unreviewed corrections remain manual. Reviewed positive correction intents are capture-only.
 if(((kind==='payment'&&!source.exception)||(kind==='correction'&&reviewedData&&source.input.payment))&&preference?.enabled&&syntheticAddress(e.email)){
  const job=randomUUID();await tx.query('INSERT INTO delivery_outbox(id,obligation_id,message_id) VALUES($1,$2,$3)',[job,id,'<synthetic-'+job+'@hr.example.invalid>']);
 }
}
// Explicit administrator confirmation of approved totals/date; no bank ledger or delivery hook.
export async function freezeDateConfirmedPayslip(tx:DbTx,e:any,date:string,due:string){
 const existing=(await tx.query('SELECT obligation_id FROM payroll_date_payslip WHERE entry_id=$1 AND payment_date=$2',[e.id,date])).rows[0];if(existing)return existing.obligation_id;
 const eventId=randomUUID(),id=randomUUID(),version=Number((await tx.query('SELECT COALESCE(max(version),0)+1 AS n FROM payslip_obligation WHERE entry_id=$1',[e.id])).rows[0].n);
 const data=reviewedPaidData(e.snapshot.input,e.snapshot.claims,[{id:eventId,date,wageCents:e.snapshot.calculation.netWagesCents,reimbursementCents:e.snapshot.calculation.reimbursementCents,evidenceId:'administrator-payment-date:'+eventId}]);if(!data.ok)throw new ReviewedPublicationBlocked(data.message);
 const employee=(await tx.query('SELECT u.name,u.email FROM employee e JOIN "user" u ON u.id=e.user_id WHERE e.id=$1',[e.employee_id])).rows[0];
 const prior=(await tx.query('SELECT id,snapshot_hash FROM payslip_obligation WHERE entry_id=$1 ORDER BY version DESC LIMIT 1',[e.id])).rows[0]??null;
 const snapshot={purpose:'SYNTHETIC PAYSLIP — NOT ISSUED',schemaVersion:1,reviewedData:await freezeBranding(tx,data.value),employee:{id:e.employee_id,name:employee.name},period:e.snapshot.input.salaryMonth,original:e.snapshot,event:{kind:'payment',id:eventId},version,paymentDateConfirmation:{date,source:'administrator-confirmed-approved-totals',priorSnapshot:prior},corrections:[]};
 await tx.query("INSERT INTO payslip_obligation(id,entry_id,employee_id,event_kind,event_id,version,snapshot,snapshot_hash,due_at,recipient) VALUES($1,$2,$3,'payment',$4,$5,$6,$7,$8,$9)",[id,e.id,e.employee_id,eventId,version,snapshot,hash(canonical(snapshot)),due,employee.email]);
 await tx.query('INSERT INTO payroll_date_payslip VALUES($1,$2,$3)',[e.id,date,id]);return id;
}
export type FakeOutcome='accepted'|'definite_failure'|'unknown';
export type Lease={id:string;token:string;messageId:string;recipient:string;documentHash:string};
export function createPayslipService(pool:Pool){
 async function configure(c:AuditContext,employeeId:string,enabled:unknown){
  if(c.actor.role!=='admin')return fail('FORBIDDEN','Administrator required');if(!z.uuid().safeParse(employeeId).success||typeof enabled!=='boolean'||!z.uuid().safeParse(c.requestId).success)return fail('INPUT','Invalid preference');
  return withTransaction(pool,async tx=>{await environment(tx);await lockClaimsCutoff(tx);if(!await active(tx,c.actor))return fail('FORBIDDEN','Active administrator required');const e=(await tx.query('SELECT u.email FROM employee e JOIN "user" u ON u.id=e.user_id WHERE e.id=$1 AND e.active=true',[employeeId])).rows[0];if(!e)return fail('NOT_FOUND','Employee unavailable');if(enabled&&!syntheticAddress(e.email))return fail('SYNTHETIC_RECIPIENT_REQUIRED','Only .invalid fixture addresses may opt in');await tx.query('INSERT INTO delivery_preference VALUES($1,$2) ON CONFLICT(employee_id) DO UPDATE SET enabled=EXCLUDED.enabled',[employeeId,enabled]);await appendAudit(tx,{context:c,action:'synthetic-delivery.preference',entityId:employeeId});return ok(employeeId);});
 }
 async function list(a:Actor){return withTransaction(pool,async tx=>{await environment(tx);if(!await active(tx,a))return fail('FORBIDDEN','Active employee required');const rows=(await tx.query('SELECT o.*,dp.payment_date AS confirmed_date,ps.payment_date AS current_payment_date,pdf.state AS pdf_state,b.state AS delivery_state,b.message_id,b.provider_reference FROM payslip_obligation o LEFT JOIN payroll_date_payslip dp ON dp.obligation_id=o.id LEFT JOIN payroll_paid_status ps ON ps.entry_id=o.entry_id LEFT JOIN payslip_pdf_attempt pdf ON pdf.obligation_id=o.id LEFT JOIN delivery_outbox b ON b.obligation_id=o.id WHERE ($1::boolean OR o.employee_id=$2) ORDER BY o.entry_id,o.version',[a.role==='admin',a.employeeId])).rows;return ok(rows.map(r=>({id:r.id,employeeId:r.employee_id,version:r.version,dateConfirmation:r.confirmed_date?{date:r.confirmed_date,currentDate:r.current_payment_date??null,active:r.confirmed_date===r.current_payment_date}:null,snapshot:r.snapshot,snapshotHash:r.snapshot_hash,dueAt:r.due_at,renderState:r.render_state,pdfState:r.pdf_state??'not_rendered',deliveryState:r.delivery_state??'manual_only',messageId:r.message_id,providerReference:r.provider_reference,issueStatus:'manual_issue_required',actualIssued:false,actualDelivered:false})));});}
 async function document(a:Actor,id:string){if(!z.uuid().safeParse(id).success)return fail('INPUT','Invalid document ID');return withTransaction(pool,async tx=>{await environment(tx);if(!await active(tx,a))return fail('FORBIDDEN','Active employee required');const r=(await tx.query('SELECT o.employee_id,d.* FROM payslip_obligation o LEFT JOIN simulated_document d ON d.obligation_id=o.id WHERE o.id=$1',[id])).rows[0];if(!r)return fail('NOT_FOUND','No paid-event preview');if(a.role!=='admin'&&r.employee_id!==a.employeeId)return fail('FORBIDDEN','Document owner required');if(!r.body)return fail('NOT_RENDERED','Synthetic preview unavailable; manual issue still required');return ok({body:r.body,sha256:r.sha256,mediaType:'application/json',actualIssued:false});});}
 function instant(value:string){const t=new Date(value);if(!Number.isFinite(t.getTime()))throw Error('Invalid worker time');return t;}
 async function recover(now:string){const t=instant(now);await withTransaction(pool,async tx=>{await environment(tx);const rows=(await tx.query("UPDATE delivery_outbox SET state='unknown' WHERE state='sending' AND lease_until<=$1 RETURNING token",[t])).rows;for(const row of rows)await tx.query("UPDATE delivery_attempt SET state='unknown',finished_at=$2 WHERE id=$1 AND state='sending'",[row.token,t]);});}
 async function claim(now:string,renderer:'success'|'failure'):Promise<Lease|null>{
  const t=instant(now);if(!['success','failure'].includes(renderer))throw Error('Only synthetic renderer modes allowed');await recover(now);
  return withTransaction(pool,async tx=>{await environment(tx);
   const docs=(await tx.query("SELECT * FROM payslip_obligation WHERE render_state<>'simulated_rendered' ORDER BY entry_id,version LIMIT 20 FOR UPDATE SKIP LOCKED")).rows;
   for(const d of docs){if(renderer==='failure'){await tx.query("UPDATE payslip_obligation SET render_state='render_failed' WHERE id=$1",[d.id]);continue;}if(hash(canonical(d.snapshot))!==d.snapshot_hash)throw Error('Snapshot integrity failure');const body=canonical({warning:'SIMULATED JSON ONLY. NO PDF OR LEGAL ISSUANCE.',snapshot:d.snapshot});await tx.query('INSERT INTO simulated_document VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[d.id,body,hash(body)]);await tx.query("UPDATE payslip_obligation SET render_state='simulated_rendered' WHERE id=$1",[d.id]);}
   const job=(await tx.query("SELECT b.*,o.employee_id,o.recipient,d.sha256 FROM delivery_outbox b JOIN payslip_obligation o ON o.id=b.obligation_id JOIN simulated_document d ON d.obligation_id=o.id WHERE NOT (o.snapshot ? 'reviewedData') AND b.state IN ('planned','definite_failure') AND b.next_attempt<=$1 ORDER BY b.id LIMIT 1 FOR UPDATE OF b SKIP LOCKED",[t])).rows[0];if(!job)return null;
   const recipient=(await tx.query('SELECT u.email,e.active,p.enabled FROM employee e JOIN "user" u ON u.id=e.user_id LEFT JOIN delivery_preference p ON p.employee_id=e.id WHERE e.id=$1',[job.employee_id])).rows[0];
   if(!recipient?.active||!recipient.enabled||recipient.email!==job.recipient||!syntheticAddress(job.recipient)){await tx.query("UPDATE delivery_outbox SET state='held' WHERE id=$1",[job.id]);return null;}
   const token=randomUUID();await tx.query("UPDATE delivery_outbox SET state='sending',token=$2,lease_until=$3 WHERE id=$1",[job.id,token,new Date(t.getTime()+60000)]);await tx.query("INSERT INTO delivery_attempt(id,outbox_id,started_at,state) VALUES($1,$2,$3,'sending')",[token,job.id,t]);return {id:job.id,token,messageId:job.message_id,recipient:job.recipient,documentHash:job.sha256};
  });
 }
 async function finish(job:Lease,outcome:FakeOutcome,now:string){const t=instant(now);if(!['accepted','definite_failure','unknown'].includes(outcome))throw Error('Invalid fake outcome');await recover(now);return withTransaction(pool,async tx=>{await environment(tx);const state=outcome==='accepted'?'simulated_accepted':outcome,reference=outcome==='accepted'?'FAKE-'+job.token:null;const r=await tx.query("UPDATE delivery_outbox SET state=$3,provider_reference=$4,next_attempt=$5 WHERE id=$1 AND token=$2 AND state='sending' AND lease_until>$6 RETURNING id",[job.id,job.token,state,reference,new Date(t.getTime()+60000),t]);if(!r.rowCount)return false;await tx.query('UPDATE delivery_attempt SET state=$2,finished_at=$3,provider_reference=$4 WHERE id=$1',[job.token,state,t,reference]);return true;});}
 // This adapter is intentionally closed: there is no callback, SMTP, fetch, subprocess or real renderer.
 async function process(now:string,renderer:'success'|'failure'='success',provider:FakeOutcome='accepted'){const job=await claim(now,renderer);if(job)await finish(job,provider,now);}
 return {configure,list,document,claim,finish,recover,process};
}
