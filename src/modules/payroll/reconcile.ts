import Decimal from 'decimal.js';import {ok,fail} from '../../core/contracts';import {money,integer} from '../../core/money';import {calculatePayroll} from './calculate';import type {PayrollInput} from './types';
export type AttributedAdjustment={id:string;employeeId:string;originalEntryId:string;wagePeriod:string;contributionMonth:string;componentCode:string;classification:string;amountCents:number;reason:string;evidenceId:string};
export type MonthReconciliationInput={employeeId:string;originalEntryId:string;original:PayrollInput;adjustments:AttributedAdjustment[];previous:{employeeCpfCents:number;employerCpfCents:number;bankTransferCents:number;sdlUnroundedCents:string}};
export function reconcileMonth(i:MonthReconciliationInput){
 try{
  const next={...i.original};const ids=new Set<string>();
  for(const a of i.adjustments){
   if(!a.id||ids.has(a.id)||!a.reason.trim()||!a.evidenceId.trim()||a.employeeId!==i.employeeId||a.originalEntryId!==i.originalEntryId||a.wagePeriod!==i.original.salaryMonth||a.contributionMonth!==i.original.contributionMonth||!Number.isSafeInteger(a.amountCents))throw new Error('Unknown, duplicate or unsupported attribution');
   ids.add(a.id);
   if(a.componentCode==='monthly_salary'&&a.classification==='OW'){if(next.unpaidHalfUnits!==0)throw new Error('Salary adjustment with unpaid leave requires manual reconstruction');next.monthlySalaryCents=integer(new Decimal(next.monthlySalaryCents).plus(a.amountCents));}
   else if(a.componentCode==='bonus'&&a.classification==='AW')next.bonusCents=integer(new Decimal(next.bonusCents).plus(a.amountCents));
   else if(a.componentCode==='business_reimbursement'&&a.classification==='reimbursement')next.reimbursementCents=integer(new Decimal(next.reimbursementCents).plus(a.amountCents));
   else throw new Error('Unverified component treatment');
  }
  const result=calculatePayroll(next);if(!result.ok)return result;const calculation=result.value;
  const priorSdl=new Decimal(i.previous.sdlUnroundedCents);if(!priorSdl.isFinite()||priorSdl.lt(0)||priorSdl.gt(1125))throw new Error('Invalid previous SDL');
  const delta={employeeCpfCents:integer(new Decimal(calculation.employeeCpfCents).minus(money(i.previous.employeeCpfCents))),employerCpfCents:integer(new Decimal(calculation.employerCpfCents).minus(money(i.previous.employerCpfCents))),bankTransferCents:integer(new Decimal(calculation.bankTransferCents).minus(money(i.previous.bankTransferCents))),sdlUnroundedCents:new Decimal(calculation.sdlUnroundedCents).minus(priorSdl).toFixed()};
  const held=delta.bankTransferCents<=0||delta.employeeCpfCents<0||delta.employerCpfCents<0||new Decimal(delta.sdlUnroundedCents).lt(0)||calculation.reviewFlags.length>0;
  return ok({input:next,calculation,delta,settlement:held?'external_reconciliation_required':'approval_and_manual_payment_required',originalEntryId:i.originalEntryId,adjustmentIds:[...ids]});
 }catch(e){return fail('RECONCILIATION_BLOCKED',e instanceof Error?e.message:'Invalid reconciliation');}
}
