import {randomUUID} from 'node:crypto';import type {Pool} from 'pg';import {z} from 'zod';import type {WorkCalendar} from '../modules/calendar/types';import {scheduleFor} from '../modules/calendar';import {ok,fail,type Result} from '../core/contracts';import {withTransaction} from '../server/db';
// Explicit month list is durable configuration, never inferred from last in-memory tick.
export async function enqueueDueDrafts(pool:Pool,now:string,companyId:string,months:readonly string[],calendars:WorkCalendar[],expectedEnvironment:'dev'|'test'='test'):Promise<Result<string[]>>{
 if(!z.uuid().safeParse(companyId).success||!z.iso.datetime({offset:true}).safeParse(now).success)return fail('SCHEDULE_BLOCKED','Invalid company or explicit timestamp');
 const schedules: {month:string;due:string}[]=[];
 for(const month of months){const r=scheduleFor(month,calendars);if(!r.ok)return r;if(new Date(r.value.draftAt)<=new Date(now))schedules.push({month,due:r.value.draftAt});}
 return withTransaction(pool,async tx=>{
  const {rows:[identity]}=await tx.query('SELECT environment FROM environment_identity WHERE id=1');
  if(identity?.environment!==expectedEnvironment)return fail('ENVIRONMENT_BLOCKED','Development scheduler refuses this database');
  const ids:string[]=[];
  for(const s of schedules){const {rows}=await tx.query("INSERT INTO draft_intent(id,company_id,salary_month,job_kind,due_at) VALUES($1,$2,$3,'draft',$4) ON CONFLICT(company_id,salary_month,job_kind) DO NOTHING RETURNING id",[randomUUID(),companyId,s.month,s.due]);ids.push(...rows.map(r=>r.id));}
  return ok(ids);
 });
}
