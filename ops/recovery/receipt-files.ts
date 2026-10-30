import {RECEIPT_LIMITS as L} from '../../src/modules/files/limits';
// Bounded synthetic recovery only. Caller holds the receipt write lock before its DB snapshot.
import {createHash} from 'node:crypto';import {constants} from 'node:fs';
import {open,lstat,readdir,mkdir,mkdtemp} from 'node:fs/promises';import {join} from 'node:path';import {z} from 'zod';
const sha=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
const nameSchema=z.string().regex(/^[0-9a-f-]{36}\.(original|preview\.png)$/).refine(n=>z.uuid().safeParse(n.slice(0,36)).success);
export const receiptFileSchema=z.object({storeId:z.uuid(),name:nameSchema,place:z.enum(['active','orphan']),sourcePlace:z.enum(['active','orphan']),size:z.number().int().nonnegative().max(L.originalBytes),sha256:z.string().regex(/^[a-f0-9]{64}$/),bytes:z.string().max(4*Math.ceil(L.originalBytes/3))}).strict();
export const receiptInventorySchema=z.object({storeId:z.uuid(),count:z.number().int().nonnegative().max(L.files),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
type File=z.infer<typeof receiptFileSchema>;type Inventory=z.infer<typeof receiptInventorySchema>;type Table={name:string;rows:Record<string,any>[]};
const rows=(tables:Table[],name:string)=>tables.find(t=>t.name===name)?.rows??[];
const inventoryHash=(files:File[])=>sha(JSON.stringify([...files].sort((a,b)=>(a.place+'/'+a.name).localeCompare(b.place+'/'+b.name)).map(f=>[f.storeId,f.name,f.place,f.sourcePlace,f.size,f.sha256])));
async function directory(path:string){const s=await lstat(path);if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077)!==0)throw Error('RECEIPT_DIRECTORY');return s;}
async function fileBytes(path:string){const f=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{const s=await f.stat();if(!s.isFile()||s.nlink!==1||(s.mode&0o077)!==0||s.size>(path.endsWith('.preview.png')?L.previewBytes:L.originalBytes))throw Error('RECEIPT_FILE');const b=await f.readFile();if(b.length!==s.size)throw Error('RECEIPT_CHANGED');return b;}finally{await f.close();}}
export async function captureReceiptFiles(tables:Table[]){
 const files:File[]=[],inventory:Inventory[]=[];let total=0;
 for(const store of rows(tables,'private_receipt_store')){
  const s=await directory(store.root);if(store.environment!=='test'||String(s.dev)!==store.device||String(s.ino)!==store.inode)throw Error('RECEIPT_IDENTITY');await directory(join(store.root,'.orphans'));
  const refs=new Set(rows(tables,'private_receipt_file').filter(r=>r.store_id===store.id).map(r=>r.attachment_id));
  for(const sourcePlace of ['active','orphan'] as const){const root=sourcePlace==='active'?store.root:join(store.root,'.orphans');
   for(const name of await readdir(root)){if(sourcePlace==='active'&&name==='.orphans')continue;nameSchema.parse(name);const bytes=await fileBytes(join(root,name));total+=bytes.length;if(total>L.totalBytes||files.length>=L.files)throw Error('RECEIPT_SYNTHETIC_LIMIT');files.push({storeId:store.id,name,sourcePlace,place:sourcePlace==='orphan'||!refs.has(name.slice(0,36))?'orphan':'active',size:bytes.length,sha256:sha(bytes),bytes:bytes.toString('base64')});}
  }
  const own=files.filter(f=>f.storeId===store.id);inventory.push({storeId:store.id,count:own.length,sha256:inventoryHash(own)});
 }
 validateReceiptFiles(tables,files,inventory);return {files,inventory};
}
export function validateReceiptFiles(tables:Table[],files:File[],inventory:Inventory[]){
 const stores=rows(tables,'private_receipt_store'),refs=rows(tables,'private_receipt_file'),attachments=rows(tables,'private_attachment'),seen=new Set<string>();let total=0;
 if(inventory.length!==stores.length||new Set(inventory.map(x=>x.storeId)).size!==inventory.length)throw Error('RECEIPT_INVENTORY');
 for(const store of stores){const own=files.filter(f=>f.storeId===store.id),i=inventory.find(i=>i.storeId===store.id);if(!i||i.count!==own.length||i.sha256!==inventoryHash(own))throw Error('RECEIPT_INVENTORY');}
 for(const f of files){const key=f.storeId+'/'+f.place+'/'+f.name,b=Buffer.from(f.bytes,'base64');total+=b.length;if(f.size>(f.name.endsWith('.preview.png')?L.previewBytes:L.originalBytes)||seen.has(key)||!stores.some(s=>s.id===f.storeId)||b.length!==f.size||b.toString('base64')!==f.bytes||sha(b)!==f.sha256||total>L.totalBytes)throw Error('RECEIPT_FILE_MANIFEST');seen.add(key);if(f.place==='active'&&!refs.some(r=>r.store_id===f.storeId&&r.attachment_id===f.name.slice(0,36)))throw Error('RECEIPT_UNCLASSIFIED');}
 for(const ref of refs){const a=attachments.find(a=>a.id===ref.attachment_id);if(!a||!stores.some(s=>s.id===ref.store_id))throw Error('RECEIPT_UNREGISTERED');for(const [suffix,size,checksum] of [['.original',a.size_bytes,a.checksum],['.preview.png',ref.preview_size,ref.preview_hash]]){const f=files.find(f=>f.storeId===ref.store_id&&f.place==='active'&&f.name===a.id+suffix);if(!f||f.size!==size||f.sha256!==checksum)throw Error('RECEIPT_MISSING_OR_CORRUPT');}}
}
async function syncDirectory(root:string){const f=await open(root,constants.O_RDONLY|constants.O_NOFOLLOW);try{await f.sync();}finally{await f.close();}}
export async function materializeReceiptFiles(directoryRoot:string,tables:Table[],files:File[]){
 const reboundStores=[];
 for(const store of rows(tables,'private_receipt_store')){
  const root=await mkdtemp(join(directoryRoot,'receipts-'));await mkdir(join(root,'.orphans'),{mode:0o700});
  for(const item of files.filter(f=>f.storeId===store.id)){const path=join(item.place==='active'?root:join(root,'.orphans'),item.name),file=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);try{await file.writeFile(Buffer.from(item.bytes,'base64'));await file.sync();}finally{await file.close();}if(sha(await fileBytes(path))!==item.sha256)throw Error('RECEIPT_RESTORE_HASH');}
  await syncDirectory(join(root,'.orphans'));await syncDirectory(root);const s=await directory(root);reboundStores.push({storeId:store.id,sourceRoot:store.root,root,device:String(s.dev),inode:String(s.ino)});
 }
 await syncDirectory(directoryRoot);return {verified:files.length,reboundStores,retainedOrphans:files.filter(f=>f.place==='orphan').map(({bytes,...f})=>f)};
}
