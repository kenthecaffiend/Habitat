// Empty-staging recovery rehearsal only. Never exports real employee data.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createCipheriv,createDecipheriv,randomBytes,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
const root=process.argv[2],compose=['compose','-f',join(root,'compose.json')];
function run(args,input){const r=spawnSync('docker',args,{input,maxBuffer:16*1024*1024,timeout:60000});if(r.status!==0)throw Error('RECOVERY_COMMAND_FAILED');return r.stdout;}
function sql(database,text){return run([...compose,'exec','-T','db','psql','-X','-q','-At','-v','ON_ERROR_STOP=1','-U','hr_owner','-d',database],text).toString().trim();}
if(sql('hr_prod','SELECT count(*) FROM employee;')!=='0')throw Error('REAL_DATA_REFUSED');
const dump=run([...compose,'exec','-T','db','pg_dump','-U','hr_owner','-d','hr_prod','-Fc']);
const key=Buffer.from(readFileSync(join(root,'secrets/backup'),'utf8').trim(),'hex').subarray(0,32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv),encrypted=Buffer.concat([cipher.update(dump),cipher.final()]),tag=cipher.getAuthTag();
const archive=Buffer.concat([Buffer.from('HRSTAGE1'),iv,tag,encrypted]),path=join(root,'backup','empty-staging-'+Date.now()+'.aes');writeFileSync(path,archive,{mode:0o600,flag:'wx'});
function decrypt(a){if(a.subarray(0,8).toString()!=='HRSTAGE1')throw Error('FORMAT');const d=createDecipheriv('aes-256-gcm',key,a.subarray(8,20));d.setAuthTag(a.subarray(20,36));return Buffer.concat([d.update(a.subarray(36)),d.final()]);}
const restored=decrypt(readFileSync(path));if(!restored.equals(dump))throw Error('ROUNDTRIP');const damaged=Buffer.from(archive);damaged[damaged.length-1]^=1;let refused=false;try{decrypt(damaged);}catch{refused=true;}if(!refused)throw Error('TAMPER_ACCEPTED');
const target='hr_restore_'+Date.now();sql('postgres','CREATE DATABASE '+target+';');
try{run([...compose,'exec','-T','db','pg_restore','-U','hr_owner','-d',target,'--exit-on-error'],restored);sql(target,'CREATE TABLE recovery_quarantine(id integer PRIMARY KEY); INSERT INTO recovery_quarantine VALUES(1);');if(sql(target,'SELECT count(*) FROM employee; SELECT count(*) FROM schema_migration; SELECT count(*) FROM recovery_quarantine;')!=='0\n17\n1')throw Error('RESTORE_CHECK');}finally{sql('postgres','DROP DATABASE '+target+';');}
console.log(JSON.stringify({encryptedBackup:path,sha256:createHash('sha256').update(archive).digest('hex'),employees:0,migrations:17,authenticatedEncryption:true,tamperRefused:true,quarantinedRestore:true,offServerBackup:false}));
