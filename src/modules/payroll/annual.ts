import {payrollMonthSchema,configuredPayrollRules} from './period';
import {z} from 'zod';
import Decimal from 'decimal.js';
import {ok,fail} from '../../core/contracts';
import {integer} from '../../core/money';
import {parseDate} from '../calendar';
import {calculatePayroll} from './calculate';
export const centsSchema=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const monthSchema=payrollMonthSchema;
export const provenanceSchema=z.object({status:z.literal('synthetic-reviewed'),sourceId:z.string().trim().min(1),documentHash:z.string().regex(/^[a-f0-9]{64}$/),acceptanceId:z.string().trim().min(1)}).strict();
export const historyMonthSchema=z.object({month:monthSchema,owCents:centsSchema,awCents:centsSchema,assessedOwSubjectCents:centsSchema.max(800000),assessedAwSubjectCents:centsSchema,assessedEmployeeCpfCents:centsSchema,assessedEmployerCpfCents:centsSchema,settledEmployeeCpfCents:centsSchema,settledEmployerCpfCents:centsSchema,ruleId:z.enum(['sg-citizen-2026-v1','sg-citizen-under55-2027-v1','sg-citizen-2027-v1']),employeeCpfWithheldCents:centsSchema,refundedEmployeeCpfCents:centsSchema,refundedEmployerCpfCents:centsSchema,awDuePayableDates:z.array(z.string()).max(31),provenance:provenanceSchema}).strict();
const annualSchema=z.object({syntheticOnly:z.literal(true),employeeId:z.string().trim().min(1),employerId:z.string().trim().min(1),citizenship:z.literal('citizen'),dob:z.string(),employmentStart:z.string(),reason:z.enum(['year-end','leaver']),asOf:monthSchema,terminationDate:z.string().nullable(),months:z.array(historyMonthSchema).min(1).max(12)}).strict();
export function validateNarrowProfile(dob:string,start:string,asOf:string){
 const d=parseDate(dob),s=parseDate(start);
 const last=new Date(Date.UTC(Number(asOf.slice(0,4)),Number(asOf.slice(5)),0));
 const cutoff=new Date(last);cutoff.setUTCFullYear(cutoff.getUTCFullYear()-55);
 if(d<=cutoff||d>new Date(Date.UTC(last.getUTCFullYear()-16,last.getUTCMonth(),last.getUTCDate()))||s>=parseDate(asOf.slice(0,4)+'-01-01')||s<d)throw Error('Only long-serving citizens under 55 supported by acceptance pack');
}
export function validateHistoryMonths(months:z.infer<typeof historyMonthSchema>[]){
 for(const m of months){
  if(m.ruleId!==configuredPayrollRules(m.month).id&&!(m.month.startsWith('2027-')&&m.ruleId==='sg-citizen-under55-2027-v1'))throw Error('Historical CPF rule version does not match its period');
  if(m.awCents>0&&!m.awDuePayableDates.length)throw Error('AW due/payable dates required');
  for(const date of m.awDuePayableDates){parseDate(date);if(date.slice(0,7)!==m.month)throw Error('AW due/payable attribution differs from contribution month');}
  if(m.refundedEmployeeCpfCents>m.settledEmployeeCpfCents||m.refundedEmployerCpfCents>m.settledEmployerCpfCents)throw Error('Refund exceeds recorded settlement');
  if(m.assessedAwSubjectCents>m.awCents)throw Error('Assessed AW base exceeds actual AW');
 }
}
export const sumCents=(values:number[])=>integer(values.reduce((a,v)=>a.plus(v),new Decimal(0)));
export function payrollUnits(month:string){const first=parseDate(month+'-01');let n=0;for(let d=new Date(first);d.getUTCMonth()===first.getUTCMonth();d.setUTCDate(d.getUTCDate()+1))if(d.getUTCDay()>0&&d.getUTCDay()<6)n+=2;return n;}
export function reconcileAnnualCpf(input:unknown){
 try{
  const i=annualSchema.parse(input);validateNarrowProfile(i.dob,i.employmentStart,i.asOf);
  if(i.reason==='year-end'&&(!i.asOf.endsWith('-12')||i.terminationDate!==null))throw Error('Year-end requires complete December history');
  if(i.reason==='leaver'&&(!i.terminationDate||!parseDate(i.terminationDate)||i.terminationDate.slice(0,7)!==i.asOf))throw Error('Last employment month evidence required');
  validateHistoryMonths(i.months);
  if(i.reason==='leaver'&&i.months.some(m=>m.awCents>0&&m.awDuePayableDates.some(date=>date>i.terminationDate!)))throw Error('Post-cessation AW is outside this acceptance slice');
  const months=[...i.months].sort((a,b)=>a.month.localeCompare(b.month));const count=Number(i.asOf.slice(5));
  if(months.length!==count||months.some((m,n)=>m.month!==`${i.asOf.slice(0,4)}-${String(n+1).padStart(2,'0')}`))throw Error('Every January-to-close month required exactly once');
  if(new Set(months.map(m=>m.provenance.sourceId)).size!==count)throw Error('Duplicate source record');
  const actualOwSubjectCents=sumCents(months.map(m=>Math.min(m.owCents,800000))),awCeilingCents=10200000-actualOwSubjectCents;
  let priorAw=0,priorOw=0;
  const reconciled=months.map(m=>{
   const calc=calculatePayroll({salaryMonth:m.month,contributionMonth:m.month,expectedPaymentDate:m.month+'-28',dob:i.dob,citizenship:'citizen',monthlySalaryCents:m.owCents,bonusCents:m.awCents,reimbursementCents:0,unpaidHalfUnits:0,payrollMonthHalfUnits:payrollUnits(m.month),openingAnnualOwSubjectCents:priorOw,projectedAnnualOwSubjectCents:actualOwSubjectCents,priorAnnualAwSubjectCents:priorAw,funds:{status:'verified-none',evidenceId:'CPF-only reconciliation; fund liabilities assessed separately'}});
   if(!calc.ok)throw Error(calc.message);const c=calc.value;priorOw+=c.owSubjectCents;priorAw+=c.awSubjectCents;
   return {...m,owSubjectCents:c.owSubjectCents,awSubjectCents:c.awSubjectCents,employeeCpfCents:c.employeeCpfCents,employerCpfCents:c.employerCpfCents,employeeCpfDeltaCents:c.employeeCpfCents-m.assessedEmployeeCpfCents,employerCpfDeltaCents:c.employerCpfCents-m.assessedEmployerCpfCents,employeeSettlementDeltaCents:sumCents([c.employeeCpfCents,-m.settledEmployeeCpfCents,m.refundedEmployeeCpfCents]),employerSettlementDeltaCents:sumCents([c.employerCpfCents,-m.settledEmployerCpfCents,m.refundedEmployerCpfCents])};
  });
  return ok({purpose:'synthetic-statutory-review',livePayrollAllowed:false as const,automaticRecoveryAllowed:false as const,employeeId:i.employeeId,employerId:i.employerId,asOf:i.asOf,reason:i.reason,ruleId:configuredPayrollRules(i.asOf).id,actualOwSubjectCents,awCeilingCents,actualAwSubjectCents:priorAw,employeeCpfWithheldCents:sumCents(months.map(m=>m.employeeCpfWithheldCents)),refundedEmployeeCpfCents:sumCents(months.map(m=>m.refundedEmployeeCpfCents)),refundedEmployerCpfCents:sumCents(months.map(m=>m.refundedEmployerCpfCents)),employeeCpfCents:sumCents(reconciled.map(m=>m.employeeCpfCents)),employerCpfCents:sumCents(reconciled.map(m=>m.employerCpfCents)),assessmentDelta:{employeeCpfCents:sumCents(reconciled.map(m=>m.employeeCpfDeltaCents)),employerCpfCents:sumCents(reconciled.map(m=>m.employerCpfDeltaCents))},settlementDelta:{employeeCpfCents:sumCents(reconciled.map(m=>m.employeeSettlementDeltaCents)),employerCpfCents:sumCents(reconciled.map(m=>m.employerSettlementDeltaCents))},action:'supervised_external_reconciliation_required',months:reconciled});
 }catch(e){return fail('ANNUAL_RECONCILIATION_BLOCKED',e instanceof Error?e.message:'Invalid annual history');}
}
