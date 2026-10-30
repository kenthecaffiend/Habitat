const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
/** ASCII-only, bounded response filename; never accepts a path or header fragment. */
export function payslipDownloadName(displayName:string,period:string){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw Error('PAYSLIP_PERIOD');
 const first=displayName.trim().split(/\s+/)[0]??'';
 const safe=first.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9-]/g,'').replace(/^-+|-+$/g,'').slice(0,48)||'Employee';
 return safe+'-'+period.slice(0,4)+'-'+months[Number(period.slice(5))-1]+'-Payslip.pdf';
}
