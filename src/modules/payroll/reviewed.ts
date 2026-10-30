import {payslipDataSchema,reviewedPayrollSchema,buildPayrollPreview,buildPayslipData} from '../payslips/data';
export const monthlyReviewSchema=payslipDataSchema.pick({employer:true,employee:true,applicability:true,opening:true});
// Project only contract fields; lifecycle metadata never becomes an invented payment fact.
export function monthlyData(input:any,claims:any[],payments:any[]=[]){
 const payroll=reviewedPayrollSchema.parse(Object.fromEntries(Object.keys(reviewedPayrollSchema.shape).map(k=>[k,input[k]])));
 const month=payroll.salaryMonth;
 return {syntheticOnly:true,...input.reviewed,payroll,salaryPeriod:{start:month+'-01',end:new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).toISOString().slice(0,10)},reimbursements:claims.map(c=>({id:c.id,amountCents:Number(c.amount_cents),evidenceId:'captured-claim:'+c.id+':revision:'+c.revision})),payments,correction:null};
}
export function reviewedPreview(input:any,claims:any[]){try{return buildPayrollPreview(monthlyData(input,claims));}catch{return {ok:false as const,code:'PAYSLIP_DATA_BLOCKED',message:'Complete reviewed monthly configuration required'};}}
export function reviewedPaidData(input:any,claims:any[],payments:any[]){return buildPayslipData(monthlyData(input,claims,payments));}

// Narrow publication contract: one positive, explicitly classified same-month correction.
export function reviewedCorrectionData(input:any,claims:any[],payments:any[],prior:any,correctionId:string,evidence:any){
 const data=monthlyData(input,claims,payments);data.correction={id:correctionId,basis:evidence.publication,originalSnapshotHash:prior.snapshotHash,originalSnapshot:prior,originalPayroll:prior.evidence.payrollInput,wageMonth:input.salaryMonth,contributionMonth:input.contributionMonth,reason:evidence.reason,evidenceId:evidence.evidenceId} as any;
 return buildPayslipData(data);
}
