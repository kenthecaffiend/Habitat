import {join} from 'node:path';import type {Pool,PoolClient} from 'pg';import {readFile} from 'node:fs/promises';import {randomUUID} from 'node:crypto';import type {Config} from '../config';import type {AuditContext} from '../../core/contracts';
export type DbTx=PoolClient;
export async function withTransaction<T>(pool:Pool,fn:(tx:DbTx)=>Promise<T>):Promise<T>{const c=await pool.connect();try{await c.query('BEGIN');if((await c.query("SELECT to_regclass('public.recovery_quarantine') AS name")).rows[0].name)throw new Error('RECOVERY_QUARANTINE: restored target is inspection-only');const v=await fn(c);await c.query('COMMIT');return v;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
export type AuditEvent={context:AuditContext;action:string;entityId:string};
export async function appendAudit(tx:DbTx,event:AuditEvent){await tx.query('INSERT INTO audit_event(id,actor_user_id,request_id,action,entity_id,reason) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),event.context.actor.userId,event.context.requestId,event.action,event.entityId,event.context.reason??null]);}
export async function prepareDatabase(pool:Pool,config:Config){
 if(config.environment==='actual-test')return withTransaction(pool,async tx=>{
  const identity=(await tx.query('SELECT current_database() AS database,environment FROM environment_identity WHERE id=1')).rows;
  if(identity.length!==1||identity[0].database!=='hr_actual_test'||identity[0].environment!=='actual-test')throw Error('ACTUAL_DRAFT_IDENTITY');
  if(config.passwordChangeEnabled&&!(await tx.query("SELECT has_column_privilege(current_user,'public.account','password','UPDATE') AND has_column_privilege(current_user,'public.account','updated_at','UPDATE') AS allowed")).rows[0]?.allowed)throw Error('PASSWORD_CHANGE_PERMISSION');
  if('actualBookkeeping' in config&&config.actualBookkeeping){const b=(await tx.query('SELECT version,draft_management FROM bookkeeping_schema WHERE id=1')).rows[0];if(b?.version!==1||b?.draft_management!==true)throw Error('BOOKKEEPING_SCHEMA');}
  const versions=(await tx.query('SELECT version FROM schema_migration ORDER BY version')).rows.map(r=>r.version);
  if('actualWorkflows' in config&&config.actualWorkflows){if((await tx.query('SELECT version FROM workflow_restoration_schema WHERE id=1')).rows[0]?.version!==1||(await tx.query('SELECT version FROM medical_file_schema WHERE id=1')).rows[0]?.version!==1)throw Error('ACTUAL_WORKFLOW_SCHEMA');}
  if(versions.length!==19||versions.some((v,i)=>v!==i+1))throw Error('ACTUAL_DRAFT_SCHEMA');if((await tx.query('SELECT version FROM actual_source_schema WHERE id=1')).rows[0]?.version!==1)throw Error('ACTUAL_SOURCE_SCHEMA');if((await tx.query('SELECT version FROM employee_profile_schema WHERE id=1')).rows[0]?.version!==1)throw Error('EMPLOYEE_PROFILE_SCHEMA');if((await tx.query('SELECT version FROM saved_payroll_schema WHERE id=1')).rows[0]?.version!==1)throw Error('SAVED_PAYROLL_SCHEMA');
 });
 if(config.environment==='prod'||('syntheticPreview' in config&&config.syntheticPreview))return withTransaction(pool,async tx=>{
  const identity=(await tx.query('SELECT environment FROM environment_identity WHERE id=1')).rows;
  if(identity.length!==1||identity[0].environment!==(config.environment==='prod'?'prod':'test'))throw Error('PRODUCTION_IDENTITY');
  const versions=(await tx.query('SELECT version FROM schema_migration ORDER BY version')).rows.map(r=>r.version);
  if(versions.length!==(config.environment==='prod'?17:19)||versions.some((v,i)=>v!==i+1))throw Error('PRODUCTION_SCHEMA');
  if(config.environment!=='prod'&&(await tx.query('SELECT version FROM medical_file_schema WHERE id=1')).rows[0]?.version!==1)throw Error('MEDICAL_SCHEMA');
  if(config.environment!=='prod'&&(await tx.query('SELECT version FROM employee_profile_schema WHERE id=1')).rows[0]?.version!==1)throw Error('EMPLOYEE_PROFILE_SCHEMA');
  for(const name of ['user','employee','bootstrap_state','payroll_profile','payroll_entry','payslip_pdf','private_receipt_store'])if(!(await tx.query('SELECT to_regclass($1) AS name',['public.'+name])).rows[0].name)throw Error('PRODUCTION_SCHEMA');
 });
 const migrations=['0001-foundation.sql','0002-leave.sql','0003-claims.sql','0004-leave-review.sql','0005-leave-hold-commands.sql','0006-payroll-simulation.sql','0007-payroll-resolution.sql','0008-synthetic-delivery.sql','0009-synthetic-imports.sql','0010-private-receipt-files.sql','0011-receipt-store-lifecycle.sql','0012-synthetic-upload-gate.sql','0013-synthetic-pdf.sql','0014-pdf-capture.sql','0015-administrative-paid-status.sql','0016-payment-date-confirmation.sql','0017-employee-directory.sql','0018-branding.sql','0019-leave-submission-time.sql','0020-medical-files.sql','0021-current-employee-profile.sql','0022-saved-payroll.sql','0023-workflow-restoration.sql'];
 await withTransaction(pool,async tx=>{
  await tx.query('SELECT pg_advisory_xact_lock(7219301)');
  const {rows:[exists]}=await tx.query("SELECT to_regclass('public.environment_identity') AS name");
  if(exists.name){const {rows:[identity]}=await tx.query('SELECT environment FROM environment_identity WHERE id=1');if(identity?.environment!==config.environment)throw new Error('Database identity mismatch');}
  else {const {rows}=await tx.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");if(rows.length)throw new Error('Unidentified nonempty database refused');await tx.query('CREATE TABLE environment_identity(id integer PRIMARY KEY CHECK(id=1),environment text NOT NULL)');await tx.query('INSERT INTO environment_identity VALUES(1,$1)',[config.environment]);}
  await tx.query('CREATE TABLE IF NOT EXISTS schema_migration(version integer PRIMARY KEY)');
  for(const [index,file] of migrations.entries()){const version=index+1;const applied=await tx.query('SELECT version FROM schema_migration WHERE version=$1',[version]);if(!applied.rowCount){await tx.query(await readFile(join(process.cwd(),'db/migrations',file),'utf8'));await tx.query('INSERT INTO schema_migration VALUES($1)',[version]);}}
 });
}
