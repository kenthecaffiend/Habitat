import {randomUUID} from 'node:crypto';import {createPayrollService} from '../../src/modules/payroll/service';import {createLeaveService} from '../../src/modules/leave/service';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawn,type ChildProcess} from 'node:child_process';import {once} from 'node:events';import assert from 'node:assert/strict';
import {disposablePostgres} from '../helpers/postgres';
const db=await disposablePostgres();const folder=await mkdtemp(join(tmpdir(),'hr-worker-smoke-'));const file=join(folder,'schedule.json');
const env={...process.env,APP_ENV:'test',DATABASE_URL:db.url,APP_ORIGIN:'http://127.0.0.1:3130',SESSION_SECRET:'synthetic-worker-only-secret-long-enough',MAIL_TRANSPORT:'capture',STORAGE_ENV:'test'};
async function stopBounded(child:ChildProcess){
 if(child.exitCode!==null||child.signalCode!==null)return;
 const exited=once(child,'exit');let exceeded=false;
 const deadline=setTimeout(()=>{exceeded=true;child.kill('SIGKILL');},3500);
 child.kill('SIGTERM');
 try{await exited;}finally{clearTimeout(deadline);}
 assert.equal(exceeded,false,'Worker exceeded bounded shutdown while DB lock held');
}
async function blockedShutdown(kind:'startup'|'tick'){
 const lock=await db.pool.connect();let child:ChildProcess|undefined;
 try{
  if(kind==='startup')await lock.query('SELECT pg_advisory_lock(7219301)');
  else {await lock.query('BEGIN');await lock.query('LOCK TABLE draft_intent IN ACCESS EXCLUSIVE MODE');}
  child=spawn(process.execPath,['--import','tsx','src/worker/main.ts',file],{env,stdio:'ignore'});
  let waiting=false;for(let i=0;i<100;i++){
   const r=await db.pool.query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE $1",[kind==='startup'?'%pg_advisory_xact_lock%':'%INSERT INTO draft_intent%']);
   if(r.rowCount){waiting=true;break;}await new Promise(r=>setTimeout(r,20));
  }
  assert(waiting,'Expected worker waiting on '+kind+' database lock');
  await stopBounded(child);
 }finally{if(child&&child.exitCode===null&&child.signalCode===null)await stopBounded(child);if(kind==='startup')await lock.query('SELECT pg_advisory_unlock(7219301)');else await lock.query('ROLLBACK');lock.release();}
}
async function onceThroughExecutable(){
 const child=spawn(process.execPath,['--import','tsx','src/worker/main.ts',file],{env,stdio:['ignore','pipe','pipe']});
 let output='';child.stdout?.on('data',d=>{output+=String(d);});child.stderr?.on('data',()=>{});
 try{
  let tick=false;for(let i=0;i<100;i++){if(output.includes('draft-intent-tick')){tick=true;break;}if(child.exitCode!==null)break;await new Promise(r=>setTimeout(r,50));}
  assert(tick,'Executable did not complete a tick');
  return JSON.parse(output.trim().split('\n')[0]).created as number;
 }finally{await stopBounded(child);assert.equal(child.exitCode,0,'Graceful shutdown failed');}
}
try{
 await writeFile(file,JSON.stringify({enabled:true,companyId:'00000000-0000-4000-8000-000000000010',salaryMonths:['2026-01'],profile:{workingWeekdays:[1,2,3,4,5],restDay:0}}));
 assert.equal(await onceThroughExecutable(),1);
 assert.equal(await onceThroughExecutable(),0);
 assert.equal((await db.pool.query('SELECT * FROM draft_intent')).rowCount,1);
 const actor={userId:randomUUID(),employeeId:randomUUID(),role:'admin' as const};await db.pool.query('INSERT INTO "user"(id,name,email) VALUES($1,$1,$2)',[actor.userId,actor.userId+'@example.invalid']);await db.pool.query('INSERT INTO employee(id,user_id,role) VALUES($1,$2,$3)',[actor.employeeId,actor.userId,actor.role]);
 assert((await createLeaveService(db.pool).configureProfile({actor,requestId:randomUUID()},{employeeId:actor.employeeId,continuing:true,eligibleSince:'2025-01-01',verifiedEvidence:'Synthetic worker fixture',workingWeekdays:[1,2,3,4,5],restDay:0})).ok);
 assert((await createPayrollService(db.pool).configureProfile({actor,requestId:randomUUID()},{employeeId:actor.employeeId,effectiveMonth:'2026-01',syntheticOnly:true,dob:'1990-01-13',citizenship:'citizen',monthlySalaryCents:400000,openingAnnualOwSubjectCents:0,projectedAnnualOwSubjectCents:4800000,priorAnnualAwSubjectCents:0,funds:{status:'verified-none',evidenceId:'Synthetic worker fixture'}})).ok);
 await writeFile(file,JSON.stringify({enabled:true,companyId:'00000000-0000-4000-8000-000000000010',payrollActorEmployeeId:actor.employeeId,salaryMonths:['2026-01'],profile:{workingWeekdays:[1,2,3,4,5],restDay:0}}));
 assert.equal(await onceThroughExecutable(),0);assert.equal(await onceThroughExecutable(),0);assert.equal((await db.pool.query('SELECT * FROM payroll_run')).rowCount,1);assert.equal((await db.pool.query('SELECT status FROM draft_intent')).rows[0].status,'completed');

 await blockedShutdown('startup');
 await blockedShutdown('tick');
 console.log('Worker executable smoke passed: persistent file, catch-up, graceful stop, restart deduplication, bounded shutdown under DB lock.');
}finally{await db.stop();await rm(folder,{recursive:true,force:true});}
