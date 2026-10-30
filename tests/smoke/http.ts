import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {createServer} from 'node:net';import {once} from 'node:events';import {disposablePostgres} from '../helpers/postgres';import {createApplication} from '../../src/server/application';import {readConfig} from '../../src/server/config';
const port=await new Promise<number>(resolve=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=(s.address() as {port:number}).port;s.close(()=>resolve(p));});});
const db=await disposablePostgres();const origin='http://127.0.0.1:'+port;
const env={...process.env,APP_ENV:'test',DATABASE_URL:db.url,APP_ORIGIN:origin,SESSION_SECRET:'synthetic-http-smoke-secret-no-live-values',MAIL_TRANSPORT:'capture',STORAGE_ENV:'test',NEXT_TELEMETRY_DISABLED:'1'};
let child:ReturnType<typeof spawn>|undefined;let output='';
try{
 const app=await createApplication(db.pool,readConfig(env));await app.bootstrap({name:'Synthetic HTTP Owner',email:'http@example.invalid',password:'synthetic-http-password'});
 child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env,stdio:['ignore','pipe','pipe']});
 child.stdout?.on('data',d=>{output+=String(d);});child.stderr?.on('data',d=>{output+=String(d);});
 let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(origin+'/login')).status===200;if(ready)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 assert(ready,'Next server did not start');
 assert.equal((await fetch(origin+'/api/employee')).status,401);
 assert.equal((await fetch(origin+'/employee',{redirect:'manual'})).status,307);
 const login=await fetch(origin+'/api/auth/sign-in/email',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({email:'http@example.invalid',password:'synthetic-http-password'})});assert.equal(login.status,200,'Login failed');
 const cookie=login.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
 const page=await fetch(origin+'/employee',{headers:{cookie}});assert.equal(page.status,200);const html=await page.text();for(const label of ['Payslips','Leave','Claims','Administrator view'])assert(html.includes(label),label+' absent');
 assert.equal((await fetch(origin+'/api/auth/sign-out',{method:'POST',headers:{cookie,origin:origin+'1'}})).status,403);
 console.log('HTTP smoke passed: compiled server, unauthenticated API/page, real login, three-link shell, admin switch, cross-origin write rejection.');
}catch(error){console.error(output.slice(-6000));throw error;}
finally{if(child&&child.exitCode===null){const exited=once(child,'exit');child.kill('SIGTERM');await exited;}await db.stop();}
