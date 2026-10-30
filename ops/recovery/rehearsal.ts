import {RECEIPT_LIMITS as L} from '../../src/modules/files/limits';
import {captureReceiptFiles,validateReceiptFiles,materializeReceiptFiles,receiptFileSchema,receiptInventorySchema} from './receipt-files';
import {createHash,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {mkdtemp,writeFile,readFile,readdir,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import type {Pool,PoolClient} from 'pg';import {z} from 'zod';
import {disposablePostgres} from '../../tests/helpers/postgres';import {prepareDatabase} from '../../src/server/db';import {readConfig} from '../../src/server/config';
const canonical=(v:any):string=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const digest=(v:unknown)=>createHash('sha256').update(canonical(v)).digest('hex');
const textDigest=(s:string)=>createHash('sha256').update(s).digest('hex');
const quote=(s:string)=>'"'+s.replaceAll('"','""')+'"';
type Database=Awaited<ReturnType<typeof disposablePostgres>>;
type Table={name:string;columns:string[]};
const sources=new WeakMap<Database,Table[]>();
async function catalog(db:Pool|PoolClient):Promise<Table[]>{const names=(await db.query("SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.oid")).rows;const tables=[];for(const n of names){const columns=(await db.query('SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position',['public',n.relname])).rows.map(r=>r.column_name);tables.push({name:n.relname,columns});}return tables;}
async function schemaHash(){const files=(await readdir('db/migrations')).filter(f=>/^\d+.*\.sql$/.test(f)).sort();return digest(await Promise.all(files.map(async name=>({name,sha256:textDigest(await readFile(join('db/migrations',name),'utf8'))}))));}
function config(url:string){return readConfig({APP_ENV:'test',DATABASE_URL:url,APP_ORIGIN:'http://127.0.0.1:3130',SESSION_SECRET:'synthetic-recovery-key-not-for-access',MAIL_TRANSPORT:'capture',STORAGE_ENV:'test'});}
export async function createSyntheticSource(){const db=await disposablePostgres();try{await prepareDatabase(db.pool,config(db.url));sources.set(db,await catalog(db.pool));return db;}catch(e){await db.stop();throw e;}}
function keyCheck(key:Buffer){if(!Buffer.isBuffer(key)||key.length!==32)throw Error('A fresh 32-byte test-only encryption key is required');}
async function tableRows(db:Pool|PoolClient,name:string){return (await db.query('SELECT to_jsonb(t) AS value FROM '+quote(name)+' t')).rows.map(r=>r.value).sort((a,b)=>canonical(a).localeCompare(canonical(b)));}
export async function backupSynthetic(source:Database,key:Buffer,options?:{includeReceiptFiles:true}):Promise<Buffer>{
 keyCheck(key);const expected=sources.get(source);if(!expected)throw Error('Only a freshly created synthetic source handle is accepted');const client=await source.pool.connect();
 try{await client.query('SELECT pg_advisory_lock(7219303)');await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const tables=await catalog(client);if(canonical(tables)!==canonical(expected))throw Error('Unexpected source schema');if((await client.query('SELECT environment FROM environment_identity WHERE id=1')).rows[0]?.environment!=='test')throw Error('Synthetic test identity required');if((await client.query("SELECT 1 FROM \"user\" WHERE email NOT LIKE '%@%.invalid' LIMIT 1")).rowCount)throw Error('Only synthetic identities allowed');if((await client.query('SELECT 1 FROM account WHERE access_token IS NOT NULL OR refresh_token IS NOT NULL OR id_token IS NOT NULL LIMIT 1')).rowCount)throw Error('External credentials refused');
  if(!options?.includeReceiptFiles&&((await client.query('SELECT 1 FROM private_receipt_store LIMIT 1')).rowCount||(await client.query('SELECT 1 FROM private_receipt_file LIMIT 1')).rowCount))throw Error('EXTERNAL_FILE_BACKUP_REQUIRED: metadata-only rehearsal cannot back up receipt bytes');
  const capturedAt=(await client.query('SELECT transaction_timestamp() AS at')).rows[0].at.toISOString(),entries=[];let metadataBytes=0,metadataRows=0;
  for(const t of tables){const sizes=(await client.query('SELECT coalesce(sum(octet_length(to_jsonb(t)::text)),0)::text AS bytes,count(*)::text AS count FROM '+quote(t.name)+' t')).rows[0];metadataBytes+=Number(sizes.bytes);metadataRows+=Number(sizes.count);if(metadataBytes>L.metadataBytes||metadataRows>L.metadataRows)throw Error('SYNTHETIC_METADATA_LIMIT');const rows=await tableRows(client,t.name);entries.push({...t,rows,count:rows.length,sha256:digest(rows)});}
  const capturedFiles=options?.includeReceiptFiles?await captureReceiptFiles(entries):{files:[],inventory:[]};
  const snapshot={purpose:'DISPOSABLE SYNTHETIC RECOVERY ONLY',version:1,capturedAt,schemaHash:await schemaHash(),fileCoverage:options?.includeReceiptFiles?'database-and-receipt-files':'metadata-and-inline-synthetic-json-only',receiptFiles:capturedFiles.files,receiptInventory:capturedFiles.inventory,tables:entries};await client.query('COMMIT');
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from('hr-synthetic-backup-v1'));const plain=Buffer.from(JSON.stringify(snapshot));if(plain.length>L.plaintextBytes)throw Error('Synthetic plaintext size limit');const encrypted=Buffer.concat([cipher.update(plain),cipher.final()]);const archive=Buffer.from(JSON.stringify({version:1,purpose:'synthetic-only',iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:encrypted.toString('base64')}));if(archive.length>L.archiveBytes)throw Error('Synthetic archive size limit');return archive;
 }catch(e){await client.query('ROLLBACK');throw e;}finally{try{await client.query('SELECT pg_advisory_unlock(7219303)');}catch(error){client.release(true);throw error;}client.release();}
}
const envelope=z.object({version:z.literal(1),purpose:z.literal('synthetic-only'),iv:z.string(),tag:z.string(),ciphertext:z.string()}).strict();
const manifest=z.object({purpose:z.literal('DISPOSABLE SYNTHETIC RECOVERY ONLY'),version:z.literal(1),capturedAt:z.iso.datetime(),schemaHash:z.string().regex(/^[a-f0-9]{64}$/),fileCoverage:z.enum(['metadata-and-inline-synthetic-json-only','database-and-receipt-files']),receiptFiles:z.array(receiptFileSchema).max(L.files).default([]),receiptInventory:z.array(receiptInventorySchema).max(L.stores).default([]),tables:z.array(z.object({name:z.string(),columns:z.array(z.string()),rows:z.array(z.record(z.string(),z.unknown())).max(L.metadataRows),count:z.number().int().nonnegative(),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict()).max(100)}).strict();
const evidenceSchema=z.object({syntheticOnly:z.literal(true),incidentCutoff:z.iso.datetime(),effects:z.array(z.object({kind:z.enum(['salary','cpf','email']),reference:z.string().min(1).max(200),occurredAt:z.iso.datetime()}).strict()).max(1000)}).strict();
export async function restoreSynthetic(bytes:Buffer,key:Buffer,input:unknown){
 keyCheck(key);if(!Buffer.isBuffer(bytes)||bytes.length>L.archiveBytes)throw Error('Invalid or oversized synthetic backup');const e=envelope.parse(JSON.parse(bytes.toString('utf8'))),iv=Buffer.from(e.iv,'base64'),tag=Buffer.from(e.tag,'base64');if(iv.length!==12||tag.length!==16)throw Error('Invalid encryption envelope');const decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAAD(Buffer.from('hr-synthetic-backup-v1'));decipher.setAuthTag(tag);const plain=Buffer.concat([decipher.update(Buffer.from(e.ciphertext,'base64')),decipher.final()]);if(plain.length>L.plaintextBytes)throw Error('Synthetic plaintext size limit');const snapshot=manifest.parse(JSON.parse(plain.toString('utf8'))),evidence=evidenceSchema.parse(input);
 if(snapshot.schemaHash!==await schemaHash())throw Error('Schema fingerprint mismatch');if(Date.parse(evidence.incidentCutoff)<Date.parse(snapshot.capturedAt)||evidence.effects.some(x=>Date.parse(x.occurredAt)<Date.parse(snapshot.capturedAt)||Date.parse(x.occurredAt)>Date.parse(evidence.incidentCutoff)))throw Error('External evidence outside recovery interval');
 if(snapshot.tables.reduce((n,t)=>n+t.rows.length,0)>L.metadataRows)throw Error('SYNTHETIC_METADATA_LIMIT');
 for(const t of snapshot.tables){if(t.rows.length!==t.count||digest(t.rows)!==t.sha256)throw Error('Incomplete or corrupt table manifest');for(const r of t.rows)if(canonical(Object.keys(r).sort())!==canonical([...t.columns].sort()))throw Error('Incomplete row');}
 if(snapshot.fileCoverage==='metadata-and-inline-synthetic-json-only'&&(snapshot.receiptFiles.length||snapshot.receiptInventory.length||snapshot.tables.some(t=>['private_receipt_store','private_receipt_file'].includes(t.name)&&t.rows.length)))throw Error('RECEIPT_COVERAGE');
 validateReceiptFiles(snapshot.tables,snapshot.receiptFiles,snapshot.receiptInventory);
 const directory=await mkdtemp(join(tmpdir(),'hr-recovery-quarantine-')),quarantineFile=join(directory,'recovery-override.json');
 // Outside the restored data, written BEFORE PostgreSQL target initialisation. There is no resume API.
 await writeFile(quarantineFile,JSON.stringify({purpose:'synthetic recovery quarantine',processingDisabled:true,HR_RECOVERY_QUARANTINE:'1',MAIL_TRANSPORT:'disabled',schedulerEnabled:false,outboxEnabled:false,backupCapturedAt:snapshot.capturedAt,incidentCutoff:evidence.incidentCutoff}),{mode:0o600,flag:'wx'});
 let target:Database|undefined;
 try{
  target=await disposablePostgres();await prepareDatabase(target.pool,config(target.url));const targetCatalog=await catalog(target.pool);
  if(canonical(targetCatalog)!==canonical(snapshot.tables.map(t=>({name:t.name,columns:t.columns}))))throw Error('Missing or extra backup tables');
  const client=await target.pool.connect();try{await client.query('BEGIN');
   for(const t of snapshot.tables){
    if(['environment_identity','schema_migration'].includes(t.name)){if(digest(await tableRows(client,t.name))!==t.sha256)throw Error('Environment or schema identity mismatch');continue;}
    if(t.name==='import_target_version')continue;
    if(['medical_file_schema','employee_profile_schema','saved_payroll_schema','workflow_restoration_schema'].includes(t.name)){const seeded=await tableRows(client,t.name);if(canonical(seeded)!==canonical([{id:1,version:1}])||digest(seeded)!==t.sha256)throw Error('Restore schema marker mismatch');continue;}
    if(t.name==='branding_setting'){if(canonical(await tableRows(client,t.name))!==canonical([{id:1,revision:0,light:null,dark:null}]))throw Error('Restore target branding is not fresh');await client.query('DELETE FROM branding_setting');}
    if(t.name==='synthetic_upload_gate'){if(canonical(await tableRows(client,t.name))!==canonical([{id:1,state:'ready',attempt:null,reason:null}]))throw Error('Restore target upload gate is not fresh');await client.query('DELETE FROM synthetic_upload_gate');}
    if((await client.query('SELECT 1 FROM '+quote(t.name)+' LIMIT 1')).rowCount)throw Error('Restore target is not fresh');
    for(const row of t.rows)await client.query('INSERT INTO '+quote(t.name)+' SELECT * FROM jsonb_populate_record(NULL::'+quote(t.name)+',$1::jsonb)',[JSON.stringify(row)]);
   }
   const version=snapshot.tables.find(t=>t.name==='import_target_version')!;if(version.rows.length!==1||version.rows[0].id!==1)throw Error('Missing target version');await client.query('UPDATE import_target_version SET version=$1 WHERE id=1',[version.rows[0].version]);
   for(const t of targetCatalog)for(const column of t.columns){const sequence=(await client.query('SELECT pg_get_serial_sequence($1,$2) AS name',[quote(t.name),column])).rows[0].name;if(sequence){const max=(await client.query('SELECT max('+quote(column)+') AS value FROM '+quote(t.name))).rows[0].value;await client.query('SELECT setval($1::regclass,$2,$3)',[sequence,max??1,max!==null]);}}
   for(const t of snapshot.tables)if(digest(await tableRows(client,t.name))!==t.sha256)throw Error('Restored row/hash mismatch: '+t.name);
   const docs=(await client.query('SELECT body,sha256 FROM simulated_document')).rows;for(const d of docs)if(textDigest(d.body)!==d.sha256)throw Error('Synthetic document hash mismatch');
   const obligations=(await client.query('SELECT snapshot,snapshot_hash FROM payslip_obligation')).rows;for(const d of obligations)if(digest(d.snapshot)!==d.snapshot_hash)throw Error('Immutable snapshot hash mismatch');
   const receiptFiles=await materializeReceiptFiles(directory,snapshot.tables,snapshot.receiptFiles);
   for(const binding of receiptFiles.reboundStores)await client.query('UPDATE private_receipt_store SET root=$1,device=$2,inode=$3 WHERE id=$4',[binding.root,binding.device,binding.inode,binding.storeId]);
   await client.query('CREATE TABLE recovery_quarantine(id integer PRIMARY KEY CHECK(id=1),active boolean NOT NULL CHECK(active),report jsonb NOT NULL)');
   const report={purpose:'synthetic disposable restore only',capturedAt:snapshot.capturedAt,incidentCutoff:evidence.incidentCutoff,tablesMatch:true,registryReboundAfterTableVerification:receiptFiles.reboundStores.length>0,receiptFiles,verifiedTables:snapshot.tables.map(t=>({name:t.name,count:t.count,sha256:t.sha256})),fileCoverage:snapshot.fileCoverage,processingDisabled:true,resumptionAllowed:false,unresolvedEffects:evidence.effects.map(x=>({...x,status:'unreconciled-invented-evidence'})),actualOffHostRecoveryVerified:false,rpoRtoVerified:false};
   await client.query('INSERT INTO recovery_quarantine VALUES(1,true,$1)',[report]);
   await client.query("CREATE FUNCTION refuse_recovery_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'RECOVERY_QUARANTINE';END $$");
   for(const t of [...targetCatalog,{name:'recovery_quarantine',columns:[]}])await client.query('CREATE TRIGGER recovery_read_only BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON '+quote(t.name)+' FOR EACH STATEMENT EXECUTE FUNCTION refuse_recovery_write()');
   await client.query('COMMIT');const db=target;
   return {...db,quarantineFile,report,stop:async()=>{try{await db.stop();}finally{await rm(directory,{recursive:true,force:true});}}};
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }catch(error){try{await target?.stop();}finally{await rm(directory,{recursive:true,force:true});}throw error;}
}
