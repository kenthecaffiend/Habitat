import type {FundSettings} from './funds';
export type PayrollInput={
 employeeId?:string;employerId?:string;salaryMonth:string;contributionMonth:string;expectedPaymentDate:string;dob:string;citizenship:'citizen'|'pr'|'other';
 monthlySalaryCents:number;bonusCents:number;reimbursementCents:number;unpaidHalfUnits:number;payrollMonthHalfUnits:number;
 /** Subject OW in earlier contribution months of this same year; excludes current month. */
 openingAnnualOwSubjectCents:number|null;projectedAnnualOwSubjectCents:number|null;
 /** Earlier contribution months only, excluding all current-month AW; January must be zero. */
 priorAnnualAwSubjectCents:number|null;
 funds:{status:'verified-none'|'unresolved';evidenceId:string}|FundSettings;
};
export type PayrollCalculation={purpose:"development-preview";livePayrollAllowed:false;grossWagesCents:number;unpaidDeductionCents:number;owSubjectCents:number;awSubjectCents:number;employeeCpfCents:number;employerCpfCents:number;fundDeductionCents:number;fundDeductions:{fund:string;amountCents:number;mode:string;evidenceId:string}[];netWagesCents:number;reimbursementCents:number;bankTransferCents:number;sdlCents:number;sdlUnroundedCents:string;ruleId:string;reviewFlags:string[]};
