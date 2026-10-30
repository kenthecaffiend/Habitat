// Run on the approved host only. Input is nonsecret deployment identity JSON.
import {mkdirSync,writeFileSync,existsSync,chmodSync,readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {join,resolve} from 'node:path';
import {stageConfig} from './policy.mjs';
const c=stageConfig(JSON.parse(readFileSync(0,'utf8'))),root=resolve(process.argv[2]);
if(!root.endsWith('/AI-Server/hr/prod'))throw Error('ROOT');
if(existsSync(join(root,'config.json')))throw Error('EXISTING_INSTALLATION');
for(const d of ['', 'secrets','state','backup','files','logs']){mkdirSync(join(root,d),{recursive:true,mode:0o700});chmodSync(join(root,d),0o700);}
for(const s of ['operator','session','owner_db','app_db','renderer','backup'])writeFileSync(join(root,'secrets',s),randomBytes(48).toString('hex')+'\n',{mode:0o600,flag:'wx'});
// Parent directory is owner-only; the Postgres UID can read only this explicitly mounted secret.
chmodSync(join(root,'secrets/owner_db'),0o444);
writeFileSync(join(root,'config.json'),JSON.stringify(c,null,2),{mode:0o600,flag:'wx'});
const base={user:'999:999',restart:'unless-stopped',labels:{'com.centurylinklabs.watchtower.enable':'false'},security_opt:['no-new-privileges:true'],cap_drop:['ALL'],logging:{driver:'local',options:{'max-size':'5m','max-file':'2'}}};
const compose={name:'hr-prod',services:{db:{...base,image:'postgres:17@sha256:b8faeff7712663c2773a190181e1246e37e364b887611c04658c28b44e2408fe',environment:{POSTGRES_DB:'hr_prod',POSTGRES_USER:'hr_owner',POSTGRES_PASSWORD_FILE:'/run/secrets/owner_db'},secrets:['owner_db'],volumes:['database:/var/lib/postgresql/data'],networks:['database'],mem_limit:'512m',cpus:1,pids_limit:128,healthcheck:{test:['CMD-SHELL','pg_isready -U hr_owner -d hr_prod'],interval:'5s',timeout:'3s',retries:12}},web:{...base,image:c.image,user:'501:20',read_only:true,tmpfs:['/tmp:rw,noexec,nosuid,size=32m'],ports:['127.0.0.1:3132:3000'],volumes:[root+'/config.json:/run/hr/config.json:ro'],secrets:['operator','session','app_db'],networks:['database','web'],mem_limit:'768m',cpus:1,pids_limit:128,depends_on:{db:{condition:'service_healthy'}},healthcheck:{test:['CMD','node','-e',"require('http').get('http://127.0.0.1:3000/healthz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"],interval:'10s',timeout:'5s',retries:6}}},networks:{database:{internal:true},web:{internal:true}},volumes:{database:{}},secrets:Object.fromEntries(['owner_db','operator','session','app_db'].map(s=>[s,{file:root+'/secrets/'+s}]))};
// Docker does not publish host ports for an internal-only web network. DB stays internal.
compose.networks.web={internal:false};
compose.services.web.environment={HR_PRODUCTION_PROFILE:'locked'};
compose.services.web.secrets.push('renderer');
compose.secrets.renderer={file:root+'/secrets/renderer'};
writeFileSync(join(root,'compose.json'),JSON.stringify(compose,null,2),{mode:0o600,flag:'wx'});
console.log('HR-only configuration and six private secret files created. No secret values emitted.');
