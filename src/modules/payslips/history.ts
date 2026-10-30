import type {Pool} from 'pg';import type {Actor,Result} from '../../core/contracts';import {ok,fail} from '../../core/contracts';import {withTransaction} from '../../server/db';import {groupPayslips,ownDocuments,previewPayslips,OWNER_HISTORY_PREVIEW} from './history-view';
export function createPayslipHistory(pool:Pool,loadReal:(actor:Actor)=>Promise<Result<any[]>>,realEnabled:boolean,year=()=>Number(new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Singapore'}).slice(0,4))){
 const read=async(a:Actor,id=a.employeeId)=>{
  if(id!==a.employeeId)return fail('FORBIDDEN','Your own payslips only');
  const proof=await withTransaction(pool,async tx=>{const e=(await tx.query('SELECT e.id,i.environment FROM employee e CROSS JOIN environment_identity i WHERE i.id=1 AND e.id=$1 AND e.user_id=$2 AND e.role=$3 AND e.active',[a.employeeId,a.userId,a.role])).rows[0];if(!e||!['dev','test','actual-test'].includes(e.environment))return null;let preview=false;if(OWNER_HISTORY_PREVIEW&&e.environment==='actual-test'&&(await tx.query("SELECT to_regclass('public.employee_source_binding') AS name")).rows[0]?.name)preview=!!(await tx.query("SELECT 1 FROM employee_source_binding WHERE employee_id=$1 AND slot='owner' AND source_system='AIMM'",[a.employeeId])).rowCount;return {preview};});
  if(!proof)return fail('FORBIDDEN','Active employee required');const real=realEnabled?await loadReal(a):ok([]);if(!real.ok)return real;
  const documents=ownDocuments(real.value,a.employeeId),previews=proof.preview?previewPayslips(year()).filter(p=>!documents.some(d=>d.period===p.period)):[];
  return ok({years:groupPayslips([...documents,...previews]),previewCount:previews.length,documentCount:documents.length});
 };return {read};
}
