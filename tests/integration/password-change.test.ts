import {afterAll,beforeAll,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {verify} from '@node-rs/argon2';
import {disposablePostgres} from '../helpers/postgres';
import {createApplication} from '../../src/server/application';
import {readConfig} from '../../src/server/config';
import {hashPassword} from '../../src/server/auth';
let db:Awaited<ReturnType<typeof disposablePostgres>>,app:Awaited<ReturnType<typeof createApplication>>;
const origin='http://127.0.0.1:3130',oldPassword='synthetic-old-password',newPassword='synthetic-new-password';
beforeAll(async()=>{db=await disposablePostgres();app=await createApplication(db.pool,readConfig({APP_ENV:'test',DATABASE_URL:db.url,APP_ORIGIN:origin,SESSION_SECRET:'synthetic-password-test-secret-at-least32',MAIL_TRANSPORT:'capture',STORAGE_ENV:'test'}));});
afterAll(async()=>{await db?.stop();});
async function account(){const userId=randomUUID(),email=userId+'@example.invalid';await db.pool.query('INSERT INTO "user"(id,name,email,email_verified) VALUES($1,$2,$3,true)',[userId,'Synthetic password test',email]);await db.pool.query("INSERT INTO employee(id,user_id,role) VALUES($1,$2,'employee')",[randomUUID(),userId]);await db.pool.query("INSERT INTO account(id,account_id,provider_id,user_id,password) VALUES($1,$2,'credential',$2,$3)",[randomUUID(),userId,await hashPassword(oldPassword)]);return {userId,email};}
async function request(path:string,body?:unknown,cookie='',requestOrigin=origin){return app.auth.handler(new Request(origin+'/api/auth/'+path,{method:body===undefined?'GET':'POST',headers:{origin:requestOrigin,cookie,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}));}
function cookies(r:Response){return r.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');}
async function login(email:string,password=oldPassword){const r=await request('sign-in/email',{email,password});expect(r.status).toBe(200);return cookies(r);}
async function clearLimits(){await db.pool.query('DELETE FROM rate_limit');}
it('changes only the authenticated credential and rotates all existing sessions',async()=>{
 await clearLimits();const first=await account(),other=await account(),cookie=await login(first.email),second=await login(first.email),otherBefore=(await db.pool.query('SELECT password FROM account WHERE user_id=$1',[other.userId])).rows[0].password;
 const response=await request('change-password',{currentPassword:oldPassword,newPassword,revokeOtherSessions:true,userId:other.userId},cookie);expect(response.status).toBe(200);
 const stored=(await db.pool.query('SELECT password FROM account WHERE user_id=$1',[first.userId])).rows[0].password;expect(stored).not.toBe(newPassword);expect(await verify(stored,newPassword)).toBe(true);expect(await verify(stored,oldPassword)).toBe(false);
 expect((await db.pool.query('SELECT password FROM account WHERE user_id=$1',[other.userId])).rows[0].password).toBe(otherBefore);
 expect(await(await request('get-session',undefined,cookie)).json()).toBeNull();expect(await(await request('get-session',undefined,second)).json()).toBeNull();expect(await(await request('get-session',undefined,cookies(response))).json()).toMatchObject({user:{id:first.userId}});
 expect((await request('change-password',{currentPassword:oldPassword,newPassword:'synthetic-third-password',revokeOtherSessions:true},cookies(response))).status).toBe(400);
});
it('rejects unauthenticated, wrong-current, empty, long and cross-origin changes without mutation',async()=>{
 await clearLimits();const user=await account(),cookie=await login(user.email),before=(await db.pool.query('SELECT password FROM account WHERE user_id=$1',[user.userId])).rows[0].password;
 expect((await request('change-password',{currentPassword:oldPassword,newPassword},'')).status).toBe(401);
 for(const input of [{currentPassword:'synthetic-wrong-password',newPassword},{currentPassword:oldPassword,newPassword:''},{currentPassword:oldPassword,newPassword:'x'.repeat(129)}]){await clearLimits();expect((await request('change-password',input,cookie)).status).toBe(400);}
 expect((await app.handle(new Request(origin+'/api/auth/change-password',{method:'POST',headers:{origin:'https://foreign.example.invalid',cookie,'content-type':'application/json'},body:JSON.stringify({currentPassword:oldPassword,newPassword,revokeOtherSessions:true})}))).status).toBe(403);
 expect((await db.pool.query('SELECT password FROM account WHERE user_id=$1',[user.userId])).rows[0].password).toBe(before);
});
it('throttles password guesses after five attempts in a minute',async()=>{
 await clearLimits();const user=await account(),cookie=await login(user.email);await clearLimits();
 for(let i=0;i<5;i++)expect((await request('change-password',{currentPassword:'synthetic-wrong-password',newPassword},cookie)).status).toBe(400);
 expect((await request('change-password',{currentPassword:'synthetic-wrong-password',newPassword},cookie)).status).toBe(429);
});
it('keeps the password and sessions intact when credential storage fails',async()=>{
 await clearLimits();const user=await account(),cookie=await login(user.email);await clearLimits();
 const before=(await db.pool.query('SELECT password FROM account WHERE user_id=$1',[user.userId])).rows[0].password;
 await db.pool.query("CREATE FUNCTION synthetic_block_password_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic storage failure'; END $$; CREATE TRIGGER synthetic_block_password_update BEFORE UPDATE OF password ON account FOR EACH ROW EXECUTE FUNCTION synthetic_block_password_update()");
 try{await expect(app.auth.api.changePassword({headers:new Headers({origin,cookie}),body:{currentPassword:oldPassword,newPassword,revokeOtherSessions:true}})).rejects.toThrow();expect((await db.pool.query('SELECT password FROM account WHERE user_id=$1',[user.userId])).rows[0].password).toBe(before);expect(await(await request('get-session',undefined,cookie)).json()).toMatchObject({user:{id:user.userId}});}finally{await db.pool.query('DROP TRIGGER synthetic_block_password_update ON account; DROP FUNCTION synthetic_block_password_update()');}
});
it('guards the application route with capability, exact origin, strict body and active ownership',async()=>{
 await clearLimits();const user=await account(),other=await account(),cookie=await login(user.email),body={currentPassword:oldPassword,newPassword,revokeOtherSessions:true};
 const route=(payload:unknown=body,auth=cookie,requestOrigin:string|null=origin,method='POST',application=app)=>application.handle(new Request(origin+'/api/auth/change-password',{method,headers:{...(requestOrigin===null?{}:{origin:requestOrigin}),cookie:auth,'content-type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(payload)})}));
 const before=(await db.pool.query('SELECT user_id,password FROM account ORDER BY user_id')).rows;
 expect((await route(body,'')).status).toBe(401);
 for(const requestOrigin of [null,'https://foreign.example.invalid',origin+'.evil.invalid'])expect((await route(body,cookie,requestOrigin)).status).toBe(403);
 for(const payload of [{...body,userId:other.userId},{...body,employeeId:randomUUID()},{...body,confirmPassword:newPassword},{...body,revokeOtherSessions:false},{...body,newPassword:''},{...body,currentPassword:'x'.repeat(129)}])expect((await route(payload)).status).toBe(400);
 expect((await route('x'.repeat(2200))).status).toBe(400);
 const disabled=await createApplication(db.pool,{...readConfig({APP_ENV:'test',DATABASE_URL:db.url,APP_ORIGIN:origin,SESSION_SECRET:'synthetic-password-test-secret-at-least32',MAIL_TRANSPORT:'capture',STORAGE_ENV:'test'}),passwordChangeEnabled:false});
 expect((await route(body,cookie,origin,'POST',disabled)).status).toBe(503);
 await db.pool.query('UPDATE employee SET active=false WHERE user_id=$1',[user.userId]);expect((await route()).status).toBe(403);await db.pool.query('UPDATE employee SET active=true WHERE user_id=$1',[user.userId]);
 expect((await db.pool.query('SELECT user_id,password FROM account ORDER BY user_id')).rows).toEqual(before);
 const flags=await app.handle(new Request(origin+'/api/employee',{headers:{cookie}}));expect(await flags.json()).toMatchObject({passwordChangeEnabled:true});
 expect((await route()).status).toBe(200);
 const otherAfter=(await db.pool.query('SELECT password FROM account WHERE user_id=$1',[other.userId])).rows[0].password;expect(await verify(otherAfter,oldPassword)).toBe(true);
});

it('accepts a one-character password through application and provider while preserving sessions and hash security',async()=>{await clearLimits();const user=await account(),cookie=await login(user.email);const response=await app.handle(new Request(origin+'/api/auth/change-password',{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify({currentPassword:oldPassword,newPassword:'a',revokeOtherSessions:true})}));expect(response.status).toBe(200);const stored=(await db.pool.query('SELECT password FROM account WHERE user_id=$1',[user.userId])).rows[0].password;expect(stored).not.toBe('a');expect(await verify(stored,'a')).toBe(true);await clearLimits();expect((await request('sign-in/email',{email:user.email,password:'a'})).status).toBe(200);});
