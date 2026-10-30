import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createSyntheticReceiptStore} from '../../src/modules/files/synthetic-store';
import {spawn,type ChildProcess} from 'node:child_process';import {createServer} from 'node:net';import {once} from 'node:events';import {randomBytes} from 'node:crypto';
import {disposablePostgres} from './postgres';import {createApplication} from '../../src/server/application';import {readConfig} from '../../src/server/config';

export async function localApp(environment:'dev'|'test',syntheticReceipts=false){
 const db=await disposablePostgres(environment);let child:ChildProcess|undefined;let output='';let receiptParent:string|undefined;
 const stop=async()=>{if(child&&child.exitCode===null){const exited=once(child,'exit');child.kill('SIGTERM');await exited;}await db.stop();if(receiptParent)await rm(receiptParent,{recursive:true,force:true});};
 try{
  const port=await new Promise<number>(resolve=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=(s.address() as {port:number}).port;s.close(()=>resolve(p));});});
  const origin='http://127.0.0.1:'+port;
  const env={...process.env,APP_ENV:environment,DATABASE_URL:db.url,APP_ORIGIN:origin,SESSION_SECRET:randomBytes(32).toString('hex'),MAIL_TRANSPORT:'capture',STORAGE_ENV:environment,NEXT_TELEMETRY_DISABLED:'1'};
  const app=await createApplication(db.pool,readConfig(env));
  const email=environment+'@example.invalid',password='synthetic-browser-password';
  await app.bootstrap({name:'Synthetic '+environment,email,password});
  if(syntheticReceipts){receiptParent=await mkdtemp(join(tmpdir(),'hr-browser-receipts-'));const store=await createSyntheticReceiptStore(db.pool,async()=>{throw Error('Provisioning never converts');},{parentDirectory:receiptParent});Object.assign(env,{HR_SYNTHETIC_UPLOADS:'synthetic-local',HR_RECEIPT_STORE_ID:store.storeId,HR_RECEIPT_PARENT:receiptParent});}
  child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env,stdio:['ignore','pipe','pipe']});
  child.stdout?.on('data',d=>{output=(output+String(d)).slice(-4000);});child.stderr?.on('data',d=>{output=(output+String(d)).slice(-4000);});
  let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(origin+'/login')).status===200;if(ready)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  if(!ready)throw new Error('Synthetic server failed startup: '+output);
  return {db,origin,email,password,stop};
 }catch(error){await stop();throw error;}
}
