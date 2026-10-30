import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {disposablePostgres} from '../helpers/postgres';import {createApplication} from '../../src/server/application';import {readConfig} from '../../src/server/config';
let cookie='';let loginEmail='';let loginPassword='';
let db:Awaited<ReturnType<typeof disposablePostgres>>,app:Awaited<ReturnType<typeof createApplication>>;
const origin='http://127.0.0.1:3130';
beforeAll(async()=>{db=await disposablePostgres();app=await createApplication(db.pool,readConfig({APP_ENV:'test',DATABASE_URL:db.url,APP_ORIGIN:origin,SESSION_SECRET:'synthetic-only-long-session-secret-for-tests',MAIL_TRANSPORT:'capture',STORAGE_ENV:'test'}));});
afterAll(async()=>{await db?.stop();});
describe('foundation access boundary',()=>{
 it('unauthenticated employee data is rejected',async()=>{expect((await app.handle(new Request(origin+'/api/employee'))).status).toBe(401);});
 it('public signup stays closed',async()=>{expect((await app.handle(new Request(origin+'/api/auth/sign-up/email',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({name:'Attacker',email:'a@example.invalid',password:'long-enough-password'})}))).status).toBe(403);});
 it('cross-origin state mutation fails',async()=>{expect((await app.handle(new Request(origin+'/api/auth/sign-in/email',{method:'POST',headers:{origin:'http://127.0.0.1:3131','content-type':'application/json'},body:'{}'}))).status).toBe(403);});
 it('bootstrap is one-use even with concurrent requests',async()=>{const results=await Promise.allSettled([app.bootstrap({name:'Synthetic Owner',email:'owner@example.invalid',password:'synthetic-owner-password'}),app.bootstrap({name:'Other Owner',email:'other@example.invalid',password:'synthetic-other-password'})]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);const winner=results.findIndex(r=>r.status==='fulfilled');loginEmail=winner===0?'owner@example.invalid':'other@example.invalid';loginPassword=winner===0?'synthetic-owner-password':'synthetic-other-password';});
 it('real login gives a session and protected employee view',async()=>{const r=await app.handle(new Request(origin+'/api/auth/sign-in/email',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({email:loginEmail,password:loginPassword})}));expect(r.status).toBe(200);cookie=r.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');expect(cookie).toContain('hr-test');const view=await app.handle(new Request(origin+'/api/employee',{headers:{cookie}}));expect(view.status).toBe(200);expect(await view.json()).toMatchObject({role:'admin'});});
 it('employee cannot read another owner document or admin view',async()=>{
 const {rows:[owner]}=await db.pool.query('SELECT id FROM employee');
 await db.pool.query("INSERT INTO \"user\"(id,name,email) VALUES('synthetic-b','B','b@example.invalid')");
 await db.pool.query("INSERT INTO employee(id,user_id,role) VALUES('00000000-0000-4000-8000-000000000002','synthetic-b','employee')");
 await db.pool.query("INSERT INTO document(id,employee_id,kind,title) VALUES('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002','payslip','Synthetic B')");
 await db.pool.query("UPDATE employee SET role='employee' WHERE id=$1",[owner.id]);
 expect((await app.handle(new Request(origin+'/api/documents/00000000-0000-4000-8000-000000000003',{headers:{cookie}}))).status).toBe(404);
 expect((await app.handle(new Request(origin+'/api/admin/payroll',{headers:{cookie}}))).status).toBe(403);
 await db.pool.query("UPDATE employee SET role='admin' WHERE id=$1",[owner.id]);
 expect((await app.handle(new Request(origin+'/api/documents/00000000-0000-4000-8000-000000000003',{headers:{cookie}}))).status).toBe(200);
 });
 it('cookie renamed to another environment does not authenticate',async()=>{expect((await app.handle(new Request(origin+'/api/employee',{headers:{cookie:cookie.replaceAll('hr-test','hr-dev')}}))).status).toBe(401);});
 it('missing origin on mutation is refused',async()=>expect((await app.handle(new Request(origin+'/api/auth/sign-out',{method:'POST',headers:{cookie}}))).status).toBe(403));
 it('revoking stored session takes immediate effect',async()=>{await db.pool.query('DELETE FROM session');expect((await app.handle(new Request(origin+'/api/employee',{headers:{cookie}}))).status).toBe(401);});
 it('expired session is rejected without a client cookie cache',async()=>{
 const login=await app.handle(new Request(origin+'/api/auth/sign-in/email',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({email:loginEmail,password:loginPassword})}));expect(login.status).toBe(200);
 const freshCookie=login.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');expect((await app.handle(new Request(origin+'/api/employee',{headers:{cookie:freshCookie}}))).status).toBe(200);
 await db.pool.query("UPDATE session SET expires_at=now()-interval '1 minute'");expect((await app.handle(new Request(origin+'/api/employee',{headers:{cookie:freshCookie}}))).status).toBe(401);
 });
 it('login throttling persists across application restart and ignores forged forwarding IP',async()=>{
 const attempt=async(target:typeof app)=>target.handle(new Request(origin+'/api/auth/sign-in/email',{method:'POST',headers:{origin,'content-type':'application/json','x-forwarded-for':String(Math.random())},body:JSON.stringify({email:'unknown@example.invalid',password:'synthetic-wrong-password'})}));
 let status=0;for(let i=0;i<6;i++)status=(await attempt(app)).status;expect(status).toBe(429);
 const restarted=await createApplication(db.pool,readConfig({APP_ENV:'test',DATABASE_URL:db.url,APP_ORIGIN:origin,SESSION_SECRET:'synthetic-only-long-session-secret-for-tests',MAIL_TRANSPORT:'capture',STORAGE_ENV:'test'}));expect((await attempt(restarted)).status).toBe(429);
 });
 it('database identity mismatch blocks startup',async()=>{await db.pool.query("UPDATE environment_identity SET environment='production'");await expect(createApplication(db.pool,readConfig({APP_ENV:'test',DATABASE_URL:db.url,APP_ORIGIN:origin,SESSION_SECRET:'synthetic-only-long-session-secret-for-tests',MAIL_TRANSPORT:'capture',STORAGE_ENV:'test'}))).rejects.toThrow(/identity/i);});
});
