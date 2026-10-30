import {readFileSync,lstatSync} from 'node:fs';
import {stageConfig} from '../../ops/deploy/policy.mjs';
export function readLockedProductionConfig(identity:unknown,keys:{session:string;app_db:string;renderer:string}){
 const c=stageConfig(identity);if(c.environment!=='prod'||Object.values(keys).some(v=>!/^[a-f0-9]{96}$/.test(v)))throw Error('PRODUCTION_CONFIG');
 const db=new URL('postgresql://hr_app@db:5432/hr_prod');db.password=keys.app_db;
 return {environment:'prod' as const,productionLocked:true as const,databaseUrl:db.toString(),origin:c.origin,secret:keys.session,cookiePrefix:'hr-prod',secureCookies:true,mailTransport:'capture' as const,syntheticUploads:undefined,rendererToken:keys.renderer};
}
export type LockedProductionConfig=ReturnType<typeof readLockedProductionConfig>;
export function readLockedProductionConfigFiles(){
 if(process.env.HR_RECOVERY_QUARANTINE)throw Error('RECOVERY_QUARANTINE');
 function key(name:string){const p='/run/secrets/'+name,s=lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||s.size>512)throw Error('PRODUCTION_SECRET');return readFileSync(p,'utf8').trim();}
 return readLockedProductionConfig(JSON.parse(readFileSync('/run/hr/config.json','utf8')),{session:key('session'),app_db:key('app_db'),renderer:key('renderer')});
}
