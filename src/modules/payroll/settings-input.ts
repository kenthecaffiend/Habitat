import {payrollMonthSchema} from './period';
/** Only serializes explicitly selected history; never infers past wages. */
export function previousPayrollMonth(effective:string){const [year,month]=effective.split('-').map(Number);return year&&month>1?`${year}-${String(month-1).padStart(2,'0')}`:'';}
export function paySettingsInput(f:FormData,employeeId:string){
 const get=(k:string)=>String(f.get(k)??''),amount=(k:string)=>{const s=get(k);if(!/^\d+(\.\d{1,2})?$/.test(s))throw Error('Enter a valid SGD amount');return Math.round(Number(s)*100);};
 let opening=null;const effectiveMonth=get('effective');
 if(f.get('useOpening')==='on'){
  const through=get('through');if(!payrollMonthSchema.safeParse(through).success||through.slice(0,4)!==effectiveMonth.slice(0,4)||through>=effectiveMonth)throw Error('Previous payroll totals must end before the settings start month, in the same year. Leave this optional section off for ordinary salary setup.');
  opening={throughMonth:through,owCents:amount('ow'),awCents:amount('aw'),projectedOwCents:amount('projection')};
 }
 const funds=f.get('fundDecision')==='none'?[]:f.getAll('fund');if(f.get('fundDecision')==='selected'&&!funds.length)throw Error('Select the applicable fund or choose none');
 return {kind:'employee',employeeId,effectiveMonth,dob:get('dob'),citizenship:get('citizenship'),salaryCents:amount('salary'),funds,opening};
}
