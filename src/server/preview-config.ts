import {z} from 'zod';
import {readFileSync,lstatSync} from 'node:fs';import {previewConfig} from '../../ops/deploy/policy.mjs';
export function readSyntheticPreviewConfig(identity:unknown,keys:{session:string;app_db:string}){
 const c=previewConfig(identity);if(!/^[a-f0-9]{96}$/.test(keys.session)||!/^[a-f0-9]{96}$/.test(keys.app_db))throw Error('PREVIEW_SECRET');const db=new URL('postgresql://hr_uat_app@db:5432/hr_uat');db.password=keys.app_db;
 let syntheticUploads:{storeId:string;parent:string}|undefined;if(c.receiptUploads!==undefined||c.receiptStoreId!==undefined){if(c.receiptUploads!=='synthetic-private'||!z.uuid().safeParse(c.receiptStoreId).success)throw Error('PREVIEW_RECEIPT_CONFIG');syntheticUploads={storeId:c.receiptStoreId,parent:'/run/hr/receipts'};}
 return {environment:'test' as const,syntheticPreview:true as const,databaseUrl:db.toString(),origin:c.origin,secret:keys.session,cookiePrefix:'hr-uat',secureCookies:true,mailTransport:'capture' as const,syntheticUploads};
}
export function readSyntheticPreviewConfigFiles(){if(process.env.HR_RECOVERY_QUARANTINE)throw Error('RECOVERY_QUARANTINE');function key(name:string){const p='/run/secrets/'+name,s=lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||s.size>512)throw Error('PREVIEW_SECRET');return readFileSync(p,'utf8').trim();}return readSyntheticPreviewConfig(JSON.parse(readFileSync('/run/hr/config.json','utf8')),{session:key('session'),app_db:key('app_db')});}
