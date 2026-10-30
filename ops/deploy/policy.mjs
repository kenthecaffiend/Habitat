import {createHmac,timingSafeEqual} from 'node:crypto';
export function equal(a,b){const x=Buffer.from(String(a??'')),y=Buffer.from(String(b??''));return x.length===y.length&&timingSafeEqual(x,y);}
function privateConfig(c,mode){
 if(!c||!['uat','prod'].includes(c.environment)||c.mode!==mode||c.database!=='hr_'+c.environment||c.dbHost!=='db'||!/^\S+@\S+$/.test(c.ownerLogin)||!/^([a-f0-9]{40})$/.test(c.release)||!/^sha256:[a-f0-9]{64}$/.test(c.image))throw Error('STAGE_IDENTITY');
 const u=new URL(c.origin);if(u.protocol!=='https:'||u.hostname!==c.approvedHost||!u.hostname.endsWith('.ts.net')||u.username||u.password||u.pathname!=='/'||u.search||u.hash||u.origin!==c.origin||u.port!==(c.environment==='prod'?'8452':'8451'))throw Error('PRIVATE_ORIGIN');
 return Object.freeze({...c});
}
export function stageConfig(c){return privateConfig(c,'staged-empty');}
const name=c=>'hr-'+c.environment+'-stage';
const sign=(s,key)=>createHmac('sha256',key).update(s).digest('hex');
export function ownerAllowed(h,c){return equal(h['tailscale-user-login'],c.ownerLogin)&&h.host===new URL(c.origin).host;}
export function session(c,keys,now=Math.floor(Date.now()/1000)){const body=String(now+3600);return name(c)+'='+body+'.'+sign(c.environment+':'+body,keys.session);}
export function authorised(h,c,keys,now=Math.floor(Date.now()/1000)){
 if(!ownerAllowed(h,c))return false;
 if(equal(h.authorization,'Basic '+Buffer.from('operator:'+keys.operator).toString('base64')))return true;
 const cookie=(h.cookie??'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name(c)+'='));if(!cookie)return false;
 const value=cookie.slice(name(c).length+1),[expiry,mac,...rest]=value.split('.');return rest.length===0&&/^\d+$/.test(expiry)&&Number(expiry)>now&&Number(expiry)<=now+3600&&equal(mac,sign(c.environment+':'+expiry,keys.session));
}
export function route(method,path){if(!['GET','HEAD'].includes(method))return null;if(path==='/'||path==='/staged')return '/staged';if(/^\/_next\/static\/[a-zA-Z0-9_./-]+$/.test(path)&&!path.includes('..'))return path;return null;}
export function previewConfig(c){if(c?.environment!=='uat')throw Error('PREVIEW_IDENTITY');return privateConfig(c,'synthetic-preview');}
export function previewRoute(method,path){
 if(typeof path!=='string'||path.length>2048||/[\\\u0000-\u001f]/.test(path)||!path.startsWith('/')||path.startsWith('//')||path.includes('..'))return null;
 const p=new URL(path,'http://preview.invalid').pathname;
 if(['GET','HEAD'].includes(method)){
  if(p==='/images/galaxy-background.webp'||/^\/_next\/static\/[a-zA-Z0-9_./-]+$/.test(p)||/^\/(?:login|admin(?:\/(?:employees|payroll|payslips|leave|claims|branding))?|employee(?:\/(?:payslips|leave|claims|profile))?)?\/?$/.test(p))return path;
  if(/^\/api\/(?:files(?:\/(?:status|[a-f0-9-]{36}))?|branding(?:\/(?:logo|public-logo|favicon))?|employee|employees(?:\/(?:history|profile|me))?|auth\/get-session|leave(?:\/(?:employees|profile|holds|opening|files(?:\/[a-f0-9-]{36})?))?|claims|payroll(?:\/(?:profiles|settings|readiness|locks))?|payslips(?:\/(?:history|document|pdf))?)$/.test(p))return path;
 }
 if(method==='POST'&&/^\/api\/(?:files(?:\/initialize)?|branding\/(?:logo|reset)|auth\/(?:sign-in\/email|sign-out)|employees\/(?:add|edit|archive|profile|balance|me\/address)|leave\/(?:profile|opening|reconcile-month|preview|submit|decision|amend|exception|review|files)|claims\/(?:submit|decision|edit|withdraw)|payroll\/(?:settings|monthly|profile|draft|revise|approve|void|payment-date|salary-payment|cpf-payment|payment-exception|resolve-correction|correction))$/.test(p))return path;
 return null;
}
