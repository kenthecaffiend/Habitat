import {z} from 'zod';import {lstat,readdir} from 'node:fs/promises';import {join} from 'node:path';import type {DbTx} from '../../server/db';import {RECEIPT_LIMITS as L} from './limits';
// Caller holds the receipt/claim write lock; include abandoned and quarantined bytes.
export async function assertReceiptCapacity(tx:DbTx,additionalBytes:number,additionalFiles:number){
 const stores=(await tx.query('SELECT * FROM private_receipt_store')).rows;let bytes=0,files=0;
 if(stores.length>L.stores||(await tx.query('SELECT 1 FROM private_receipt_file f LEFT JOIN private_receipt_store s ON s.id=f.store_id WHERE s.id IS NULL LIMIT 1')).rowCount)throw Error('RECEIPT_CAPACITY_UNVERIFIED');
 for(const store of stores){const root=await lstat(store.root);if(!root.isDirectory()||root.isSymbolicLink()||String(root.dev)!==store.device||String(root.ino)!==store.inode||(root.mode&0o077)!==0)throw Error('RECEIPT_CAPACITY_UNVERIFIED');
  for(const path of [store.root,join(store.root,'.orphans')]){const dir=await lstat(path);if(!dir.isDirectory()||dir.isSymbolicLink()||(dir.mode&0o077)!==0)throw Error('RECEIPT_CAPACITY_UNVERIFIED');for(const name of await readdir(path)){if(path===store.root&&name==='.orphans')continue;if(!/^[0-9a-f-]{36}\.(original|preview\.png)$/.test(name)||!z.uuid().safeParse(name.slice(0,36)).success)throw Error('RECEIPT_CAPACITY_UNVERIFIED');const stat=await lstat(join(path,name));if(stat.size>(name.endsWith('.preview.png')?L.previewBytes:L.originalBytes)||!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||(stat.mode&0o077)!==0)throw Error('RECEIPT_CAPACITY_UNVERIFIED');bytes+=stat.size;files++;}}
 }
 if(bytes+additionalBytes>L.totalBytes||files+additionalFiles>L.files)throw Error('RECEIPT_CAPACITY');
}
