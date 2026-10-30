import {consumeDraftIntents} from './payroll-drafts';
import {readFile} from 'node:fs/promises';import {Pool} from 'pg';
import {readConfig} from '../server/config';import {prepareDatabase} from '../server/db';
import {readSchedule} from './config';import {enqueueDueDrafts} from './scheduler';import {runSchedulerLoop} from './loop';

async function main(){
 const config=readConfig(process.env);
 const file=process.argv[2];if(!file)throw new Error('Provide a persistent local schedule JSON path');
 // A disabled file cannot start a worker. Re-read only on explicit restart.
 const schedule=readSchedule(JSON.parse(await readFile(file,'utf8')));
 if(!schedule.enabled)throw new Error('Schedule is disabled; no worker started');
 const pool=new Pool({connectionString:config.databaseUrl,connectionTimeoutMillis:3000,lock_timeout:2000,statement_timeout:4000,query_timeout:5000});const stop=new AbortController();
 const shutdown=()=>stop.abort();process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
 try{
  await prepareDatabase(pool,config);
  await runSchedulerLoop(async()=>{
   const result=await enqueueDueDrafts(pool,new Date().toISOString(),schedule.companyId,schedule.salaryMonths,schedule.calendars,config.environment);
   if(!result.ok)throw new Error(result.code+': '+result.message);
   if(schedule.payrollActorEmployeeId){const consumed=await consumeDraftIntents(pool,schedule.companyId,schedule.payrollActorEmployeeId,config.environment);if(!consumed.ok)throw new Error(consumed.code);}
   console.log(JSON.stringify({event:'draft-intent-tick',created:result.value.length,at:new Date().toISOString()}));
  },stop.signal,()=>{console.error('Draft scheduler tick failed; no payment or email action. Retry after one minute.');});
 }finally{process.removeListener('SIGINT',shutdown);process.removeListener('SIGTERM',shutdown);await pool.end();}
}
main().catch(()=>{console.error('Development scheduler refused startup. Check local configuration, calendar and database identity.');process.exitCode=1;});
