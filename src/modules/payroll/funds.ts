import {payrollMonthSchema,configuredPayrollRules} from './period';
import {z} from 'zod';
import {ok,fail} from '../../core/contracts';
const period=payrollMonthSchema;
const fund=z.enum(['CDAC','ECF','MBMF','SINDA']);
const record=z.object({fund,mode:z.enum(['standard','not-applicable','opt-out']),evidenceId:z.string().trim().min(1),verified:z.literal(true),effectiveFrom:period,effectiveTo:period,authority:z.string().optional(),procedure:z.enum(['submitted-prescribed-form','association-certified-form','processed-digital-notification','muis-change-certificate']).optional(),coverage:z.literal('full-fund').optional(),documentHash:z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict();
export const fundSettingsSchema=z.object({status:z.literal('configured'),employeeId:z.string().trim().min(1),employerId:z.string().trim().min(1),records:z.array(record).length(4)}).strict();
export type FundSettings=z.infer<typeof fundSettingsSchema>;
// Current official SHG schedules reviewed 2026-10-29 for 2026/2027 coverage.
// Configured schedules continue forward until replaced by an effective-dated update.
const tables={CDAC:[[200000,50],[350000,100],[500000,150],[750000,200],[Infinity,300]],ECF:[[100000,200],[150000,400],[250000,600],[400000,900],[700000,1200],[1000000,1600],[Infinity,2000]],MBMF:[[100000,300],[200000,450],[300000,650],[400000,1500],[600000,1950],[800000,2200],[1000000,2400],[Infinity,2600]],SINDA:[[100000,100],[150000,300],[250000,500],[450000,700],[750000,900],[1000000,1200],[1500000,1800],[Infinity,3000]]};
const procedures={CDAC:'submitted-prescribed-form',ECF:'association-certified-form',MBMF:'muis-change-certificate',SINDA:'processed-digital-notification'};
const authorities={CDAC:'CDAC',ECF:'EA',MBMF:'MUIS',SINDA:'SINDA'};
export function calculateFunds(month:string,wages:number,settings:unknown){
 try{
  period.parse(month);if(!Number.isSafeInteger(wages)||wages<0)throw Error('Invalid fund wage base');
  const s=fundSettingsSchema.parse(settings);if(new Set(s.records.map(r=>r.fund)).size!==4)throw Error('All fund applicability decisions required');
  const deductions=s.records.map(r=>{
   if(r.effectiveFrom>month||r.effectiveTo<month)throw Error('Unverified fund period');
   if(r.mode==='opt-out'&&(!r.documentHash||r.authority!==authorities[r.fund]||r.procedure!==procedures[r.fund]||r.coverage!=='full-fund'))throw Error('Processed fund-specific opt-out evidence required');
   if(r.mode==='standard'&&r.fund==='ECF'&&wages<=20000)throw Error('ECF very-low wage guidance unresolved');
   if(r.mode==='standard'&&wages===0)throw Error('Zero wage fund treatment requires verified fund-specific evidence');
   return {fund:r.fund,amountCents:r.mode==='standard'?tables[r.fund].find(([cap])=>wages<=cap)![1]:0,mode:r.mode,evidenceId:r.evidenceId};
  });
  return ok({deductions,totalCents:deductions.reduce((n,d)=>n+d.amountCents,0),ruleId:configuredPayrollRules(month).effectiveFrom.startsWith('2026-')?'sg-shg-2026-reviewed-2026-10-23':'sg-shg-2027-reviewed-2026-10-29'});
 }catch(e){return fail('FUNDS_BLOCKED',e instanceof Error?e.message:'Unverified fund configuration');}
}
