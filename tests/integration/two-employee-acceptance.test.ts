import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {disposablePostgres} from '../helpers/postgres';
import {prepareDatabase} from '../../src/server/db';
import {readConfig} from '../../src/server/config';
import {createLeaveService} from '../../src/modules/leave/service';
import {createClaimsService} from '../../src/modules/claims/service';
import {createPayrollService} from '../../src/modules/payroll/service';
import {createPayslipService} from '../../src/modules/payslips/service';
import {createPdfService} from '../../src/modules/payslips/pdf-service';
import {createPdfCaptureService} from '../../src/modules/payslips/pdf-capture';
import {payslipFixture} from '../fixtures/payslip-data';
import type {Actor,Result} from '../../src/core/contracts';
const val=<T>(r:Result<T>):T=>{if(!r.ok)throw Error(r.code+': '+r.message);return r.value;};
it('two fictional employees complete leave/claim, monthly payment, bound PDF capture and OW correction',async()=>{
 const db=await disposablePostgres();try{
 await prepareDatabase(db.pool,readConfig({APP_ENV:'test',DATABASE_URL:db.url,APP_ORIGIN:'http://127.0.0.1:3130',SESSION_SECRET:'integrated-synthetic-only-secret-12345',MAIL_TRANSPORT:'capture',STORAGE_ENV:'test'}));
 const actors:Actor[]=['admin','employee'].map(role=>({employeeId:randomUUID(),userId:randomUUID(),role:role as Actor['role']}));const [admin,employee]=actors,c=(actor=admin)=>({actor,requestId:randomUUID()});
 for(const a of actors){await db.pool.query('INSERT INTO "user"(id,name,email) VALUES($1,$2,$3)',[a.userId,'Fictional '+a.role,a.userId+'@example.invalid']);await db.pool.query('INSERT INTO employee(id,user_id,role) VALUES($1,$2,$3)',[a.employeeId,a.userId,a.role]);}
 const leave=createLeaveService(db.pool,()=> '2026-10-23'),claims=createClaimsService(db.pool),pay=createPayrollService(db.pool,()=> '2026-10-30'),slips=createPayslipService(db.pool),capture=createPdfCaptureService(db.pool);
 for(const a of actors){val(await leave.configureProfile(c(),{employeeId:a.employeeId,continuing:true,eligibleSince:'2025-01-01',verifiedEvidence:'Invented continuing policy',workingWeekdays:[1,2,3,4,5],restDay:0}));const f=payslipFixture();f.employee.id=f.payroll.employeeId=f.payroll.funds.employeeId=f.opening.employeeId=a.employeeId;val(await pay.configureProfile(c(),{employeeId:a.employeeId,employerId:f.employer.id,effectiveMonth:'2026-10',syntheticOnly:true,dob:f.payroll.dob,citizenship:'citizen',monthlySalaryCents:400000,openingAnnualOwSubjectCents:3600000,projectedAnnualOwSubjectCents:4800000,priorAnnualAwSubjectCents:0,funds:f.payroll.funds,reviewed:{employer:f.employer,employee:f.employee,applicability:f.applicability,opening:f.opening}}));val(await slips.configure(c(),a.employeeId,true));}
 const leaveId=val(await leave.submitLeave(c(employee),{employeeId:employee.employeeId,type:'annual',range:{start:'2026-10-26',end:'2026-10-26',startPart:'am',endPart:'am'},reason:'Invented half day',attachmentIds:[]}));val(await leave.decideLeave(c(),leaveId,'approve',1));
 // Metadata fixture only: actual PNG/JPEG upload/decoder evidence is reused, not rerun here.
 const receipt=randomUUID();await db.pool.query("INSERT INTO private_attachment(id,employee_id,purpose,state,verified_mime,size_bytes,checksum) VALUES($1,$2,'receipt','ready','image/png',68,$3)",[receipt,employee.employeeId,'0'.repeat(64)]);
 const claimId=val(await claims.submitClaim(c(employee),{employeeId:employee.employeeId,description:'Invented taxi',expenseDate:'2026-10-01',amountCents:1200,attachmentIds:[receipt],revision:1}));val(await claims.decideClaim(c(),claimId,'approve',1));
 const run=val(await pay.createDraft(c(),'2026-10'));val(await pay.approvePayroll(c(),run,1,{remainingPeriodAcknowledgement:'Invented full-period review'}));const entries=val(await pay.list(admin))[0].entries;expect(entries).toHaveLength(2);expect(entries.find((e:any)=>e.employee_id===employee.employeeId).snapshot.claims.map((x:any)=>x.id)).toEqual([claimId]);
 for(const e of entries)val(await pay.recordSalaryPayment(c(),e.id,{date:'2026-10-30',reference:'SIM-'+e.id,amountCents:e.snapshot.calculation.bankTransferCents}));
 const original=(await db.pool.query('SELECT * FROM payslip_obligation ORDER BY employee_id')).rows;expect(original).toHaveLength(2);
 // Known closed synthetic renderer adapter; this tests lifecycle binding, not runtime isolation/layout.
 const pdf=createPdfService(db.pool,async layout=>Buffer.from('%PDF-1.4\nSYNTHETIC ADAPTER\n'+JSON.stringify(layout)+'\n%%EOF'));
 for(const o of original){val(await pdf.render(c(),o.id));expect(await capture.process(c(),'2026-10-31T10:00:00Z',o.id)).toBe(true);expect(await capture.process(c(),'2026-10-31T10:00:00Z',o.id)).toBe(false);}
 const entry=entries.find((e:any)=>e.employee_id===employee.employeeId),old=original.find(o=>o.employee_id===employee.employeeId);
 const correction=val(await pay.amendPaidEntry(c(),entry.id,{employeeId:employee.employeeId,reason:'Invented salary omission',adjustments:[{id:randomUUID(),employeeId:employee.employeeId,originalEntryId:entry.id,wagePeriod:'2026-10',contributionMonth:'2026-10',componentCode:'monthly_salary',classification:'OW',amountCents:10000,reason:'Invented already-due salary',evidenceId:'synthetic-contract'}]}));
 const resolution={outcome:'accept',date:'2026-10-30',reason:'Invented supervised review',evidenceId:'synthetic-review',statutoryEvidenceId:'synthetic-statutory-review',publication:{kind:'already-due-omission',coveredWageMonth:'2026-10',duePayableDate:'2026-10-30',evidenceId:'synthetic-payable'},payment:{date:'2026-10-30',reference:'SIM-CORRECTION',amountCents:8000}};val(await pay.resolveCorrection(c(),correction,resolution));val(await pay.resolveCorrection(c(),correction,resolution));
 const revised=(await db.pool.query('SELECT * FROM payslip_obligation WHERE event_id=$1',[correction])).rows[0];expect(revised.snapshot.reviewedData.correction.originalSnapshotHash).toBe(old.snapshot.reviewedData.snapshotHash);expect(revised.snapshot.reviewedData.evidence.payments).toHaveLength(2);expect(revised.snapshot.reviewedData.supplementary.reimbursementPaidCents).toBe(1200);val(await pdf.render(c(),revised.id));expect(await capture.process(c(),'2026-10-31T11:00:00Z',revised.id)).toBe(true);expect(await capture.process(c(),'2026-10-31T11:00:00Z',revised.id)).toBe(false);expect((await pdf.read(employee,revised.id)).ok).toBe(true);expect((await pdf.read(actors[0],old.id)).ok).toBe(true);
 expect((await db.pool.query('SELECT snapshot FROM payslip_obligation WHERE id=$1',[old.id])).rows[0].snapshot).toEqual(old.snapshot);expect((await db.pool.query('SELECT * FROM pdf_mail_capture')).rowCount).toBe(3);expect((await db.pool.query('SELECT * FROM payroll_payment')).rowCount).toBe(2);expect((await db.pool.query('SELECT state FROM claim WHERE id=$1',[claimId])).rows[0].state).toBe('allocated');for(const r of val(await slips.list(employee)))expect(r).toMatchObject({actualIssued:false,actualDelivered:false});
 }finally{await db.stop();}
});
