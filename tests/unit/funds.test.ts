import {expect,it} from 'vitest';
import {calculateFunds} from '../../src/modules/payroll/funds';
const all=['CDAC','ECF','MBMF','SINDA'] as const;
export function selections(selected:string[]=['CDAC']){return {status:'configured' as const,employeeId:'synthetic-employee',employerId:'synthetic-employer',records:all.map(fund=>({fund,mode:selected.includes(fund)?'standard':'not-applicable',evidenceId:'synthetic-'+fund,verified:true,effectiveFrom:'2026-01',effectiveTo:'2026-12'}))};}
const val=(x:any)=>{expect(x.ok).toBe(true);return x.value;};
it.each([
 ['CDAC',200000,50],['CDAC',200001,100],['CDAC',350000,100],['CDAC',350001,150],['CDAC',500001,200],['CDAC',750001,300],
 ['ECF',100000,200],['ECF',100001,400],['ECF',150001,600],['ECF',250001,900],['ECF',400001,1200],['ECF',700001,1600],['ECF',1000001,2000],
 ['MBMF',100000,300],['MBMF',100001,450],['MBMF',200001,650],['MBMF',300001,1500],['MBMF',400001,1950],['MBMF',600001,2200],['MBMF',800001,2400],['MBMF',1000001,2600],
 ['SINDA',100000,100],['SINDA',100001,300],['SINDA',150001,500],['SINDA',250001,700],['SINDA',450001,900],['SINDA',750001,1200],['SINDA',1000001,1800],['SINDA',1500001,3000],
])('uses full wages and correct band for %s at %i',(f,w,c)=>expect(val(calculateFunds('2026-10',w,selections([f]))).totalCents).toBe(c));
it('keeps simultaneous MBMF and community-fund deductions',()=>expect(val(calculateFunds('2026-10',400000,selections(['CDAC','MBMF'])))).toMatchObject({totalCents:1650,ruleId:'sg-shg-2026-reviewed-2026-10-23'}));
it('requires all four applicability decisions; never defaults omitted to none',()=>{const s=selections();s.records.pop();expect(calculateFunds('2026-10',400000,s)).toMatchObject({ok:false});});
it.each(['unresolved','custom','opt-out'])('blocks unsupported or unevidenced %s',mode=>{const s=selections();s.records[0].mode=mode;expect(calculateFunds('2026-10',400000,s)).toMatchObject({ok:false});});
it('opt out requires the fund-specific processed evidence and effective period',()=>{const s:any=selections();s.records[0]={...s.records[0],mode:'opt-out',authority:'CDAC',procedure:'submitted-prescribed-form',coverage:'full-fund',documentHash:'a'.repeat(64)};expect(val(calculateFunds('2026-10',400000,s)).totalCents).toBe(0);s.records[0].authority='MUIS';expect(calculateFunds('2026-10',400000,s)).toMatchObject({ok:false});});
it('blocks expired/unverified/duplicate settings, zero-wage unresolved policy and unsupported year',()=>{for(const patch of [{effectiveTo:'2026-09'},{verified:false},{evidenceId:''},{fund:'ECF'}]){const s:any=selections();Object.assign(s.records[0],patch);expect(calculateFunds('2026-10',400000,s)).toMatchObject({ok:false});}expect(calculateFunds('2027-01',400000,selections())).toMatchObject({ok:false});expect(calculateFunds('2026-10',0,selections())).toMatchObject({ok:false});});
import {calculatePayroll} from '../../src/modules/payroll/calculate';
const payroll={employeeId:'synthetic-employee',employerId:'synthetic-employer',salaryMonth:'2026-10',contributionMonth:'2026-10',expectedPaymentDate:'2026-11-02',dob:'1990-01-13',citizenship:'citizen' as const,monthlySalaryCents:400000,bonusCents:0,reimbursementCents:10000,unpaidHalfUnits:0,payrollMonthHalfUnits:44,openingAnnualOwSubjectCents:0,projectedAnnualOwSubjectCents:4800000,priorAnnualAwSubjectCents:0};
it('deducts configured funds from net wages, excludes reimbursement and preserves CPF',()=>expect(val(calculatePayroll({...payroll,funds:selections(['CDAC','MBMF'])} as any))).toMatchObject({employeeCpfCents:80000,employerCpfCents:68000,fundDeductionCents:1650,netWagesCents:318350,bankTransferCents:328350,livePayrollAllowed:false}));
it('bonus crossing a fund band is assessed on uncapped monthly wages',()=>expect(val(calculatePayroll({...payroll,bonusCents:500000,funds:selections(['CDAC'])} as any))).toMatchObject({fundDeductionCents:300}));
it('rejects evidence belonging to another employee or employer',()=>{for(const field of ['employeeId','employerId']){const f:any=selections();f[field]='someone-else';expect(calculatePayroll({...payroll,employeeId:'synthetic-employee',employerId:'synthetic-employer',funds:f} as any)).toMatchObject({ok:false});}});
it('blocks unresolved ECF very-low wages and unprocessed opt-out documents',()=>{expect(calculateFunds('2026-10',20000,selections(['ECF']))).toMatchObject({ok:false});const s:any=selections();s.records[0]={...s.records[0],mode:'opt-out',authority:'CDAC',documentHash:'a'.repeat(64)};expect(calculateFunds('2026-10',400000,s)).toMatchObject({ok:false});});
it.each([
 ['CDAC',200000,50,100],['CDAC',350000,100,150],['CDAC',500000,150,200],['CDAC',750000,200,300],
 ['ECF',100000,200,400],['ECF',150000,400,600],['ECF',250000,600,900],['ECF',400000,900,1200],['ECF',700000,1200,1600],['ECF',1000000,1600,2000],
 ['MBMF',100000,300,450],['MBMF',200000,450,650],['MBMF',300000,650,1500],['MBMF',400000,1500,1950],['MBMF',600000,1950,2200],['MBMF',800000,2200,2400],['MBMF',1000000,2400,2600],
 ['SINDA',100000,100,300],['SINDA',150000,300,500],['SINDA',250000,500,700],['SINDA',450000,700,900],['SINDA',750000,900,1200],['SINDA',1000000,1200,1800],['SINDA',1500000,1800,3000]
])('independent %s boundary %i includes b-1 and b, advances at b+1',(fund,b,lower,upper)=>{for(const [w,want] of [[b-1,lower],[b,lower],[b+1,upper]])expect(val(calculateFunds('2026-10',w,selections([fund]))).totalCents).toBe(want);});
it('SINDA-only processed opt-out preserves MBMF',()=>{const s:any=selections(['SINDA','MBMF']);Object.assign(s.records[3],{mode:'opt-out',authority:'SINDA',procedure:'processed-digital-notification',coverage:'full-fund',documentHash:'b'.repeat(64)});expect(val(calculateFunds('2026-10',1000000,s)).totalCents).toBe(2400);});
it('CDAC has no positive low-wage CPF exemption',()=>expect(val(calculateFunds('2026-10',5000,selections(['CDAC']))).totalCents).toBe(50));
