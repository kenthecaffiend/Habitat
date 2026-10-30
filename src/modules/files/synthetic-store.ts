import {containsRestrictedContent} from '../../core/restricted-input';
import {RECEIPT_LIMITS as L} from './limits';import {assertReceiptCapacity} from './capacity';
import type {Pool} from 'pg';
import type {AuditContext,Actor} from '../../core/contracts';
import {withTransaction,appendAudit,type DbTx} from '../../server/db';
import {lockClaimsCutoff} from '../claims/service';
import {mkdtemp,lstat,open,realpath,mkdir,readdir,rename} from 'node:fs/promises';
import {constants} from 'node:fs';import {tmpdir} from 'node:os';import {join,isAbsolute} from 'node:path';import {randomUUID,createHash} from 'node:crypto';import {z} from 'zod';
export type Converter=(bytes:Buffer,mime:'image/png'|'image/jpeg'|'image/heic',syntheticOnly:boolean)=>Promise<{bytes:Buffer;originalHash:string;previewHash:string}>;
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex'),signature=Buffer.from('89504e470d0a1a0a','hex');
// Private receipt store; actual-data access requires an explicit, separately approved capability.
type Options={actualPrivate?:boolean;parentDirectory?:string;reopen?:{storeId:string;context:AuditContext}};
export async function createSyntheticReceiptStore(pool:Pool,convert:Converter,options:Options={}){
 const environment=await withTransaction(pool,async tx=>{const e=(await tx.query('SELECT environment FROM environment_identity WHERE id=1')).rows[0]?.environment;if(!(['dev','test'].includes(e)||options.actualPrivate===true&&e==='actual-test'))throw Error('ENVIRONMENT');return e;});
 let root:string,storeId:string,identity:{ino:string;dev:string};
 if(options.reopen){
  storeId=z.uuid().parse(options.reopen.storeId);
  const record=await withTransaction(pool,async tx=>(await tx.query('SELECT * FROM private_receipt_store WHERE id=$1',[storeId])).rows[0]);
  if(!record)throw Error('STORAGE_UNAVAILABLE');if(record.environment!==environment)throw Error('ENVIRONMENT');
  root=record.root;identity={ino:record.inode,dev:record.device};
 }else{
  const parent=options.parentDirectory??tmpdir();if(!isAbsolute(parent))throw Error('STORAGE_PARENT');
  root=await realpath(await mkdtemp(join(parent,'hr-private-receipts-')));const stat=await lstat(root);identity={ino:String(stat.ino),dev:String(stat.dev)};storeId=randomUUID();
  await mkdir(join(root,'.orphans'),{mode:0o700});await syncDirectory(root);
  await withTransaction(pool,async tx=>{await lockClaimsCutoff(tx);if(Number((await tx.query('SELECT count(*) FROM private_receipt_store')).rows[0].count)>=L.stores)throw Error('RECEIPT_CAPACITY');await tx.query('INSERT INTO private_receipt_store(id,environment,root,device,inode) VALUES($1,$2,$3,$4,$5)',[storeId,environment,root,identity.dev,identity.ino]);});
 }
 async function syncDirectory(path:string){const f=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{await f.sync();}finally{await f.close();}}

 async function boundary(tx:DbTx,actor:Actor){const s=await lstat(root);if(!s.isDirectory()||s.isSymbolicLink()||String(s.ino)!==identity.ino||String(s.dev)!==identity.dev||(s.mode&0o077)!==0)throw Error('STORAGE_IDENTITY');const registered=(await tx.query('SELECT * FROM private_receipt_store WHERE id=$1',[storeId])).rows[0];if(!registered||registered.root!==root||registered.inode!==identity.ino||registered.device!==identity.dev||registered.environment!==environment)throw Error('STORAGE_IDENTITY');const env=(await tx.query('SELECT environment FROM environment_identity WHERE id=1')).rows[0]?.environment;if(env!==environment)throw Error('ENVIRONMENT');if(!(await tx.query('SELECT 1 FROM employee WHERE id=$1 AND user_id=$2 AND role=$3 AND active=true',[actor.employeeId,actor.userId,actor.role])).rowCount)throw Error('FORBIDDEN');}
 async function write(id:string,suffix:string,bytes:Buffer){const f=await open(join(root,id+suffix),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);try{await f.writeFile(bytes);await f.sync();}finally{await f.close();}}
 async function store(c:AuditContext,input:Buffer,mime:string,syntheticOnly:boolean,source?:{bindingId:string;sourceAttachmentKey:string;sourcePath:string}){
  z.uuid().parse(c.requestId);if(syntheticOnly!==(environment!=='actual-test')||!Buffer.isBuffer(input)||input.length<1||input.length>L.uploadBytes)throw Error('INPUT');
  const bytes=Buffer.from(input);if(!(mime==='image/png'&&bytes.subarray(0,8).equals(signature))&&!(mime==='image/jpeg'&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)&&!(mime==='image/heic'&&bytes.subarray(4,8).toString()==='ftyp'&&['heic','heix','mif1'].includes(bytes.subarray(8,12).toString())))throw Error('MIME');
  const checksum=hash(bytes),fingerprint=hash(Buffer.from(mime+':'+checksum+(source?':'+JSON.stringify(source):'')));
  return withTransaction(pool,async tx=>{
   await lockClaimsCutoff(tx);await boundary(tx,c.actor);
   let employeeId=c.actor.employeeId;if(source){if(c.actor.role!=='admin')throw Error('FORBIDDEN');const authority=await tx.query("SELECT 1 FROM employee_source_binding WHERE slot='owner' AND employee_id=$1 AND source_system='AIMM'",[c.actor.employeeId]);if(!authority.rowCount)throw Error('FORBIDDEN');const binding=(await tx.query("SELECT b.employee_id,b.source_key FROM employee_source_binding b JOIN employee e ON e.id=b.employee_id WHERE b.id=$1 AND b.source_system='AIMM' AND b.slot IN ('owner','colleague') AND e.active FOR SHARE OF e",[source.bindingId])).rows[0];if(!binding)throw Error('SOURCE_BINDING');if(!(source.sourcePath==='/expense-claim'||source.sourcePath==='/leave'||source.sourcePath.startsWith('/leave/')||source.sourcePath==='/employees/'+binding.source_key||source.sourcePath.startsWith('/employees/'+binding.source_key+'/')))throw Error('SOURCE_INPUT');employeeId=binding.employee_id;}
   const previous=(await tx.query('SELECT attachment_id,fingerprint,store_id FROM private_receipt_file WHERE actor_id=$1 AND request_key=$2',[c.actor.userId,c.requestId])).rows[0];
   if(previous){if(previous.fingerprint!==fingerprint)throw Error('IDEMPOTENCY_CONFLICT');if(previous.store_id!==storeId)throw Error('STORAGE_UNAVAILABLE');return previous.attachment_id as string;}
   await assertReceiptCapacity(tx,bytes.length+8,2);
   const converted=await convert(bytes,mime as 'image/png'|'image/jpeg'|'image/heic',environment!=='actual-test'),preview=Buffer.from(converted.bytes);
   if(converted.originalHash!==checksum||converted.previewHash!==hash(preview)||preview.length<8||preview.length>L.previewBytes||!preview.subarray(0,8).equals(signature))throw Error('PROCESSOR_OUTPUT');
   await assertReceiptCapacity(tx,bytes.length+preview.length,2);
   const id=randomUUID();await write(id,'.original',bytes);await write(id,'.preview.png',preview);await syncDirectory(root);
   // Failed/uncertain transactions leave inaccessible orphan files, never guessed deletion.
   await tx.query("INSERT INTO private_attachment VALUES($1,$2,'receipt','ready',$3,$4,$5)",[id,employeeId,mime,bytes.length,checksum]);
   await tx.query('INSERT INTO private_receipt_file VALUES($1,$2,$3,$4,$5,$6,$7)',[id,storeId,c.actor.userId,c.requestId,fingerprint,hash(preview),preview.length]);
   await appendAudit(tx,{context:source?{...c,reason:JSON.stringify({sourceSystem:'AIMM',...source,originalSha256:checksum})}:c,action:source?'employee.source.receipt-import':'synthetic-receipt.store',entityId:id});return id;
  });
 }
 async function read(actor:Actor,id:string,kind:'original'|'preview'){
  z.uuid().parse(id);if(!['original','preview'].includes(kind))throw Error('INPUT');
  const result=await withTransaction(pool,async tx=>{
   await lockClaimsCutoff(tx);await boundary(tx,actor);const r=(await tx.query('SELECT a.*,f.store_id,f.preview_hash,f.preview_size FROM private_attachment a JOIN private_receipt_file f ON f.attachment_id=a.id WHERE a.id=$1',[id])).rows[0];
   if(!r)throw Error('NOT_FOUND');if(actor.role!=='admin'&&r.employee_id!==actor.employeeId)throw Error('FORBIDDEN');if(r.store_id!==storeId||r.state!=='ready')throw Error('STORAGE_UNAVAILABLE');
   let bytes:Buffer;try{const f=await open(join(root,id+(kind==='original'?'.original':'.preview.png')),constants.O_RDONLY|constants.O_NOFOLLOW);
   try{const stat=await f.stat(),size=kind==='original'?r.size_bytes:r.preview_size;if(!stat.isFile()||stat.nlink!==1||stat.size!==size)throw Error('INTEGRITY');bytes=await f.readFile();if(hash(bytes)!==(kind==='original'?r.checksum:r.preview_hash))throw Error('INTEGRITY');}finally{await f.close();}}catch{await tx.query("UPDATE private_attachment SET state='quarantined' WHERE id=$1",[id]);await appendAudit(tx,{context:{actor,requestId:randomUUID(),reason:'Private receipt integrity failure'},action:'synthetic-receipt.quarantine',entityId:id});return {error:'INTEGRITY' as const};}
   return {bytes,headers:{'Content-Type':kind==='preview'?'image/png':r.verified_mime,'Content-Disposition':(kind==='preview'?'inline':'attachment')+'; filename="'+id+(kind==='preview'?'.preview.png':r.verified_mime==='image/png'?'.png':r.verified_mime==='image/heic'?'.heic':'.jpg')+'"','X-Content-Type-Options':'nosniff','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; sandbox"},syntheticOnly:environment!=='actual-test'};
  });
  if('error' in result)throw Error(result.error);return result;
 }
 async function reconcile(c:AuditContext){
  z.uuid().parse(c.requestId);
  return withTransaction(pool,async tx=>{
   await lockClaimsCutoff(tx);await boundary(tx,c.actor);if(c.actor.role!=='admin')throw Error('FORBIDDEN');
   const quarantine=join(root,'.orphans'),q=await lstat(quarantine);
   if(!q.isDirectory()||q.isSymbolicLink()||(q.mode&0o077)!==0)throw Error('STORAGE_ENTRY');
   const rows=(await tx.query('SELECT a.*,f.preview_hash,f.preview_size FROM private_attachment a JOIN private_receipt_file f ON f.attachment_id=a.id WHERE f.store_id=$1',[storeId])).rows;
   const referenced=new Set(rows.map(r=>r.id));const names=await readdir(root),orphans:string[]=[];
   // Preflight every entry before any move. No unknown paths, symlinks or hardlinks.
   for(const name of [...names.filter(n=>n!=='.orphans').map(n=>({name:n,path:join(root,n),orphan:false})),...(await readdir(quarantine)).map(n=>({name:n,path:join(quarantine,n),orphan:true}))]){
    if(!/^[0-9a-f-]{36}\.(original|preview\.png)$/.test(name.name)||!z.uuid().safeParse(name.name.slice(0,36)).success)throw Error('STORAGE_ENTRY');
    const stat=await lstat(name.path);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||(stat.mode&0o077)!==0)throw Error('STORAGE_ENTRY');
    if(!name.orphan&&!referenced.has(name.name.slice(0,36)))orphans.push(name.name);
   }
   const quarantined:string[]=[];
   for(const row of rows){
    let intact=true;
    for(const [suffix,size,checksum] of [['.original',row.size_bytes,row.checksum],['.preview.png',row.preview_size,row.preview_hash]] as const){
     try{const file=await open(join(root,row.id+suffix),constants.O_RDONLY|constants.O_NOFOLLOW);try{const stat=await file.stat();if(!stat.isFile()||stat.nlink!==1||stat.size!==size||hash(await file.readFile())!==checksum)intact=false;}finally{await file.close();}}catch{intact=false;}
    }
    if(!intact&&row.state==='ready'){await tx.query("UPDATE private_attachment SET state='quarantined' WHERE id=$1",[row.id]);quarantined.push(row.id);}
   }
   for(const name of orphans){
    // A collision is ambiguous; never overwrite previously quarantined evidence.
    try{await lstat(join(quarantine,name));throw Error('ORPHAN_COLLISION');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    await rename(join(root,name),join(quarantine,name));
   }
   await syncDirectory(quarantine);await syncDirectory(root);
   const report={storeId,referenced:rows.length,quarantined,retainedOrphans:await readdir(quarantine),movedOrphans:orphans};
   await appendAudit(tx,{context:{...c,reason:JSON.stringify(report)},action:'synthetic-receipt.reconcile',entityId:storeId});return report;
  });
 }
 // Operator-only migration primitive, deliberately absent from normal upload HTTP routes.
 async function importReceipt(context:AuditContext,raw:unknown,bytes:Buffer,mime:string){
  if(context.actor.role!=='admin')throw Error('FORBIDDEN');const p=z.object({bindingId:z.uuid(),sourceAttachmentKey:z.string().regex(/^[A-Za-z0-9._:-]{1,120}$/),sourcePath:z.string().regex(/^\/[A-Za-z0-9/_-]{1,300}$/)}).strict().safeParse(raw);if(!p.success||containsRestrictedContent(raw))throw Error('SOURCE_INPUT');
  const h=hash(Buffer.from('aimm-receipt-v1:'+p.data.bindingId+':'+p.data.sourceAttachmentKey)),requestId=[h.slice(0,8),h.slice(8,12),'4'+h.slice(13,16),'a'+h.slice(17,20),h.slice(20,32)].join('-');
  const slot=await pool.connect();let locked=false,destroy=false;
  try{locked=(await slot.query('SELECT pg_try_advisory_lock(7219304) AS locked')).rows[0].locked;if(!locked)throw Error('BUSY');if((await slot.query('SELECT state FROM synthetic_upload_gate WHERE id=1')).rows[0]?.state!=='ready')throw Error('PROCESSING_HELD');
   await slot.query("UPDATE synthetic_upload_gate SET state='processing',attempt=$1,reason=NULL WHERE id=1",[requestId]);
   try{const id=await store({...context,requestId},bytes,mime,environment!=='actual-test',p.data);await slot.query("UPDATE synthetic_upload_gate SET state='ready',reason=NULL WHERE id=1");return id;}
   catch(error){const known=error instanceof Error&&['FORBIDDEN','SOURCE_BINDING','SOURCE_INPUT','INPUT','MIME','IDEMPOTENCY_CONFLICT','RECEIPT_CAPACITY'].includes(error.message);await slot.query(known?"UPDATE synthetic_upload_gate SET state='ready',reason=NULL WHERE id=1":"UPDATE synthetic_upload_gate SET state='held',reason='Source receipt import outcome uncertain; operator review required' WHERE id=1");throw error;}
  }finally{try{if(locked)await slot.query('SELECT pg_advisory_unlock(7219304)');}catch{destroy=true;}slot.release(destroy);}
 }
 const startupReport=options.reopen?await reconcile(options.reopen.context):undefined;
 return {root,storeId,store,importReceipt,read,reconcile,startupReport};
}
