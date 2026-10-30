import type {Pool} from 'pg';import {z} from 'zod';import {ok,fail} from '../core/contracts';import {withTransaction} from '../server/db';import {createPayrollService} from '../modules/payroll/service';
/** DB-only effects: stable intent ID is the payroll request identity across crash/restart. */
export async function consumeDraftIntents(pool:Pool,companyId:string,actorEmployeeId:string,environment:'dev'|'test',now=new Date().toISOString()){
 if(!['dev','test'].includes(environment)||!z.uuid().safeParse(companyId).success||!z.uuid().safeParse(actorEmployeeId).success||!z.iso.datetime({offset:true}).safeParse(now).success)return fail('INPUT','Explicit company, administrator and timestamp required');
 const binding=await withTransaction(pool,async tx=>{
  if((await tx.query('SELECT environment FROM environment_identity WHERE id=1')).rows[0]?.environment!==environment)return fail('ENVIRONMENT_BLOCKED','Worker identity mismatch');
  const actor=(await tx.query("SELECT id,user_id FROM employee WHERE id=$1 AND role='admin' AND active=true",[actorEmployeeId])).rows[0];if(!actor)return fail('FORBIDDEN','Active configured synthetic administrator required');
  await tx.query('INSERT INTO payroll_scheduler_binding VALUES(1,$1,$2) ON CONFLICT DO NOTHING',[companyId,actorEmployeeId]);const b=(await tx.query('SELECT * FROM payroll_scheduler_binding WHERE id=1')).rows[0];if(b.company_id!==companyId||b.actor_employee_id!==actorEmployeeId)return fail('SCHEDULER_BINDING_CONFLICT','Explicit supervised rebinding required');return ok({employeeId:actor.id,userId:actor.user_id,role:'admin' as const});
 });if(!binding.ok)return binding;
 const pending=(await pool.query("SELECT i.* FROM draft_intent i LEFT JOIN draft_execution e ON e.intent_id=i.id WHERE i.company_id=$1 AND i.due_at<=$2 AND e.run_id IS NULL ORDER BY i.salary_month LIMIT 24",[companyId,now])).rows;
 const payroll=createPayrollService(pool,()=>new Date(now).toLocaleDateString('en-CA',{timeZone:'Asia/Singapore'}));const outcomes=[];
 for(const intent of pending){const r=await payroll.createDraft({actor:binding.value,requestId:intent.id},intent.salary_month);await withTransaction(pool,async tx=>{await tx.query('INSERT INTO draft_execution VALUES($1,$2,$3) ON CONFLICT(intent_id) DO UPDATE SET run_id=COALESCE(draft_execution.run_id,EXCLUDED.run_id),last_error=CASE WHEN draft_execution.run_id IS NOT NULL THEN NULL ELSE EXCLUDED.last_error END',[intent.id,r.ok?r.value:null,r.ok?null:r.code]);await tx.query("UPDATE draft_intent SET status=CASE WHEN (SELECT run_id FROM draft_execution WHERE intent_id=$1) IS NOT NULL THEN 'completed' ELSE 'held' END WHERE id=$1",[intent.id]);});outcomes.push({intentId:intent.id,result:r});}
 return ok(outcomes);
}
