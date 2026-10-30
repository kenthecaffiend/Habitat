import {isAbsolute} from 'node:path';
import {z} from 'zod';
const schema=z.object({APP_ENV:z.enum(['dev','test']),DATABASE_URL:z.string().url(),APP_ORIGIN:z.string().url(),SESSION_SECRET:z.string().min(32),MAIL_TRANSPORT:z.literal('capture'),STORAGE_ENV:z.enum(['dev','test'])});
export function readConfig(input:Record<string,string|undefined>){
 if(input.HR_RECOVERY_QUARANTINE)throw new Error('RECOVERY_QUARANTINE: processing disabled');
 const e=schema.parse(input);const db=new URL(e.DATABASE_URL),origin=new URL(e.APP_ORIGIN);
 if(!['127.0.0.1','localhost','[::1]'].includes(db.hostname)||!['postgres:','postgresql:'].includes(db.protocol)||db.pathname!==('/hr_'+e.APP_ENV))throw new Error('Development database identity required');
 if(!['127.0.0.1','localhost','[::1]'].includes(origin.hostname)||!['http:','https:'].includes(origin.protocol)||origin.origin!==e.APP_ORIGIN)throw new Error('Exact loopback origin required');
 if(e.STORAGE_ENV!==e.APP_ENV)throw new Error('Storage identity mismatch');
 if(Object.entries(input).some(([k,v])=>v&&/^(SMTP_|GOOGLE_|MAIL_PASSWORD|MAIL_TOKEN)/.test(k)))throw new Error('Live mail credentials forbidden in this checkpoint');
 let syntheticUploads:{storeId:string;parent:string}|undefined;if(input.HR_SYNTHETIC_UPLOADS){if(input.HR_SYNTHETIC_UPLOADS!=='synthetic-local'||!z.uuid().safeParse(input.HR_RECEIPT_STORE_ID).success||!input.HR_RECEIPT_PARENT||!isAbsolute(input.HR_RECEIPT_PARENT))throw Error('Explicit synthetic private storage configuration required');syntheticUploads={storeId:input.HR_RECEIPT_STORE_ID!,parent:input.HR_RECEIPT_PARENT};}
 return {passwordChangeEnabled:true,syntheticUploads,environment:e.APP_ENV,databaseUrl:e.DATABASE_URL,origin:e.APP_ORIGIN,secret:e.SESSION_SECRET,cookiePrefix:'hr-'+e.APP_ENV,secureCookies:origin.protocol==='https:',mailTransport:'capture' as const};
}
export type Config=ReturnType<typeof import('./actual-config').readActualDraftConfig>|ReturnType<typeof readConfig>|import('./production-config').LockedProductionConfig|ReturnType<typeof import('./preview-config').readSyntheticPreviewConfig>;
