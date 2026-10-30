import {beforeAll,afterAll,it,expect} from 'vitest';
import {randomUUID,createHash,randomBytes} from 'node:crypto';
import {rm,writeFile,readdir,rename,mkdir,symlink,readFile} from 'node:fs/promises';
import {createSyntheticSource,backupSynthetic} from '../../ops/recovery/rehearsal';
import {createSyntheticReceiptStore} from '../../src/modules/files/synthetic-store';
let db:Awaited<ReturnType<typeof createSyntheticSource>>,admin:any,owner:any;const roots=new Set<string>();
const png=Buffer.from('89504e470d0a1a0a00000000','hex'),hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');let conversions=0;
const convert=async(b:Buffer)=>{conversions++;return {bytes:png,originalHash:hash(b),previewHash:hash(png)};};
const ctx=(actor=admin)=>({actor,requestId:randomUUID()});
async function create(options?:any){const s=await (createSyntheticReceiptStore as any)(db.pool,convert,options);roots.add(s.root);return s;}
async function reopen(id:string,actor=admin){return create({reopen:{storeId:id,context:ctx(actor)}});}
async function fixture(){const store=await create(),context=ctx(owner),id=await store.store(context,png,'image/png',true),storeId=(await db.pool.query('SELECT store_id FROM private_receipt_file WHERE attachment_id=$1',[id])).rows[0].store_id;return {store,context,id,storeId};}
beforeAll(async()=>{db=await createSyntheticSource();for(const role of ['admin','employee']){const a={employeeId:randomUUID(),userId:randomUUID(),role};await db.pool.query('INSERT INTO "user"(id,name,email) VALUES($1,$1,$2)',[a.userId,a.userId+'@example.invalid']);await db.pool.query('INSERT INTO employee(id,user_id,role) VALUES($1,$2,$3)',[a.employeeId,a.userId,role]);if(role==='admin')admin=a;else owner=a;}});
afterAll(async()=>{await db?.stop();for(const root of roots)await rm(root,{recursive:true,force:true});});
it('reopens the registered directory and preserves exact retry and owner checks',async()=>{const f=await fixture(),before=conversions,s=await reopen(f.storeId);expect(s.root).toBe(f.store.root);expect((await s.read(owner,f.id,'original')).bytes).toEqual(png);expect(await s.store(f.context,png,'image/png',true)).toBe(f.id);expect(conversions).toBe(before);});
it('quarantines orphan bytes without deleting originals or adopting them',async()=>{const f=await fixture(),orphan=randomUUID()+'.original';await writeFile(f.store.root+'/'+orphan,png,{mode:0o600});const s=await reopen(f.storeId);expect(await readFile(s.root+'/.orphans/'+orphan)).toEqual(png);expect(await readdir(s.root)).not.toContain(orphan);expect((await s.read(owner,f.id,'original')).bytes).toEqual(png);const again=await reopen(f.storeId);expect(await readFile(again.root+'/.orphans/'+orphan)).toEqual(png);expect((await db.pool.query("SELECT * FROM audit_event WHERE action='synthetic-receipt.reconcile' AND entity_id=$1",[f.storeId])).rowCount).toBe(2);});
it('startup quarantines incomplete referenced files rather than treating them as orphans',async()=>{const f=await fixture();await rm(f.store.root+'/'+f.id+'.preview.png');const s=await reopen(f.storeId);expect((await db.pool.query('SELECT state FROM private_attachment WHERE id=$1',[f.id])).rows[0].state).toBe('quarantined');await expect(s.read(owner,f.id,'original')).rejects.toThrow('STORAGE_UNAVAILABLE');expect(await readFile(s.root+'/'+f.id+'.original')).toEqual(png);});
it('refuses non-admin reopening and unknown store identity',async()=>{const f=await fixture();await expect(reopen(f.storeId,owner)).rejects.toThrow('FORBIDDEN');await expect(reopen(randomUUID())).rejects.toThrow('STORAGE_UNAVAILABLE');});
it('refuses replacement root and symlink entries without following them',async()=>{const f=await fixture(),saved=f.store.root+'-saved';await rename(f.store.root,saved);roots.add(saved);await mkdir(f.store.root,{mode:0o700});await expect(reopen(f.storeId)).rejects.toThrow('STORAGE_IDENTITY');await rm(f.store.root,{recursive:true});await rename(saved,f.store.root);const link=f.store.root+'/'+randomUUID()+'.original';await symlink(f.store.root+'/'+f.id+'.original',link);await expect(reopen(f.storeId)).rejects.toThrow('STORAGE_ENTRY');expect(await readFile(f.store.root+'/'+f.id+'.original')).toEqual(png);await rm(link);});
it('refuses metadata-only backup when external receipt storage is registered',async()=>{await expect(backupSynthetic(db,randomBytes(32))).rejects.toThrow('EXTERNAL_FILE_BACKUP_REQUIRED');});
it('restored quarantine prevents reopening',async()=>{const f=await fixture();await db.pool.query('CREATE TABLE recovery_quarantine(id integer)');try{await expect(reopen(f.storeId)).rejects.toThrow('RECOVERY_QUARANTINE');}finally{await db.pool.query('DROP TABLE recovery_quarantine');}});
it('serializes reconciliation behind in-flight writes across handles',async()=>{
 const f=await fixture();let release!:()=>void,entered!:()=>void;const started=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r);
 const slow=await createSyntheticReceiptStore(db.pool,async b=>{entered();await gate;return convert(b);},{reopen:{storeId:f.storeId,context:ctx()}});
 const pending=slow.store(ctx(owner),png,'image/png',true);await started;const opening=reopen(f.storeId);release();const id=await pending,s=await opening;
 expect((await s.read(owner,id,'original')).bytes).toEqual(png);expect(s.startupReport.movedOrphans).toEqual([]);
});
it('reconciliation retries safely after audit rollback without deleting orphan evidence',async()=>{
 const f=await fixture(),name=randomUUID()+'.original';await writeFile(f.store.root+'/'+name,png,{mode:0o600});
 await db.pool.query("CREATE FUNCTION reject_reconcile_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='synthetic-receipt.reconcile' THEN RAISE EXCEPTION 'injected reconcile rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_reconcile_audit BEFORE INSERT ON audit_event FOR EACH ROW EXECUTE FUNCTION reject_reconcile_audit()");
 try{await expect(reopen(f.storeId)).rejects.toThrow('injected reconcile rollback');}finally{await db.pool.query('DROP TRIGGER reject_reconcile_audit ON audit_event; DROP FUNCTION reject_reconcile_audit()');}
 const s=await reopen(f.storeId);expect(s.startupReport.retainedOrphans).toContain(name);expect(await readFile(s.root+'/.orphans/'+name)).toEqual(png);expect((await s.read(owner,f.id,'original')).bytes).toEqual(png);
});
it('does not overwrite a conflicting orphan quarantine file',async()=>{
 const f=await fixture(),name=randomUUID()+'.original';await writeFile(f.store.root+'/'+name,png,{mode:0o600});await writeFile(f.store.root+'/.orphans/'+name,'older evidence',{mode:0o600});
 await expect(reopen(f.storeId)).rejects.toThrow('ORPHAN_COLLISION');expect(await readFile(f.store.root+'/'+name)).toEqual(png);expect(await readFile(f.store.root+'/.orphans/'+name,'utf8')).toBe('older evidence');
});
