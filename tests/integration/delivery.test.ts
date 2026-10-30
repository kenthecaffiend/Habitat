import {createPayslipService} from '../../src/modules/payslips/service';
import {beforeAll,afterAll,beforeEach,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {disposablePostgres} from '../helpers/postgres';
import {prepareDatabase} from '../../src/server/db';
import {readConfig} from '../../src/server/config';
import {createPayrollService} from '../../src/modules/payroll/service';
import {createLeaveService} from '../../src/modules/leave/service';
import {createClaimsService} from '../../src/modules/claims/service';
import type {Actor,Result} from '../../src/core/contracts';
let db:Awaited<ReturnType<typeof disposablePostgres>>,s:ReturnType<typeof createPayrollService>,a:Actor,e:Actor;
const ctx=(actor=a)=>({actor,requestId:randomUUID()});
function val<T>(r:Result<T>):T{if(!r.ok)throw Error(r.code);return r.value;}
const profile=(employeeId=e.employeeId)=>({employeeId,effectiveMonth:'2026-10',syntheticOnly:true,dob:'1990-01-13',citizenship:'citizen',monthlySalaryCents:400000,openingAnnualOwSubjectCents:0,projectedAnnualOwSubjectCents:4800000,priorAnnualAwSubjectCents:0,funds:{status:'verified-none',evidenceId:'Synthetic test exemption'}});
beforeAll(async()=>{db=await disposablePostgres();await prepareDatabase(db.pool,readConfig({APP_ENV:'test',DATABASE_URL:db.url,APP_ORIGIN:'http://127.0.0.1:3130',SESSION_SECRET:'synthetic-long-secret-for-test-only',MAIL_TRANSPORT:'capture',STORAGE_ENV:'test'}));s=createPayrollService(db.pool,()=> '2026-10-30');});
afterAll(async()=>db?.stop());
beforeEach(async()=>{await db.pool.query('TRUNCATE draft_intent,payroll_run,employee CASCADE');a={userId:randomUUID(),employeeId:randomUUID(),role:'admin'};e={userId:randomUUID(),employeeId:randomUUID(),role:'employee'};for(const actor of [a,e]){await db.pool.query('INSERT INTO "user"(id,name,email) VALUES($1,$1,$2)',[actor.userId,actor.userId+'@example.invalid']);await db.pool.query('INSERT INTO employee(id,user_id,role) VALUES($1,$2,$3)',[actor.employeeId,actor.userId,actor.role]);await createLeaveService(db.pool,()=> '2026-10-30').configureProfile(ctx(),{employeeId:actor.employeeId,continuing:true,eligibleSince:'2025-01-01',verifiedEvidence:'Synthetic test',workingWeekdays:[1,2,3,4,5],restDay:0});}});
async function setup(){expect(await s.configureProfile(ctx(),profile())).toMatchObject({ok:true});}
async function draft(){await setup();return val(await s.createDraft(ctx(),'2026-10'));}
async function entry(){const id=await draft();const rows:any=val(await s.list(a));return {id,entry:rows.find((r:any)=>r.id===id).entries[0]};}
async function approved(){const x=await entry();expect(await s.approvePayroll(ctx(),x.id,1,{remainingPeriodAcknowledgement:'Synthetic final weekday reviewed'})).toMatchObject({ok:true});return x;}
const payment=()=>({date:'2026-10-30',reference:'SIM-'+randomUUID(),amountCents:320000});
async function claim(){const id=randomUUID();await db.pool.query("INSERT INTO private_attachment VALUES($1,$2,'receipt','ready','image/png',68,$3)",[id,e.employeeId,'0'.repeat(64)]);const c=createClaimsService(db.pool);const claimId=val(await c.submitClaim(ctx(e),{employeeId:e.employeeId,description:'Synthetic taxi',expenseDate:'2026-10-01',amountCents:1200,attachmentIds:[id],revision:1}));await c.decideClaim(ctx(),claimId,'approve',1);return claimId;}

const now='2026-10-30T10:00:00.000Z';
it('normal payment atomically freezes one obligation and one opted-in intent',async()=>{
 const delivery=createPayslipService(db.pool);expect(await delivery.configure(ctx(),e.employeeId,true)).toMatchObject({ok:true});
 const {entry}=await approved();const p=payment();await s.recordSalaryPayment(ctx(),entry.id,p);await s.recordSalaryPayment(ctx(),entry.id,p);
 const rows:any=val(await delivery.list(e));expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({actualIssued:false,actualDelivered:false,issueStatus:'manual_issue_required',deliveryState:'planned',version:1});
 const original=rows[0].snapshot;await db.pool.query('UPDATE "user" SET name=$1 WHERE id=$2',['Changed name',e.userId]);expect(val<any>(await delivery.list(e))[0].snapshot).toEqual(original);
});
it('disabled and partial cycles never enqueue automatic normal email',async()=>{
 const {entry}=await approved();await s.recordPaymentException(ctx(),entry.id,{payment:{date:'2026-10-30',reference:'SIM-PART',amountCents:100000},wageCents:100000,reimbursementCents:0,reason:'Manual partial'});
 const delivery=createPayslipService(db.pool);await delivery.configure(ctx(),e.employeeId,true);
 await s.recordPaymentException(ctx(),entry.id,{payment:{date:'2026-10-30',reference:'SIM-BALANCE',amountCents:220000},wageCents:220000,reimbursementCents:0,reason:'Manual balance'});
 const rows:any=val(await delivery.list(e));expect(rows).toHaveLength(2);expect(rows.every((r:any)=>r.deliveryState==='manual_only')).toBe(true);expect(rows[1].snapshot.payments).toHaveLength(2);
});
it('synthetic render and fake acceptance never satisfy actual issuance; ownership enforced',async()=>{
 const delivery=createPayslipService(db.pool);await delivery.configure(ctx(),e.employeeId,true);const {entry}=await approved();await s.recordSalaryPayment(ctx(),entry.id,payment());
 await delivery.process(now,'success','accepted');const row:any=val<any>(await delivery.list(e))[0];expect(row).toMatchObject({renderState:'simulated_rendered',deliveryState:'simulated_accepted',actualIssued:false,actualDelivered:false,issueStatus:'manual_issue_required'});
 expect(await delivery.document({...a,role:'employee'},row.id)).toMatchObject({ok:false,code:'FORBIDDEN'});const doc:any=val(await delivery.document(e,row.id));expect(doc.mediaType).toBe('application/json');expect(doc.sha256).toMatch(/^[a-f0-9]{64}$/);
});
it('lease expiry turns sending unknown and fences late success; no automatic resend',async()=>{
 const delivery=createPayslipService(db.pool);await delivery.configure(ctx(),e.employeeId,true);const {entry}=await approved();await s.recordSalaryPayment(ctx(),entry.id,payment());
 const job=await delivery.claim(now,'success');expect(job).not.toBeNull();await delivery.recover('2026-10-30T10:02:00.000Z');expect(await delivery.finish(job!,'accepted','2026-10-30T10:02:01.000Z')).toBe(false);
 await delivery.process('2026-10-30T10:03:00.000Z','success','accepted');expect(val<any>(await delivery.list(e))[0].deliveryState).toBe('unknown');expect((await db.pool.query('SELECT * FROM delivery_attempt')).rows).toHaveLength(1);
});
it('definite pre-send failures retry after backoff; ambiguous outcomes never auto retry',async()=>{
 const delivery=createPayslipService(db.pool);await delivery.configure(ctx(),e.employeeId,true);const {entry}=await approved();await s.recordSalaryPayment(ctx(),entry.id,payment());
 await delivery.process(now,'success','definite_failure');expect(val<any>(await delivery.list(e))[0].deliveryState).toBe('definite_failure');expect(await delivery.claim('2026-10-30T10:00:10.000Z','success')).toBeNull();
 await delivery.process('2026-10-30T10:02:00.000Z','success','unknown');await delivery.process('2026-10-30T10:04:00.000Z','success','accepted');expect(val<any>(await delivery.list(e))[0].deliveryState).toBe('unknown');expect((await db.pool.query('SELECT * FROM delivery_attempt')).rows).toHaveLength(2);
});
it('renderer failure leaves manual obligation and no send attempt; concurrent workers converge',async()=>{
 const delivery=createPayslipService(db.pool);await delivery.configure(ctx(),e.employeeId,true);const {entry}=await approved();await s.recordSalaryPayment(ctx(),entry.id,payment());
 await delivery.process(now,'failure','accepted');expect(val<any>(await delivery.list(e))[0]).toMatchObject({renderState:'render_failed',issueStatus:'manual_issue_required'});expect((await db.pool.query('SELECT * FROM delivery_attempt')).rows).toHaveLength(0);
 await Promise.all([delivery.process('2026-10-30T10:02:00.000Z','success','accepted'),delivery.process('2026-10-30T10:02:00.000Z','success','accepted')]);expect((await db.pool.query('SELECT * FROM delivery_attempt')).rows).toHaveLength(1);
});
it('unpaid entries have no document; disabled normal payment has no delivery intent',async()=>{const {entry}=await approved();const d=createPayslipService(db.pool);expect(await d.document(e,entry.id)).toMatchObject({ok:false,code:'NOT_FOUND'});await s.recordSalaryPayment(ctx(),entry.id,payment());expect(val<any>(await d.list(e))[0].deliveryState).toBe('manual_only');expect((await db.pool.query('SELECT * FROM delivery_outbox')).rows).toHaveLength(0);});
it('accepted corrections freeze a separate manual version with exact event linkage',async()=>{const {entry}=await approved();await s.recordSalaryPayment(ctx(),entry.id,payment());const proposal=val(await s.amendPaidEntry(ctx(),entry.id,{employeeId:e.employeeId,reason:'Synthetic correction',adjustments:[{id:randomUUID(),employeeId:e.employeeId,originalEntryId:entry.id,wagePeriod:'2026-10',contributionMonth:'2026-10',componentCode:'monthly_salary',classification:'OW',amountCents:10000,reason:'Corrected fixture',evidenceId:'Synthetic evidence'}]}));expect(await s.resolveCorrection(ctx(),proposal,{outcome:'accept',date:'2026-10-30',reason:'Synthetic review',evidenceId:'Reviewed fixture',statutoryEvidenceId:'Synthetic statutory review',payment:{date:'2026-10-30',reference:'SIM-TOPUP',amountCents:8000}})).toMatchObject({ok:true});const rows:any=val(await createPayslipService(db.pool).list(e));expect(rows).toHaveLength(2);expect(rows[1]).toMatchObject({version:2,deliveryState:'manual_only',snapshot:{event:{kind:'correction',id:proposal},corrections:[{evidence:{payment:{amountCents:8000}}}]}});expect(rows[0].snapshot.corrections).toEqual([]);});
it('recipient drift holds delivery instead of changing the frozen address',async()=>{const d=createPayslipService(db.pool);await d.configure(ctx(),e.employeeId,true);const {entry}=await approved();await s.recordSalaryPayment(ctx(),entry.id,payment());await db.pool.query('UPDATE "user" SET email=$1 WHERE id=$2',['changed@example.invalid',e.userId]);await d.process(now);expect(val<any>(await d.list(e))[0].deliveryState).toBe('held');expect((await db.pool.query('SELECT * FROM delivery_attempt')).rows).toHaveLength(0);});
it('snapshot and rendered bytes reject updates; restart preserves hash and version',async()=>{const d=createPayslipService(db.pool);const {entry}=await approved();await s.recordSalaryPayment(ctx(),entry.id,payment());await d.process(now);const row:any=val<any>(await d.list(e))[0],doc=val(await d.document(e,row.id));await expect(db.pool.query("UPDATE payslip_obligation SET snapshot='{}' WHERE id=$1",[row.id])).rejects.toThrow('Immutable');await expect(db.pool.query("UPDATE simulated_document SET body='tampered' WHERE obligation_id=$1",[row.id])).rejects.toThrow('Immutable');await createPayslipService(db.pool).process(now);expect(val(await d.document(e,row.id))).toEqual(doc);expect(val<any>(await d.list(e))).toHaveLength(1);});
it('forged recipient preferences and inactive access fail closed',async()=>{const d=createPayslipService(db.pool);expect(await d.configure(ctx(e),e.employeeId,true)).toMatchObject({ok:false,code:'FORBIDDEN'});await db.pool.query('UPDATE "user" SET email=$1 WHERE id=$2',['someone@example.com',e.userId]);expect(await d.configure(ctx(),e.employeeId,true)).toMatchObject({ok:false,code:'SYNTHETIC_RECIPIENT_REQUIRED'});await db.pool.query('UPDATE employee SET active=false WHERE id=$1',[e.employeeId]);expect(await d.list(e)).toMatchObject({ok:false,code:'FORBIDDEN'});});
it('partial snapshots freeze exact per-payment claim allocations across later payments',async()=>{
 await setup();const first=await claim(),second=await claim(),run=val(await s.createDraft(ctx(),'2026-10'));await s.approvePayroll(ctx(),run,1,{remainingPeriodAcknowledgement:'Synthetic review'});const entryId=val<any>(await s.list(a))[0].entries[0].id,d=createPayslipService(db.pool);
 const pay=async(claimId:string,date:string,reference:string)=>val(await s.recordPaymentException(ctx(),entryId,{payment:{date,reference,amountCents:1200},wageCents:0,reimbursementCents:1200,claimAllocations:[{claimId,amountCents:1200}],reason:'Reviewed claim allocation'}));
 const p1=await pay(first,'2026-10-29','SIM-FIRST-CLAIM');await d.process(now);const before:any=val<any>(await d.list(e))[0],doc1:any=val(await d.document(e,before.id));
 const evidence1={paymentId:p1,claimId:first,amountCents:1200};expect(before.snapshot.payments[0].claimAllocations).toEqual([evidence1]);expect(JSON.parse(doc1.body).snapshot.payments[0].claimAllocations).toEqual([evidence1]);
 const p2=await pay(second,'2026-10-30','SIM-SECOND-CLAIM');await d.process(now);const rows:any=val(await d.list(e)),doc2:any=val(await d.document(e,rows[1].id));
 expect(rows[0]).toEqual(before);expect(val(await d.document(e,before.id))).toEqual(doc1);
 for(const snapshot of [rows[1].snapshot,JSON.parse(doc2.body).snapshot]){expect(snapshot.payments.find((p:any)=>p.id===p1).claimAllocations).toEqual([evidence1]);expect(snapshot.payments.find((p:any)=>p.id===p2).claimAllocations).toEqual([{paymentId:p2,claimId:second,amountCents:1200}]);}
});
