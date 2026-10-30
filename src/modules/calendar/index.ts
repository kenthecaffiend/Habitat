import {ok,fail,type Result} from '../../core/contracts';
import type {WorkCalendar,LeaveRange} from './types';
const DAY=86400000;
export function parseDate(value:string):Date{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('Invalid ISO date');
 const d=new Date(value+'T00:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value)throw new Error('Invalid date');return d;
}
function iso(d:Date){return d.toISOString().slice(0,10);}
function shift(d:Date,n:number){return new Date(d.getTime()+n*DAY);}
function calendar(d:Date,calendars:WorkCalendar[]){
 const found=calendars.filter(c=>c.year===d.getUTCFullYear());
 if(found.length!==1)throw new Error('Exactly one verified calendar required for '+d.getUTCFullYear());
 const c=found[0];
 if(!c.verifiedSource||!c.verifiedAt||c.workingWeekdays.join(',')!=='1,2,3,4,5')throw new Error('Unverified or unsupported work calendar');
 parseDate(c.verifiedAt);
 for(const h of c.holidays)if(parseDate(h).getUTCFullYear()!==c.year)throw new Error('Holiday year mismatch');
 return c;
}
function working(d:Date,cs:WorkCalendar[],excludeHolidays:boolean){const c=calendar(d,cs);return c.workingWeekdays.includes(d.getUTCDay())&&(!excludeHolidays||!c.holidays.includes(iso(d)));}
function monthStart(m:string){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(m))throw new Error('Invalid month');return parseDate(m+'-01');}
function guarded<T>(fn:()=>T):Result<T>{try{return ok(fn());}catch(e){return fail('CALENDAR_BLOCKED',e instanceof Error?e.message:'Invalid calendar input');}}
export function scheduleFor(month:string,calendars:WorkCalendar[]){
 return guarded(()=>{const start=monthStart(month);calendar(start,calendars);const nominal=new Date(start);nominal.setUTCMonth(nominal.getUTCMonth()+1);
  let payday:Date|undefined;
  for(let distance=0;distance<=31&&!payday;distance++){
   const earlier=shift(nominal,-distance);if(working(earlier,calendars,true)){payday=earlier;break;}
   if(distance){const later=shift(nominal,distance);if(working(later,calendars,true))payday=later;}
  }
  if(!payday)throw new Error('No verified payday within 31 days');
  return {payday:iso(payday),draftAt:iso(payday<nominal?payday:nominal)+'T08:00:00+08:00'};
 });
}
export function countPayrollMonthUnits(month:string,calendars:WorkCalendar[]){
 return guarded(()=>{const start=monthStart(month);let units=0;for(let d=start;d.getUTCMonth()===start.getUTCMonth();d=shift(d,1))if(working(d,calendars,false))units+=2;return units;});
}
export function countLeaveUnits(range:LeaveRange,calendars:WorkCalendar[]){
 return guarded(()=>{const start=parseDate(range.start),end=parseDate(range.end);
 if(end<start||end.getTime()-start.getTime()>DAY*732)throw new Error('Invalid leave range');
 const parts=['full','am','pm'];if(!parts.includes(range.startPart)||!parts.includes(range.endPart))throw new Error('Invalid leave part');
 if(range.start===range.end&&range.startPart!==range.endPart)throw new Error('Single-day selection must be full or one matching half');
 let units=0;for(let d=start;d<=end;d=shift(d,1)){
  if(!working(d,calendars,true))continue;
  if(start.getTime()===end.getTime())units+=range.startPart==='full'?2:1;
  else units+=(iso(d)===range.start&&range.startPart==='pm')||(iso(d)===range.end&&range.endPart==='am')?1:2;
 }return units;
 });
}
