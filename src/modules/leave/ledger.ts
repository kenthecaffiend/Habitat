import {z} from 'zod';
import {ok,fail,type Result} from '../../core/contracts';
import {parseDate} from '../calendar';
const date=z.string().refine(value=>{try {parseDate(value);return true;}catch{return false;}});
const slot=z.object({date,part:z.enum(['am','pm'])});
const allocation=slot.extend({requestId:z.string().min(1),year:z.number().int().min(2000).max(9998)});
const adjustment=z.object({kind:z.enum(['annual','sick','hospitalisation']),year:z.number().int().min(2000).max(9998),deltaUnits:z.number().int().min(-732).max(732),effectiveDate:date});
const schema=z.object({today:date,withMedical:z.boolean().optional(),medicalUnverified:z.boolean().optional(),openingDate:date.optional(),medicalOpening:z.object({year:z.number().int(),sickRemainingUnits:z.number().int().min(0).max(28),combinedRemainingUnits:z.number().int().min(0).max(120)}).optional(),adjustments:z.array(adjustment).optional(),buckets:z.array(z.object({year:z.number().int().min(2000).max(9998),units:z.number().int().min(0).max(732)})),history:z.array(allocation),reservations:z.array(allocation).optional(),requests:z.array(z.object({id:z.string().min(1),kind:z.enum(['annual','sick','hospitalisation','unpaid','exceptional-paid','exceptional-unpaid']),state:z.enum(['pending','approved','rejected','cancelled']),slots:z.array(slot).min(1).max(1466)}))});
export type LeaveSlot=z.infer<typeof slot>;
export type Allocation=z.infer<typeof allocation>;
export type LedgerInput=z.infer<typeof schema>;
export type LedgerResult={allocations:Allocation[];remaining:Record<number,number>;medicalRemaining?:Record<number,{sick:number;combined:number}>};
/** Units are half-days. Persisted consumed allocations are immutable; future reservations are rebuilt. */
export function allocateLeave(input:unknown):Result<LedgerResult> {
 const parsed=schema.safeParse(input);if(!parsed.success)return fail('LEAVE_INPUT','Invalid ledger input');
 const {today,buckets,requests,history,openingDate,medicalOpening}=parsed.data;
 if(new Set(buckets.map(b=>b.year)).size!==buckets.length||new Set(requests.map(r=>r.id)).size!==requests.length)return fail('LEAVE_INPUT','Duplicate grant or request');
 if(medicalOpening&&120-medicalOpening.combinedRemainingUnits<28-medicalOpening.sickRemainingUnits)return fail('MEDICAL_OPENING','Combined medical opening contradicts outpatient usage');
 const remaining:Record<number,number>={};for(const b of buckets)remaining[b.year]=b.units;
 const allocations:Allocation[]=[],frozen=new Map<string,Allocation>(),occupied=new Map<string,string>();
 for(const a of history){if(openingDate&&a.date<openingDate)continue;const key=a.date+':'+a.part;if(a.date>=today||frozen.has(key)||remaining[a.year]===undefined||Number(a.date.slice(0,4))<a.year||Number(a.date.slice(0,4))>a.year+1)return fail('LEAVE_HISTORY','Invalid consumed history');frozen.set(key,a);occupied.set(key,a.requestId);}
 // Keep an unchanged future reservation's vintage. New credits change available balance, not old booking allocation.
 for(const a of parsed.data.reservations??[]){if(a.date<today)continue;const r=requests.find(r=>r.id===a.requestId&&r.kind==='annual'&&['pending','approved'].includes(r.state));if(!r?.slots.some(s=>s.date===a.date&&s.part===a.part))continue;const key=a.date+':'+a.part;if(frozen.has(key)||remaining[a.year]===undefined||Number(a.date.slice(0,4))<a.year||Number(a.date.slice(0,4))>a.year+1)return fail('LEAVE_HISTORY','Invalid reserved vintage');frozen.set(key,a);occupied.set(key,a.requestId);}
 const slots=requests.filter(r=>r.state==='pending'||r.state==='approved').flatMap(r=>r.slots.filter(s=>!openingDate||s.date>=openingDate).map(s=>({...s,requestId:r.id,kind:r.kind})));
 for(const a of frozen.values())if(!slots.some(s=>s.requestId===a.requestId&&s.date===a.date&&s.part===a.part))slots.push({...a,kind:'annual'});
 slots.sort((a,b)=>a.date.localeCompare(b.date)||a.part.localeCompare(b.part)||a.requestId.localeCompare(b.requestId));
 const medical=new Map<number,{sick:number;total:number}>(),budgets=new Map<number,{sick:number;total:number}>();
 function medicalYear(year:number){if(!medical.has(year)){const b=medicalOpening?.year===year?{sick:medicalOpening.sickRemainingUnits,total:medicalOpening.combinedRemainingUnits}:{sick:28,total:120};budgets.set(year,b);medical.set(year,{sick:28-b.sick,total:120-b.total});}return medical.get(year)!;}
 if(medicalOpening)medicalYear(medicalOpening.year);if(openingDate||parsed.data.withMedical)medicalYear(Number(today.slice(0,4)));
 const changes=(parsed.data.adjustments??[]).filter(a=>a.effectiveDate<=today).sort((a,b)=>a.effectiveDate.localeCompare(b.effectiveDate));let cursor=0;
 function applyUntil(date:string):Result<undefined>{while(cursor<changes.length&&changes[cursor].effectiveDate<=date){const effective=changes[cursor].effectiveDate;while(cursor<changes.length&&changes[cursor].effectiveDate===effective){const a=changes[cursor++];if(a.kind==='annual'){if(remaining[a.year]===undefined)return fail('LEAVE_BALANCE','Adjustment has no accepted annual vintage');remaining[a.year]+=a.deltaUnits;}else{const used=medicalYear(a.year),budget=budgets.get(a.year)!;if(a.kind==='sick'){budget.sick+=a.deltaUnits;used.sick-=a.deltaUnits;}else{budget.total+=a.deltaUnits;used.total-=a.deltaUnits;}}}
  if(Object.values(remaining).some(n=>n<0||n>732))return fail('LEAVE_BALANCE','Adjustment exceeds available annual balance');for(const [y,b]of budgets){const u=medical.get(y)!;if(b.sick<0||b.sick>28||b.total<0||b.total>120||120-b.total<28-b.sick||u.sick<0||u.total<0||u.sick>28||u.total>120||u.total<u.sick)return fail('MEDICAL_BALANCE','Adjustment contradicts consumed or shared medical allowance');}}
  return ok(undefined);
 }
 const seen=new Set<string>();
 for(const s of slots){const changed=applyUntil(s.date);if(!changed.ok)return changed;const key=s.date+':'+s.part,year=Number(s.date.slice(0,4));if(seen.has(key)||(occupied.has(key)&&occupied.get(key)!==s.requestId))return fail('LEAVE_OVERLAP','An active request already covers this half-day');seen.add(key);occupied.set(key,s.requestId);
  if(!parsed.data.medicalUnverified&&(s.kind==='sick'||s.kind==='hospitalisation')){const m=medicalYear(year);m.total++;if(s.kind==='sick')m.sick++;if(m.sick>28||m.total>120)return fail('MEDICAL_BALANCE','Medical leave exceeds the accepted shared allowance');}
  if(s.kind!=='annual')continue;const saved=frozen.get(key);if(saved){if(saved.requestId!==s.requestId||remaining[saved.year]<=0)return fail('LEAVE_HISTORY','Consumed history exceeds available vintage');remaining[saved.year]--;allocations.push({...saved});continue;}
  const vintage=buckets.map(b=>b.year).sort((a,b)=>a-b).find(y=>y<=year&&year<=y+1&&remaining[y]>0);if(vintage===undefined)return fail('LEAVE_BALANCE','Insufficient eligible annual leave');remaining[vintage]--;allocations.push({requestId:s.requestId,date:s.date,part:s.part,year:vintage});
 }
 const changed=applyUntil(today);if(!changed.ok)return changed;
 return ok({allocations,remaining,...(openingDate||medicalOpening||parsed.data.withMedical?{medicalRemaining:Object.fromEntries([...medical].map(([y,m])=>[y,{sick:28-m.sick,combined:120-m.total}]))}:{})});
}
