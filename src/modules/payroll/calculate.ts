import {configuredPayrollRules} from './period';
import {calculateFunds} from './funds';
import Decimal from 'decimal.js';import {ok,fail,type Result} from '../../core/contracts';import {money,integer} from '../../core/money';import {parseDate} from '../calendar';import type {PayrollInput,PayrollCalculation} from './types';
// SDL intermediates retain all decimal places. Round only the company total.
function levy(wages:Decimal){return wages.isZero()?new Decimal(0):Decimal.min(1125,Decimal.max(200,wages.mul('0.0025')));}
export function companySdl(wageCents:number[]):Result<number>{try{return ok(integer(wageCents.reduce((sum,w)=>sum.plus(levy(money(w))),new Decimal(0)).div(100).floor().mul(100)));}catch(e){return fail('INVALID_MONEY',String(e));}}
export function calculatePayroll(i:PayrollInput):Result<PayrollCalculation>{
 try{
  const rules=configuredPayrollRules(i.contributionMonth);
  if(i.salaryMonth!==i.contributionMonth)throw new Error('Unsupported rule attribution');
  if(i.citizenship!=='citizen'||(i.funds.status!=='configured'&&(i.funds.status!=='verified-none'||!i.funds.evidenceId.trim())))throw new Error('Unsupported citizenship or unresolved fund evidence');
  const dob=parseDate(i.dob),month=parseDate(i.contributionMonth+'-01'),paid=parseDate(i.expectedPaymentDate);
  if(paid<month||paid.getTime()-month.getTime()>62*86400000)throw new Error('Unsupported payment timing');
  // Age at previous month end: new band starts the month after birthday.
  const ageDate=new Date(month.getTime()-86400000);let age=ageDate.getUTCFullYear()-dob.getUTCFullYear();
  if(ageDate.getUTCMonth()<dob.getUTCMonth()||(ageDate.getUTCMonth()===dob.getUTCMonth()&&ageDate.getUTCDate()<dob.getUTCDate()))age--;
  if(age<16||age>100)throw new Error('Unsupported employment age');
  const rate=rules.bands.find(b=>i.contributionMonth <= String(dob.getUTCFullYear()+b.maxAge)+'-'+String(dob.getUTCMonth()+1).padStart(2,'0'))!;
  if(!rate)throw Error('Unsupported age band for rule period');
  if(!Number.isSafeInteger(i.unpaidHalfUnits)||!Number.isSafeInteger(i.payrollMonthHalfUnits)||i.payrollMonthHalfUnits<40||i.payrollMonthHalfUnits>46||i.payrollMonthHalfUnits%2||i.unpaidHalfUnits<0||i.unpaidHalfUnits>i.payrollMonthHalfUnits)throw new Error('Invalid payroll half-day units');
  let expectedUnits=0;for(let day=new Date(month);day.getUTCMonth()===month.getUTCMonth();day.setUTCDate(day.getUTCDate()+1)){if(day.getUTCDay()>0&&day.getUTCDay()<6)expectedUnits+=2;}
  if(i.payrollMonthHalfUnits!==expectedUnits)throw new Error('Payroll denominator does not match salary month weekdays');
  if([i.openingAnnualOwSubjectCents,i.projectedAnnualOwSubjectCents,i.priorAnnualAwSubjectCents].some(v=>v===undefined))throw Error('Missing annual history must be explicitly unresolved');
  const unknownAnnual=i.openingAnnualOwSubjectCents===null||i.projectedAnnualOwSubjectCents===null||i.priorAnnualAwSubjectCents===null;if(unknownAnnual&&i.bonusCents!==0)throw Error('Additional wages require reconciled annual CPF totals');
  const salary=money(i.monthlySalaryCents),bonus=money(i.bonusCents),reimbursement=money(i.reimbursementCents),annualOW=money(i.projectedAnnualOwSubjectCents??0),openingOW=money(i.openingAnnualOwSubjectCents??0),priorAW=money(i.priorAnnualAwSubjectCents??0);
  if(month.getUTCMonth()===0&&!priorAW.isZero())throw Error('January prior-month AW opening must be zero; aggregate all current-month AW before calculation');
  if(annualOW.gt(9600000)||priorAW.gt(rules.annualCeilingCents))throw new Error('Invalid annual CPF history');
  // Preview policy: round final earned wages once to cents; deduction is the residual.
  // MOM supplies the payable formula, not this cent-rounding convention. Professional acceptance pending.
  const ow=salary.mul(i.payrollMonthHalfUnits-i.unpaidHalfUnits).div(i.payrollMonthHalfUnits).toDecimalPlaces(0,Decimal.ROUND_HALF_UP);
  const unpaid=salary.minus(ow),gross=ow.plus(bonus),owSubject=Decimal.min(ow,rules.owCeilingCents);
  if(!unknownAnnual&&(openingOW.gt(month.getUTCMonth()*rules.owCeilingCents)||annualOW.lt(openingOW.plus(owSubject))))throw new Error('Annual OW projection or opening history contradicts known subject OW');
  const awRemaining=Decimal.max(0,new Decimal(rules.annualCeilingCents).minus(annualOW).minus(priorAW)),awSubject=Decimal.min(bonus,awRemaining);
  if(gross.lte(75000)&&!awSubject.eq(bonus))throw new Error('Low-wage excluded-AW case needs verified fixture');
  const base=owSubject.plus(awSubject);let total=new Decimal(0),employee=new Decimal(0);
  if(gross.gt(75000)){total=base.mul(rate.total);employee=base.mul(rate.employee);}
  else if(gross.gt(50000)){employee=gross.minus(50000).mul(rate.phase);total=gross.mul(rate.employer).plus(employee);}
  else if(gross.gt(5000))total=gross.mul(rate.employer);
  total=total.div(100).toDecimalPlaces(0,Decimal.ROUND_HALF_UP).mul(100);employee=employee.div(100).floor().mul(100);
  if(i.funds.status==='configured'&&(i.funds.employeeId!==i.employeeId||i.funds.employerId!==i.employerId))throw Error('Fund evidence belongs to another employee or employer');
  const funds=i.funds.status==='configured'?calculateFunds(i.contributionMonth,integer(gross),i.funds):ok({totalCents:0,deductions:[]});
  if(!funds.ok)throw Error(funds.message);
  const net=gross.minus(employee).minus(funds.value.totalCents);if(net.lt(0))throw Error('Negative net wages require supervised review');const flags:string[]=[];if(unknownAnnual)flags.push('annual_history_unreconciled');
  if(bonus.gt(0)||priorAW.gt(0))flags.push('annual_aw_reconciliation_required');
  if(i.contributionMonth.endsWith('-12'))flags.push('year_end_actual_ow_review_required');
  if(priorAW.gt(new Decimal(rules.annualCeilingCents).minus(annualOW)))flags.push('external_reconciliation_required');
  return ok({purpose:"development-preview",livePayrollAllowed:false,grossWagesCents:integer(gross),unpaidDeductionCents:integer(unpaid),owSubjectCents:integer(owSubject),awSubjectCents:integer(awSubject),employeeCpfCents:integer(employee),employerCpfCents:integer(total.minus(employee)),fundDeductionCents:funds.value.totalCents,fundDeductions:funds.value.deductions,netWagesCents:integer(net),reimbursementCents:integer(reimbursement),bankTransferCents:integer(net.plus(reimbursement)),sdlCents:integer(levy(gross).toDecimalPlaces(0,Decimal.ROUND_HALF_UP)),sdlUnroundedCents:levy(gross).toFixed(),ruleId:rules.id,reviewFlags:flags});
 }catch(e){return fail('PAYROLL_BLOCKED',e instanceof Error?e.message:'Invalid payroll input');}
}
