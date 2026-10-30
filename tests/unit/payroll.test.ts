import {describe,it,expect} from 'vitest';import {calculatePayroll,companySdl} from '../../src/modules/payroll/calculate';import type {PayrollInput} from '../../src/modules/payroll/types';
export const base:PayrollInput={salaryMonth:'2026-10',contributionMonth:'2026-10',expectedPaymentDate:'2026-11-02',dob:'1990-01-13',citizenship:'citizen',monthlySalaryCents:400000,bonusCents:0,reimbursementCents:0,unpaidHalfUnits:0,payrollMonthHalfUnits:44,openingAnnualOwSubjectCents:0,projectedAnnualOwSubjectCents:4800000,priorAnnualAwSubjectCents:0,funds:{status:'verified-none',evidenceId:'synthetic-reviewed-exemption'}};
function value(changes:Partial<PayrollInput>={}){const r=calculatePayroll({...base,...changes});if(!r.ok)throw new Error(r.message);return r.value;}
describe('independently derived 2026 CPF table fixtures (SGD cents)',()=>{
 it('4000 wages plus reimbursement keeps CPF unchanged',()=>expect(value({reimbursementCents:10000})).toMatchObject({employeeCpfCents:80000,employerCpfCents:68000,netWagesCents:320000,bankTransferCents:330000,sdlCents:1000}));
 it.each([[5000,0,0],[5001,0,900],[50000,0,8500],[60000,6000,10200],[75000,15000,12800],[75001,15000,12800],[900000,160000,136000]])('wage %i employee %i employer %i',(w,e,r)=>expect(value({monthlySalaryCents:w})).toMatchObject({employeeCpfCents:e,employerCpfCents:r}));
 it.each([['1971-01-13',72000,64000],['1966-01-13',50000,50000],['1961-01-13',30000,36000],['1951-01-13',20000,30000]])('age band %s',(dob,e,r)=>expect(value({dob})).toMatchObject({employeeCpfCents:e,employerCpfCents:r}));
 it('age transition takes effect the month after birthday',()=>{expect(value({dob:'1971-10-01'}).employeeCpfCents).toBe(80000);expect(value({dob:'1971-10-01',salaryMonth:'2026-11',contributionMonth:'2026-11',payrollMonthHalfUnits:42,expectedPaymentDate:'2026-12-01'}).employeeCpfCents).toBe(72000);});
 it('OW and AW are combined before rounding',()=>expect(value({monthlySalaryCents:100050,bonusCents:100})).toMatchObject({employeeCpfCents:20000,employerCpfCents:17100}));
 it('AW ceiling uses annual OW and previously subject AW',()=>expect(value({monthlySalaryCents:0,bonusCents:5500000,projectedAnnualOwSubjectCents:5400000,priorAnnualAwSubjectCents:4500000})).toMatchObject({awSubjectCents:300000,employeeCpfCents:60000,employerCpfCents:51000}));
 it('excluded AW still determines the total wage band (CPF example 16)',()=>expect(value({monthlySalaryCents:50000,bonusCents:200000,projectedAnnualOwSubjectCents:9600000,priorAnnualAwSubjectCents:600000})).toMatchObject({employeeCpfCents:10000,employerCpfCents:8500}));
 it('whole and half unpaid days use payroll days including holiday',()=>{expect(value({monthlySalaryCents:440000,unpaidHalfUnits:2}).grossWagesCents).toBe(420000);expect(value({monthlySalaryCents:440000,unpaidHalfUnits:1}).grossWagesCents).toBe(430000);});
 it('SDL sums employee amounts before company floor',()=>expect(companySdl([250000,400000])).toEqual({ok:true,value:1600}));
 it('zero wages has zero SDL',()=>expect(value({monthlySalaryCents:0}).sdlCents).toBe(0));
 it.each([{citizenship:'pr'},{salaryMonth:'2027-01',contributionMonth:'2027-01'},{funds:{status:'unresolved',evidenceId:''}},{monthlySalaryCents:0.1},{unpaidHalfUnits:45},{dob:'2026-02-30'}] as Partial<PayrollInput>[])('unsupported profile/input blocks',c=>expect(calculatePayroll({...base,...c})).toMatchObject({ok:false}));
});

it.each([40,42,46])('October rejects an incorrect denominator %i',n=>expect(calculatePayroll({...base,payrollMonthHalfUnits:n})).toMatchObject({ok:false}));
it('February binds its denominator to 40 weekday half-units',()=>expect(calculatePayroll({...base,salaryMonth:'2026-02',contributionMonth:'2026-02',expectedPaymentDate:'2026-03-02',payrollMonthHalfUnits:40})).toMatchObject({ok:true}));

it('rounds final earned wages before deriving residual deduction at the half-cent CPF boundary',()=>expect(value({monthlySalaryCents:354046,unpaidHalfUnits:1})).toMatchObject({grossWagesCents:346000,unpaidDeductionCents:8046,employeeCpfCents:69200,employerCpfCents:58800}));
it('rejects annual OW projection below current subject OW',()=>expect(calculatePayroll({...base,monthlySalaryCents:800000,bonusCents:10000000,projectedAnnualOwSubjectCents:0})).toMatchObject({ok:false}));
it('rejects annual OW projection below known opening plus current subject OW',()=>expect(calculatePayroll({...base,monthlySalaryCents:800000,openingAnnualOwSubjectCents:7000000,projectedAnnualOwSubjectCents:7500000} as PayrollInput)).toMatchObject({ok:false}));

it('accepts annual OW equal to known opening plus current subject OW',()=>expect(calculatePayroll({...base,monthlySalaryCents:800000,openingAnnualOwSubjectCents:7000000,projectedAnnualOwSubjectCents:7800000})).toMatchObject({ok:true}));
it('rejects impossible opening history for the elapsed months',()=>expect(calculatePayroll({...base,openingAnnualOwSubjectCents:7200001,projectedAnnualOwSubjectCents:9600000})).toMatchObject({ok:false}));
it('missing annual OW opening history never defaults to zero',()=>{const missing=JSON.parse(JSON.stringify(base));delete missing.openingAnnualOwSubjectCents;expect(calculatePayroll(missing)).toMatchObject({ok:false});});
