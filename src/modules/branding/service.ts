import {createHash,randomUUID} from 'node:crypto';import sharp from 'sharp';import type {Pool} from 'pg';import {z} from 'zod';import {withTransaction,appendAudit,type DbTx} from '../../server/db';import {ok,fail,type Actor,type AuditContext} from '../../core/contracts';
export const LOGO_INPUT_LIMIT=1024*1024,LOGO_LIMIT=49152;
const hash=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
const ref=z.object({id:z.uuid(),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();export const logoRefSchema=ref;
export async function normalizedLogo(bytes:Buffer,mime:string){
 if(bytes.length===0||bytes.length>LOGO_INPUT_LIMIT||!['image/png','image/jpeg'].includes(mime))throw Error('LOGO_FORMAT');
 if(mime==='image/png'?!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):!(bytes[0]===255&&bytes[1]===216&&bytes[2]===255))throw Error('LOGO_FORMAT');
 const image=sharp(bytes,{limitInputPixels:4194304,failOn:'warning',sequentialRead:true});const metadata=await image.metadata();
 if(metadata.format!==(mime==='image/png'?'png':'jpeg')||!metadata.width||!metadata.height||metadata.width>2048||metadata.height>2048||(metadata.pages??1)!==1)throw Error('LOGO_DIMENSIONS');
 const {data,info}=await image.rotate().resize({width:768,height:384,fit:'inside',withoutEnlargement:true}).png({compressionLevel:9}).timeout({seconds:3}).toBuffer({resolveWithObject:true});
 if(data.length>LOGO_LIMIT)throw Error('LOGO_SIZE');return {body:data,width:info.width,height:info.height,sha256:hash(data)};
}
export async function freezeBranding(tx:DbTx,data:any){const row=(await tx.query('SELECT a.id,a.sha256 FROM branding_setting s JOIN branding_asset a ON a.id=s.light WHERE s.id=1 FOR SHARE OF s')).rows[0];if(!row)return data;const result={...data,branding:{lightLogo:{id:row.id,sha256:row.sha256}}};delete result.snapshotHash;return {...result,snapshotHash:hash(canonical(result))};}
function canonical(v:any):string{return Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>JSON.stringify(k)+':'+canonical(x)).join(',')+'}':JSON.stringify(v);}
export function createBrandingService(pool:Pool){
 let processing=false;
 async function active(tx:DbTx,a:Actor,admin=false){return !!(await tx.query("SELECT 1 FROM employee e,environment_identity i WHERE e.id=$1 AND e.user_id=$2 AND e.role=$3 AND e.active AND i.environment IN ('dev','test','actual-test')",[a.employeeId,a.userId,a.role])).rowCount&&(!admin||a.role==='admin');}
 async function setting(a:Actor){return withTransaction(pool,async tx=>{if(!await active(tx,a))return fail('FORBIDDEN','Active account required');const s=(await tx.query('SELECT * FROM branding_setting WHERE id=1')).rows[0];return ok({revision:s.revision,light:s.light,dark:s.dark});});}
 async function image(a:Actor,variant:string){if(!['light','dark'].includes(variant))return fail('INPUT','Unknown logo variant');return withTransaction(pool,async tx=>{if(!await active(tx,a))return fail('FORBIDDEN','Active account required');const r=(await tx.query('SELECT a.* FROM branding_setting s JOIN branding_asset a ON a.id=COALESCE('+ (variant==='dark'?'s.dark,s.light':'s.light,s.dark') +') WHERE s.id=1')).rows[0];if(!r)return fail('NOT_FOUND','No logo configured');if(hash(r.body)!==r.sha256)return fail('INTEGRITY','Logo unavailable');return ok(r.body as Buffer);});}
 async function change(c:AuditContext,variant:unknown,revision:unknown,input:Buffer|null,mime=''){
  if(c.actor.role!=='admin'||!z.uuid().safeParse(c.requestId).success)return fail('FORBIDDEN','Administrator required');if(!['light','dark'].includes(String(variant))||!Number.isSafeInteger(revision)||Number(revision)<0)return fail('INPUT','Invalid branding revision');
  if(!await withTransaction(pool,tx=>active(tx,c.actor,true)))return fail('FORBIDDEN','Active administrator required');
  const fingerprint=hash(canonical({variant,revision,input:input?hash(input):null,mime}));
  const prior=(await pool.query('SELECT * FROM branding_command WHERE request_id=$1',[c.requestId])).rows[0];if(prior)return prior.actor_id===c.actor.userId&&prior.fingerprint===fingerprint?ok(prior.result):fail('RETRY_CONFLICT','Retry key already used');
  if(processing)return fail('BUSY','Another logo update is processing');processing=true;
  try{let asset:Awaited<ReturnType<typeof normalizedLogo>>|undefined;if(input){try{asset=await normalizedLogo(input,mime);}catch{return fail('INPUT','Use a single PNG/JPEG up to1MiB and2048px per side; normalized logo must fit48KiB.');}}
   return await withTransaction(pool,async tx=>{await tx.query('SELECT pg_advisory_xact_lock(7219308)');if(!await active(tx,c.actor,true))return fail('FORBIDDEN','Active administrator required');const prior=(await tx.query('SELECT * FROM branding_command WHERE request_id=$1',[c.requestId])).rows[0];if(prior)return prior.actor_id===c.actor.userId&&prior.fingerprint===fingerprint?ok(prior.result):fail('RETRY_CONFLICT','Retry key already used');const s=(await tx.query('SELECT * FROM branding_setting WHERE id=1 FOR UPDATE')).rows[0];if(s.revision!==revision)return fail('REVISION_CONFLICT','Branding changed; reload before editing');if(Number((await tx.query('SELECT count(*) AS n FROM branding_command')).rows[0].n)>=1000||asset&&Number((await tx.query('SELECT count(*) AS n FROM branding_asset')).rows[0].n)>=64)return fail('CAPACITY','Branding version capacity reached');let id=null;if(asset){id=randomUUID();await tx.query('INSERT INTO branding_asset VALUES($1,$2,$3,$4,$5)',[id,asset.sha256,asset.body,asset.width,asset.height]);}await tx.query('UPDATE branding_setting SET '+variant+'=$1,revision=revision+1 WHERE id=1',[id]);const result={revision:s.revision+1};await tx.query('INSERT INTO branding_command VALUES($1,$2,$3,$4)',[c.requestId,c.actor.userId,fingerprint,result]);await appendAudit(tx,{context:c,action:'branding.'+(asset?'updated':'reset'),entityId:id??'branding-'+variant});return ok(result);});
  }finally{processing=false;}
 }
 return {setting,image,change};
}
