import type {Pool} from 'pg';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {ok,fail,type Actor,type AuditContext,type Result} from '../../core/contracts';
import {withTransaction,appendAudit} from '../../server/db';
const reviewSchema=z.object({employeeId:z.uuid(),caseKey:z.uuid(),expectedRevision:z.number().int().positive(),outcome:z.enum(['retain-original','keep-held']),evidence:z.string().trim().min(1).max(2000),reason:z.string().trim().min(1).max(2000)});
export function createLeaveReviewService(pool:Pool){
 const readProfile=async(actor:Actor,id:string)=>{
  if(actor.role!=='admin')return fail('FORBIDDEN','Administrator required');
  if(!z.uuid().safeParse(id).success)return fail('INPUT','Invalid employee');
  const {rows:[row]}=await pool.query('SELECT input,verified_by FROM leave_profile WHERE employee_id=$1',[id]);return ok(row??null);
 };
 const listHolds=async(actor:Actor,id:string)=>{
  if(actor.role!=='admin')return fail('FORBIDDEN','Administrator required');
  if(!z.uuid().safeParse(id).success)return fail('INPUT','Invalid employee');
  return ok((await pool.query('SELECT month,request_key,reason,mode,source_request_id,source_revision,source_snapshot,proposal,revision,resolved_at,reviewed_by,evidence,review_reason FROM leave_payroll_hold WHERE employee_id=$1 ORDER BY request_key,month',[id])).rows);
 };
 const reviewHold=async(context:AuditContext,input:unknown):Promise<Result<void>>=>{
  if(context.actor.role!=='admin')return fail('FORBIDDEN','Administrator required');
  const parsed=reviewSchema.safeParse(input);if(!parsed.success)return fail('INPUT','Verified evidence and a review reason are required');
  const data=parsed.data,hash=createHash('sha256').update(JSON.stringify(data)).digest('hex');
  return withTransaction(pool,async tx=>{
   if(!(await tx.query('SELECT id FROM employee WHERE id=$1 AND active=true FOR UPDATE',[data.employeeId])).rowCount)return fail('FORBIDDEN','Employee unavailable');
   const {rows:[receipt]}=await tx.query('SELECT fingerprint FROM leave_review_receipt WHERE actor_id=$1 AND request_key=$2',[context.actor.userId,context.requestId]);
   if(receipt)return receipt.fingerprint===hash?ok(undefined):fail('IDEMPOTENCY_CONFLICT','Retry payload changed');
   const {rows}=await tx.query('SELECT * FROM leave_payroll_hold WHERE employee_id=$1 AND request_key=$2 FOR UPDATE',[data.employeeId,data.caseKey]);
   if(!rows.length)return fail('NOT_FOUND','Review case not found');
   if(rows.some(r=>r.revision!==data.expectedRevision||r.resolved_at))return fail('REVISION_CONFLICT','Review case changed; refresh first');
   if(data.outcome==='retain-original'){
    if(rows.some(r=>r.mode!=='retain-original-only'||!r.source_request_id||!r.source_snapshot))return fail('CORRECTION_REQUIRED','This case requires a verified correction workflow; payroll remains held');
    for(const row of rows){const {rows:[source]}=await tx.query('SELECT revision FROM leave_request WHERE id=$1 AND employee_id=$2',[row.source_request_id,data.employeeId]);if(!source||source.revision!==row.source_revision)return fail('SOURCE_CHANGED','Original request changed; payroll remains held');}
   }
   await tx.query("UPDATE leave_payroll_hold SET revision=revision+1,reviewed_by=$3,evidence=$4,review_reason=$5,resolved_at=CASE WHEN $6='retain-original' THEN clock_timestamp() ELSE NULL END WHERE employee_id=$1 AND request_key=$2",[data.employeeId,data.caseKey,context.actor.userId,data.evidence,data.reason,data.outcome]);
   await tx.query('INSERT INTO leave_review_receipt VALUES($1,$2,$3)',[context.actor.userId,context.requestId,hash]);
   await appendAudit(tx,{context:{...context,reason:data.reason},entityId:data.caseKey,action:'leave.review.'+(context.actor.employeeId===data.employeeId?'self-':'')+data.outcome});
   return ok(undefined);
  });
 };
 return {readProfile,listHolds,reviewHold};
}
