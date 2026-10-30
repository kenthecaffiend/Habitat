import {overviewCalendar} from '../modules/leave/overview-reader';
import {actualLoginAllowed} from './auth/actual-access';
import {createPublicBrandingHttp} from './public-branding';
import {actualDraftAction} from '../../ops/deploy/actual-policy.mjs';
import {workflowRoutes} from './workflows';
import {createProductionRenderer} from './production-renderer';
import type {Pool} from 'pg';import {randomUUID} from 'node:crypto';import {z} from 'zod';import type {Config} from './config';import {prepareDatabase,withTransaction,appendAudit} from './db';import {createAuth,hashPassword} from './auth';import type {Actor} from '../core/contracts';
const signup=z.object({name:z.string().min(1).max(120),email:z.email(),password:z.string().min(1).max(128)});
class HttpError extends Error{constructor(public status:number){super('Access denied');}}
export function requireAdmin(actor:Actor){if(actor.role!=='admin')throw new HttpError(403);}
export async function createApplication(pool:Pool,config:Config){
 await prepareDatabase(pool,config);const actualDraftOnly=config.environment==='actual-test',actualBookkeeping='actualBookkeeping' in config&&config.actualBookkeeping===true,passwordChangeEnabled='passwordChangeEnabled' in config&&config.passwordChangeEnabled===true;const auth=createAuth(pool,config);const workflows=workflowRoutes(pool,config),publicBranding=createPublicBrandingHttp(pool);await workflows.reopenReceipts();
 async function requireActor(request:Request):Promise<Actor>{
  if(config.environment==='prod')throw new HttpError(503);
  const session=await auth.api.getSession({headers:request.headers});if(!session)throw new HttpError(401);if(config.environment==='actual-test'&&!await actualLoginAllowed(pool,config,session.user.id,session.user.email))throw new HttpError(403);
  const {rows:[e]}=await pool.query('SELECT id,role FROM employee WHERE user_id=$1 AND active=true',[session.user.id]);
  if(!e)throw new HttpError(403);return {userId:session.user.id,employeeId:e.id,role:e.role};
 }
 async function bootstrap(input:unknown){
  if(config.environment==='prod')throw Error('PRODUCTION_LOCKED');
  const data=signup.parse(input);if(config.environment==='actual-test'?data.email!==config.ownerLogin:!data.email.endsWith('@example.invalid'))throw new Error('Synthetic accounts only in this checkpoint');
  const password=await hashPassword(data.password);return withTransaction(pool,async tx=>{
   await tx.query('SELECT pg_advisory_xact_lock(7219302)');
   if((await tx.query('SELECT 1 FROM bootstrap_state')).rowCount)throw new Error('Bootstrap already completed');
   const id=randomUUID(),employeeId=randomUUID();
   await tx.query('INSERT INTO "user"(id,name,email,email_verified) VALUES($1,$2,$3,true)',[id,data.name,data.email]);
   await tx.query("INSERT INTO account(id,account_id,provider_id,user_id,password) VALUES($1,$2,'credential',$2,$3)",[randomUUID(),id,password]);
   await tx.query("INSERT INTO employee(id,user_id,role) VALUES($1,$2,'admin')",[employeeId,id]);
   await tx.query('INSERT INTO bootstrap_state(id) VALUES(1)');
   await appendAudit(tx,{context:{actor:{userId:id,employeeId,role:'admin'},requestId:randomUUID()},action:'bootstrap',entityId:employeeId});
   return {id,email:data.email};
  });
 }
 async function handle(request:Request):Promise<Response>{
  if(actualDraftOnly){try{await prepareDatabase(pool,config);}catch{return Response.json({ok:false,code:'ACTUAL_DRAFT_IDENTITY',message:'Test data identity unavailable'},{status:503});}}
  if(actualDraftOnly&&request.method==='GET'&&new URL(request.url).pathname==='/api/internal/actual-test-contract'){await prepareDatabase(pool,config);return Response.json({environment:'actual-test',schemaVerified:true,issuance:actualBookkeeping,mail:false,approval:actualBookkeeping,paymentRecording:actualBookkeeping,transfers:false});}
  if('syntheticPreview' in config&&config.syntheticPreview&&request.method==='GET'&&new URL(request.url).pathname==='/api/internal/preview-contract'){await prepareDatabase(pool,config);return Response.json({deployment:'uat',syntheticOnly:true,schemaVerified:true,mail:false,issuance:false},{headers:{'Cache-Control':'no-store'}});}
  if(config.environment==='prod'){
   if(request.method==='GET'&&new URL(request.url).pathname==='/api/internal/production-contract'){await prepareDatabase(pool,config);const rendererReady=await createProductionRenderer(config.rendererToken).healthy();return Response.json({environment:'prod',schemaVerified:true,rendererReady,operations:false,bootstrap:false,issuance:false,mail:false},{status:rendererReady?200:503,headers:{'Cache-Control':'no-store'}});}
   return Response.json({error:'PRODUCTION_LOCKED'},{status:503,headers:{'Cache-Control':'no-store'}});
  }
  try{
   const path=new URL(request.url).pathname;
   if(path==='/api/runtime'&&request.method==='GET')return Response.json({actualDraftOnly,actualBookkeeping,passwordChangeEnabled,actualWorkflows:'actualWorkflows' in config&&config.actualWorkflows===true},{headers:{'Cache-Control':'no-store'}});
   if(actualDraftOnly&&!actualDraftAction(request.method,path,'actualWorkflows' in config&&config.actualWorkflows===true,actualBookkeeping,passwordChangeEnabled))return Response.json({ok:false,code:actualBookkeeping?'WORKFLOW_UNAVAILABLE':'ACTUAL_DRAFT_ONLY',message:actualBookkeeping?'This action is not available in this workspace.':'Only owner-managed employee records and draft payroll comparisons are enabled. Approvals, payments, issuance, imports and uploads are disabled.'},{status:503});
   if(!['GET','HEAD'].includes(request.method)&&request.headers.get('origin')!==config.origin)return Response.json({error:'Forbidden origin'},{status:403});
   if(path==='/api/branding/public-logo'||path==='/api/branding/favicon')return await publicBranding(request);
   if(path.startsWith('/api/auth/')){
    if(path==='/api/auth/change-password'){
     if(!passwordChangeEnabled)return Response.json({code:'PASSWORD_CHANGE_UNAVAILABLE',message:'Password changes are not enabled in this workspace.'},{status:503});
     if(request.method!=='POST')return new Response(null,{status:405});
     await requireActor(request);let body:unknown;try{const text=await request.clone().text();if(Buffer.byteLength(text)>2048)throw Error();body=JSON.parse(text);}catch{return Response.json({message:'Enter your current password and a non-empty new password of up to 128 characters.'},{status:400});}
     if(!z.object({currentPassword:z.string().min(1).max(128),newPassword:z.string().min(1).max(128),revokeOtherSessions:z.literal(true)}).strict().safeParse(body).success)return Response.json({message:'Enter your current password and a non-empty new password of up to 128 characters.'},{status:400});
     return await auth.handler(request);
    }
    if(!['/api/auth/sign-in/email','/api/auth/sign-out','/api/auth/get-session'].includes(path))return Response.json({error:'Endpoint disabled'},{status:403});
    return await auth.handler(request);
   }
   const actor=await requireActor(request);
   if(path==='/api/employee'&&request.method==='GET')return Response.json({...actor,actualDraftOnly,actualBookkeeping,passwordChangeEnabled,actualWorkflows:'actualWorkflows' in config&&config.actualWorkflows===true},{headers:{'Cache-Control':'no-store'}});
   const workflow=await workflows(request,actor);if(workflow)return workflow;
   if(path.startsWith('/api/admin/')){requireAdmin(actor);if(path==='/api/admin/overview'&&request.method==='GET')return Response.json({calendar:await overviewCalendar(pool)},{headers:{'Cache-Control':'private, no-store'}});return Response.json({environment:config.environment,checkpoint:'foundation-only'});}
   if(path.startsWith('/api/documents/')&&request.method==='GET'){
    const id=path.split('/').at(-1);if(!z.uuid().safeParse(id).success)return new Response(null,{status:404});
    const {rows:[doc]}=await pool.query('SELECT id,title,kind FROM document WHERE id=$1 AND ($2 OR employee_id=$3)',[id,actor.role==='admin',actor.employeeId]);
    return doc?Response.json(doc,{headers:{'Cache-Control':'no-store'}}):new Response(null,{status:404});
   }
   return new Response(null,{status:404});
  }catch(e){if(e instanceof HttpError)return Response.json({error:'Access denied'},{status:e.status});if(actualDraftOnly)return Response.json({ok:false,code:'TEST_TEMPORARILY_UNAVAILABLE',message:'Result uncertain. Retry the unchanged action with the same request key or review existing records.'},{status:503});throw e;}
 }
 return {handle,bootstrap,requireActor,auth,actualDraftOnly,actualBookkeeping,passwordChangeEnabled,actualWorkflows:'actualWorkflows' in config&&config.actualWorkflows===true};
}
