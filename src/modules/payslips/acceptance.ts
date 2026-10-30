import {ok,fail} from '../../core/contracts';
import {buildPayslipData} from './data';
import {sumCents} from '../payroll/annual';
import {companySdl} from '../payroll/calculate';
/** Development-only, side-effect-free review pack. Not payroll approval or issuance. */
export function buildAcceptancePack(input:unknown){
 try{
  if(!Array.isArray(input)||input.length!==2)throw Error('Exactly two synthetic employee records required');
  const statements=input.map(i=>{const r=buildPayslipData(i);if(!r.ok)throw Error(r.message);return r.value;});
  const [a,b]=statements;
  if(a.evidence.employeeId===b.evidence.employeeId||a.evidence.employerId!==b.evidence.employerId||a.supplementary.contributionMonth!==b.supplementary.contributionMonth||a.payslip.salaryPeriod.start!==b.payslip.salaryPeriod.start)throw Error('Roster employer/period mismatch');
  const total=(f:(s:typeof a)=>number)=>sumCents(statements.map(f));
  const sdl=companySdl(statements.map(s=>sumCents([s.supplementary.actualOwCents,s.supplementary.actualAwCents])));if(!sdl.ok)throw Error(sdl.message);
  const cpfAssessedCents=total(s=>sumCents([s.payslip.deductions.find(d=>d.code==='employee_cpf')!.amountCents,s.supplementary.employerCpfCents])),fundsAssessedCents=total(s=>sumCents(s.payslip.deductions.filter(d=>['CDAC','ECF','MBMF','SINDA'].includes(d.code)).map(d=>d.amountCents))),bankTransferDueCents=total(s=>sumCents([s.supplementary.netWagesDueCents,s.supplementary.reimbursementDueCents]));
  return ok({purpose:'SYNTHETIC STATUTORY ACCEPTANCE PACK',readyForProfessionalReview:true,livePayrollAllowed:false as const,actualIssued:false as const,company:{netWagesDueCents:total(s=>s.supplementary.netWagesDueCents),bankTransferDueCents,cpfAssessedCents,fundsAssessedCents,sdlPayableCents:sdl.value,totalFundingRequirementCents:sumCents([bankTransferDueCents,cpfAssessedCents,fundsAssessedCents,sdl.value])},statements});
 }catch(e){return fail('ACCEPTANCE_PACK_BLOCKED',e instanceof Error?e.message:'Invalid acceptance roster');}
}
