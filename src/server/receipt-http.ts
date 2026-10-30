import {validateUpload} from './upload-validator';import {createHash} from 'node:crypto';
import {withTransaction,appendAudit} from './db';
import {previewReceiptConverter} from './preview-receipt-converter';
import type {Pool,PoolClient} from 'pg';import type {Config} from './config';import type {Actor} from '../core/contracts';import {randomUUID} from 'node:crypto';import {z} from 'zod';import {lstat,realpath} from 'node:fs/promises';import {dirname,relative,isAbsolute,sep} from 'node:path';
import {createSyntheticReceiptStore,type Converter} from '../modules/files/synthetic-store';import {RECEIPT_LIMITS as L} from '../modules/files/limits';import {isolatedReceiptConverter} from './receipt-converter';import {PreviewRejected} from '../../ops/documents/outcomes';
class Failure extends Error{constructor(public status:number,public code:string,message:string){super(message);}}
const fail=(status:number,code:string,message:string):never=>{throw new Failure(status,code,message);};
async function streamBody(request:Request){
 const length=request.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>L.uploadBytes))fail(413,'TOO_LARGE','Receipt limit is 20MB.');if(request.headers.get('content-encoding')&&!['identity'].includes(request.headers.get('content-encoding')!))fail(415,'FORMAT','Encoded bodies are unsupported.');
 const reader=request.body?.getReader();if(!reader)fail(400,'INPUT','Receipt bytes required.');let size=0;const chunks:Uint8Array[]=[];let timer:ReturnType<typeof setTimeout>;let abort!:()=>void;
 const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Failure(408,'UPLOAD_TIMEOUT','Upload timed out; retry the same file.')),15000);abort=()=>reject(new Failure(400,'UPLOAD_ABORTED','Upload interrupted.'));request.signal.addEventListener('abort',abort,{once:true});if(request.signal.aborted)abort();});
 try{while(true){const {done,value}=await Promise.race([reader!.read(),deadline]);if(done)break;size+=value.length;if(size>L.uploadBytes)fail(413,'TOO_LARGE','Receipt limit is 20MB.');chunks.push(value);}if(!size||length!==null&&Number(length)!==size)fail(400,'INPUT','Incomplete receipt bytes.');return Buffer.concat(chunks,size);}finally{clearTimeout(timer!);request.signal.removeEventListener('abort',abort);void reader!.cancel().catch(()=>{});}
}
export function createReceiptHttp(pool:Pool,config:Config,converter?:Converter){
 const actual=config.environment==='actual-test'&&config.actualWorkflows===true,setting=actual?config.privateUploads:config.syntheticUploads;
 const privateConverter:Converter=async(bytes,mime,synthetic)=>{if(synthetic)throw Error('ENVIRONMENT');let output:Buffer;try{output=await validateUpload(bytes,mime);}catch{throw new PreviewRejected('decoder','Invalid or oversized receipt image');}const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');return{bytes:output,originalHash:hash(bytes),previewHash:hash(output)};};
 const hosted='syntheticPreview' in config&&config.syntheticPreview===true,convert=converter??(actual?privateConverter:hosted?previewReceiptConverter:async(bytes,mime,synthetic)=>mime==='image/heic'?previewReceiptConverter(bytes,mime,synthetic):isolatedReceiptConverter(bytes,mime,synthetic));
 let processingClient:PoolClient|undefined;
 let store:Awaited<ReturnType<typeof createSyntheticReceiptStore>>|undefined;
 const result=(value:unknown)=>Response.json({ok:true,value},{headers:{'Cache-Control':'no-store'}});
 async function state(){return (await pool.query('SELECT state FROM synthetic_upload_gate WHERE id=1')).rows[0]?.state;}
 async function reopenVerified(actor:Actor,key:string,automatic=false){
  if(!setting)fail(503,'STORAGE','Configured storage is unavailable.');
  const slot=await pool.connect();let locked=false;
  try{locked=(await slot.query('SELECT pg_try_advisory_lock(7219304) AS locked')).rows[0].locked;if(!locked)fail(429,'BUSY','Receipt processing is active; store reopening deferred.');
   if((await slot.query("SELECT to_regclass('public.recovery_quarantine') AS name")).rows[0].name)fail(503,'RECOVERY_QUARANTINE','Restored storage is inspection-only.');
    if(await state()!=='ready')fail(503,'PROCESSING_HELD','Processing needs operator review; no automatic retry.');
    if(actor.role!=='admin')fail(403,'FORBIDDEN','Administrator required.');const row=(await pool.query('SELECT root FROM private_receipt_store WHERE id=$1',[setting!.storeId])).rows[0];if(!row)fail(503,'STORAGE','Configured storage is unavailable.');const parent=await realpath(setting!.parent),stat=await lstat(setting!.parent),rel=relative(process.cwd(),parent);if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077)!==0||(!(rel==='..'||rel.startsWith('..'+sep))&&!isAbsolute(rel))||dirname(row.root)!==parent)fail(503,'STORAGE','Private storage placement refused.');
    const opened=await createSyntheticReceiptStore(pool,async(bytes,mime,synthetic)=>{
     if(!processingClient)throw Error('Processing slot unavailable');
     await processingClient.query("UPDATE synthetic_upload_gate SET state='processing',attempt=$1,reason=NULL WHERE id=1",[randomUUID()]);
     try{const output=await convert(bytes,mime,synthetic);await processingClient!.query("UPDATE synthetic_upload_gate SET state='ready',reason=NULL WHERE id=1");return output;}catch(error){if(error instanceof PreviewRejected)await processingClient!.query("UPDATE synthetic_upload_gate SET state='ready',reason=NULL WHERE id=1");else await processingClient!.query("UPDATE synthetic_upload_gate SET state='held',reason='Isolated processing outcome unconfirmed' WHERE id=1");throw error;}
    },{actualPrivate:actual,reopen:{storeId:setting!.storeId,context:{actor,requestId:key}}});
   if(opened.startupReport?.quarantined.length)fail(503,'STORAGE_INTEGRITY','Receipt integrity needs operator review.');
   if(automatic)await withTransaction(pool,tx=>appendAudit(tx,{context:{actor,requestId:key,reason:'Automatic startup reopening under prior verified administrator initialization'},action:'synthetic-receipt.restart-reopened',entityId:setting!.storeId}));
   store=opened;
  }finally{try{if(locked)await slot.query('SELECT pg_advisory_unlock(7219304)');slot.release();}catch{slot.release(true);}}
 }
 async function reopenOnStartup(){
  if((!hosted&&!actual)||!setting)return false;
  try{if(await state()!=='ready')return false;if(store)return true;
   const authority=(await pool.query("SELECT e.id,e.user_id FROM audit_event a JOIN employee e ON e.user_id=a.actor_user_id WHERE a.entity_id=$1 AND a.action='synthetic-receipt.reconcile' AND e.role='admin' AND e.active ORDER BY a.created_at DESC LIMIT 1",[setting!.storeId])).rows[0];if(!authority)return false;
   await reopenVerified({employeeId:authority.id,userId:authority.user_id,role:'admin'},randomUUID(),true);return true;
  }catch{return false;}
 }
 const handle=async(request:Request,actor:Actor):Promise<Response>=>{
  try{
   const url=new URL(request.url),path=url.pathname;if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)&&!((hosted||actual)&&url.hostname===new URL(config.origin).hostname))fail(403,'FORBIDDEN','Local development only.');
   if(!setting){if(path==='/api/files/status')return result({enabled:false,initialized:false,employeeId:actor.employeeId});if(request.method==='GET')fail(404,'NOT_FOUND','Receipt not found.');fail(503,'PREVIEW_ISOLATION_UNAVAILABLE','Receipt upload unavailable.');}
   if(!(await pool.query('SELECT 1 FROM employee WHERE id=$1 AND user_id=$2 AND role=$3 AND active=true',[actor.employeeId,actor.userId,actor.role])).rowCount)fail(403,'FORBIDDEN','Access denied.');
   if((await pool.query("SELECT to_regclass('public.recovery_quarantine') AS name")).rows[0].name)fail(503,'RECOVERY_QUARANTINE','Restored storage is inspection-only.');
   if(request.method==='GET'&&path==='/api/files/status')return result({enabled:true,initialized:!!store,available:!!store&&await state()==='ready',syntheticPreview:hosted,actualPrivate:actual,employeeId:actor.employeeId});
   if(request.method==='GET'){
    const id=path.slice('/api/files/'.length),kind=url.searchParams.get('kind')??'original';if(!z.uuid().safeParse(id).success||!['original','preview'].includes(kind))fail(404,'NOT_FOUND','Receipt not found.');if(!store)fail(503,'INITIALIZE','Administrator must initialize synthetic storage.');const file=await store!.read(actor,id,kind as 'original'|'preview');return new Response(new Uint8Array(file.bytes),{headers:file.headers});
   }
   if(request.method!=='POST')fail(405,'METHOD','Unsupported method.');if(request.headers.get('origin')!==config.origin||request.headers.get('host')!==new URL(config.origin).host)fail(403,'FORBIDDEN','Exact local origin and host required.');
   if(!actual&&request.headers.get('x-hr-synthetic')!=='true')fail(400,'SYNTHETIC_ONLY','Invented receipt files only.');const key=request.headers.get('idempotency-key');if(!z.uuid().safeParse(key).success)fail(400,'REQUEST_KEY_REQUIRED','Stable retry key required.');
   if(path==='/api/files/initialize'){
    await reopenVerified(actor,key!);return result({initialized:true,syntheticOnly:!actual});
   }
   if(path!=='/api/files'||url.search)fail(404,'NOT_FOUND','Receipt endpoint not found.');if(!store)fail(503,'INITIALIZE','Administrator must initialize synthetic storage.');if(request.headers.get('x-attachment-purpose')!=='receipt')fail(400,'PURPOSE','Only self-owned receipts are supported.');const mime=request.headers.get('content-type');if(mime!=='image/png'&&mime!=='image/jpeg'&&mime!=='image/heic')fail(415,'FORMAT','PNG, JPEG or HEIC only.');
   const client=await pool.connect();let locked=false,destroy=false;
   try{locked=(await client.query('SELECT pg_try_advisory_lock(7219304) AS locked')).rows[0].locked;if(!locked)fail(429,'BUSY','Another synthetic upload is active; retry the same file.');if((await client.query('SELECT state FROM synthetic_upload_gate WHERE id=1')).rows[0]?.state!=='ready')fail(503,'PROCESSING_HELD','Processing needs operator review.');processingClient=client;const bytes=await streamBody(request);const id=await store!.store({actor,requestId:key!},bytes,mime!,!actual);return result({id,syntheticOnly:!actual});}finally{if(locked)processingClient=undefined;try{if(locked)await client.query('SELECT pg_advisory_unlock(7219304)');}catch{destroy=true;}client.release(destroy);}
  }catch(error){if(request.body&&!request.bodyUsed)void request.body.cancel().catch(()=>{});let status=503,code='STORAGE_UNAVAILABLE',message='Receipt processing or storage unavailable. Operator review may be required.';
   if(error instanceof Failure)({status,code,message}=error);else if(error instanceof PreviewRejected){status=422;code='IMAGE_REJECTED';message='Image rejected by isolated validation.';}else if(error instanceof Error){if(error.message==='FORBIDDEN'){status=403;code='FORBIDDEN';message='Access denied.';}else if(error.message==='IDEMPOTENCY_CONFLICT'){status=409;code='IDEMPOTENCY_CONFLICT';message='This retry key belongs to different bytes.';}else if(error.message==='RECEIPT_CAPACITY'){status=507;code='RECEIPT_CAPACITY';message='Synthetic storage capacity reached. No file was saved; do not delete retained records.';}else if(['INPUT','MIME','PROCESSOR_OUTPUT'].includes(error.message)){status=422;code='IMAGE_REJECTED';message='Invalid image input or output.';}}
   return Response.json({ok:false,code,message},{status,headers:{'Cache-Control':'no-store'}});
  }
 };
 return Object.assign(handle,{reopenOnStartup});
}
