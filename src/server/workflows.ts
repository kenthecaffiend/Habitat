import {renderPayrollDocuments,recordAndGenerate} from '../modules/payroll/batch-documents';
import {createBookkeeping} from '../modules/payroll/bookkeeping';
import {createPayslipHistory} from '../modules/payslips/history';
import {createLeaveOpeningService} from '../modules/leave/opening';
import {createMonthlyPayroll} from '../modules/payroll/monthly';
import {createEmployeeProfileService} from '../modules/employees/profile';
import {createMedicalHttp} from './medical-http';
import {createEmployeeSourceService} from '../modules/employees/source';
import {createBrandingHttp} from './branding-http';
import {createPdfCaptureService} from '../modules/payslips/pdf-capture';
import {createProductionRenderer} from './production-renderer';
import {createEmployeeService} from '../modules/employees/service';
import {createPdfService} from '../modules/payslips/pdf-service';import {isolatedPdfConverter} from './pdf-converter';
import {createReceiptHttp} from './receipt-http';import type {Config} from './config';
import {createImportService} from '../modules/imports/service';
import {createPayslipService} from '../modules/payslips/service';
import {createPayrollService} from '../modules/payroll/service';
import {createLeaveReviewService} from '../modules/leave/review';
import type {Pool} from 'pg';import {z} from 'zod';import type {Actor,Result} from '../core/contracts';import {createLeaveService} from '../modules/leave/service';import {createClaimsService} from '../modules/claims/service';
export function workflowRoutes(pool:Pool,config:Config){
 const bookkeepingEnabled='actualBookkeeping' in config&&config.actualBookkeeping===true;const bookkeeping=createBookkeeping(pool,bookkeepingEnabled);
 const pdfs=createPdfService(pool,config.environment==='prod'?createProductionRenderer(config.rendererToken).render:bookkeepingEnabled?createProductionRenderer(('rendererToken' in config?config.rendererToken:undefined)!,undefined,true).render:isolatedPdfConverter,{bookkeeping:bookkeepingEnabled,storageLimitBytes:'pdfStorageLimitBytes' in config?config.pdfStorageLimitBytes:undefined});const pdfCapture=createPdfCaptureService(pool);
 const medical=createMedicalHttp(pool,config);const receipts=createReceiptHttp(pool,config);const branding=createBrandingHttp(pool);
 const opening=createLeaveOpeningService(pool,undefined,{actualWorkflows:'actualWorkflows' in config&&config.actualWorkflows===true});
 const monthly=createMonthlyPayroll(pool,config.environment==='actual-test');
 const profile=createEmployeeProfileService(pool,config.secret);const source=createEmployeeSourceService(pool,config.secret);
 const employees=createEmployeeService(pool,config.secret,undefined,{actualDraftOnly:config.environment==='actual-test'});
 const imports=createImportService(pool),payslips=createPayslipService(pool),payroll=createPayrollService(pool,undefined,{actualDraftOnly:config.environment==='actual-test'}),leave=createLeaveService(pool),claims=createClaimsService(pool),review=createLeaveReviewService(pool);
 const history=createPayslipHistory(pool,bookkeepingEnabled?bookkeeping.documents:payslips.list,config.environment!=='actual-test'||bookkeepingEnabled);
 const response=(result:Result<unknown>,status?:number)=>Response.json(result,{status:status??(result.ok?200:result.code==='FORBIDDEN'?403:400),headers:{'Cache-Control':'no-store'}});
 async function json(request:Request){const reader=request.body?.getReader();if(!reader)throw new Error('Missing body');let size=0;const chunks:Uint8Array[]=[];try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536)throw new Error('Body too large');chunks.push(value);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}finally{await reader.cancel();}}
 const handle=async(request:Request,actor:Actor):Promise<Response|undefined>=>{
  const url=new URL(request.url),path=url.pathname;
  if(!/^\/api\/(branding|employees|leave|claims|files|payroll|payslips|imports)(\/|$)/.test(path))return;
  if(path==='/api/employees/source'&&config.environment!=='actual-test')return new Response(null,{status:404});
  if(path.startsWith('/api/branding'))return branding(request,actor);
  if(path.startsWith('/api/leave/files'))return medical(request,actor);
  if(path.startsWith('/api/files'))return receipts(request,actor);
  if(request.method==='GET'){
   if(path==='/api/employees/me')return response(await profile.readOwn(actor,url.searchParams.get('employeeId')??actor.employeeId));
   if(path==='/api/employees/profile')return response(await profile.read(actor,url.searchParams.get('employeeId'),url.searchParams.get('asOf')??undefined));
   if(path==='/api/employees')return response(await employees.list(actor,url.searchParams.get('filter')??'active'));
   if(path==='/api/employees/source')return response(await source.read(actor,url.searchParams.get('employeeId')));
   if(path==='/api/employees/history')return response(await employees.history(actor,url.searchParams.get('id')??''));
   if(path==='/api/imports')return response(await imports.list(actor));
   if(path==='/api/imports/history')return response(await imports.history(actor,url.searchParams.get('employeeId')??'',Number(url.searchParams.get('year'))));
   if(path==='/api/imports/export'){const result=await imports.exportAnnual(actor,Number(url.searchParams.get('year')));return result.ok?new Response(result.value,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename=synthetic-historical-accounting.csv','Cache-Control':'no-store'}}):response(result);}
   if(path==='/api/payslips/history')return response(await history.read(actor,url.searchParams.get('employeeId')??actor.employeeId));
   if(path==='/api/payslips')return response(await (bookkeepingEnabled?bookkeeping.documents:payslips.list)(actor));
   if(path==='/api/payslips/pdf'){const r=await pdfs.read(actor,url.searchParams.get('id')??'',url.searchParams.get('view')==='employee');return r.ok?new Response(new Uint8Array(r.value.bytes),{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="'+r.value.filename+'"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}}):response(r);}
   if(path==='/api/payslips/document')return response(await payslips.document(actor,url.searchParams.get('id')??''));
   if(path==='/api/leave/opening')return response(await opening.read(actor,url.searchParams.get('employeeId')??actor.employeeId));
   if(path==='/api/payroll/readiness')return response(await monthly.readiness(actor,url.searchParams.get('month')??''));
   if(path==='/api/payroll/settings')return response(await monthly.settings(actor));if(path==='/api/payroll/locks')return response(await monthly.locks(actor));
   if(path==='/api/payroll/profiles')return response(await payroll.profiles(actor));
   if(path==='/api/payroll')return response(await payroll.list(actor));
   if(path==='/api/leave/employees'){if(actor.role!=='admin')return response({ok:false,code:'FORBIDDEN',message:'Administrator required'});return response({ok:true,value:(await pool.query('SELECT e.id,coalesce(nullif((SELECT p.personal->>\'Display name\' FROM employee_profile_revision p WHERE p.employee_id=e.id ORDER BY p.created_at DESC,p.id DESC LIMIT 1),\'\'),u.name) AS name,u.name AS "legalName",u.email FROM employee e JOIN "user" u ON u.id=e.user_id WHERE e.active=true ORDER BY u.name,e.id')).rows});}
   const id=url.searchParams.get('employeeId')??actor.employeeId;
   if(path==='/api/leave/profile')return response(await review.readProfile(actor,id));
   if(path==='/api/leave/holds')return response(await review.listHolds(actor,id));
   if(path==='/api/leave')return response(await leave.list(actor,id));
   if(path==='/api/claims')return response(await claims.list(actor,id));
   return new Response(null,{status:404});
  }
  if(request.method!=='POST')return new Response(null,{status:405});
  const requestId=request.headers.get('idempotency-key');if(!z.uuid().safeParse(requestId).success)return response({ok:false,code:'REQUEST_KEY_REQUIRED',message:'A valid retry key is required'});
  let body:any;try{body=await json(request);if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('Invalid body');}catch{return response({ok:false,code:'INPUT',message:'Invalid or oversized JSON body'});}
  const context={actor,requestId:requestId!};
  switch(path){
   case '/api/employees/me/address':return response(await profile.saveAddress(context,body));
   case '/api/employees/source':return response(await source.capture(context,body));
   case '/api/employees/profile':return response(await profile.save(context,body));
   case '/api/employees/balance':return response(await profile.adjust(context,body));
   case '/api/employees/add':return response(await employees.add(context,body));
   case '/api/employees/edit':return response(await employees.edit(context,body.id,body.input));
   case '/api/employees/archive':return response(await employees.archive(context,body.id,body.input));
   case '/api/imports/stage':return response(await imports.stage(context,body.bundle));
   case '/api/imports/reconcile':return response(await imports.reconcile(context,body.id));
   case '/api/imports/accept':return response(await imports.accept(context,body.id,body.input));
   case '/api/imports/commit':return response(await imports.commit(context,body.id,body.checksum));
   case '/api/imports/source-evidence':return response(await imports.sourceEvidence(context,body));
   case '/api/payslips/pdf/capture':return response({ok:true,value:await pdfCapture.process(context,new Date().toISOString(),body.id)});
   case '/api/payslips/pdf/render':return response(await pdfs.render(context,body.id));
   case '/api/payslips/preference':return response(await payslips.configure(context,body.employeeId,body.enabled));
   case '/api/payslips/simulate':{
    if(actor.role!=='admin')return response({ok:false,code:'FORBIDDEN',message:'Administrator required'});
    const mode=z.object({renderer:z.enum(['success','failure']),provider:z.enum(['accepted','definite_failure','unknown'])}).strict().safeParse(body);if(!mode.success)return response({ok:false,code:'INPUT',message:'Synthetic modes only'});
    await payslips.process(new Date().toISOString(),mode.data.renderer,mode.data.provider);return response({ok:true,value:'Simulation step only; actual issuance remains outstanding'});
   }
   case '/api/payroll/settings':return response(await monthly.save(context,body));
   case '/api/payroll/monthly':return response(await monthly.create(context,body));
   case '/api/payroll/profile':return response(await payroll.configureProfile(context,body));
   case '/api/payroll/draft':return response(await payroll.createDraft(context,body.month));
   case '/api/payroll/revise':return response(await payroll.reviseDraft(context,body.id,body.changes,body.revision));
   case '/api/payroll/approve':return response(await payroll.approvePayroll(context,body.id,body.revision,body.review));
   case '/api/payroll/void':return response(await payroll.voidDraft(context,body.id,body.revision));
   case '/api/payroll/discard':return response(await bookkeeping.discard(context,body));
   case '/api/payroll/finalise':return response(await bookkeeping.finalise(context,body));
   case '/api/payroll/payment-date/batch':return response(await recordAndGenerate(context,body,bookkeeping.recordRun,bookkeeping.documentTargets,pdfs.render));
   case '/api/payslips/void':return response(await bookkeeping.voidDocument(context,body));
   case '/api/payslips/replacement':{const replacement=await bookkeeping.replaceDocument(context,body);if(!replacement.ok)return response(replacement);const pdf=await pdfs.render(context,replacement.value.id,{retryFailed:true});return response({ok:true,value:{...replacement.value,pdfReady:pdf.ok,...(!pdf.ok?{code:pdf.code,message:pdf.message}:{})}});}
   case '/api/payroll/payslips':return response(await renderPayrollDocuments(context,body,bookkeeping.documentTargets,pdfs.render));
   case '/api/payroll/payment-date':return response(bookkeepingEnabled?{ok:false,code:'RUN_PAYMENT_REQUIRED',message:'Record payment for the saved payroll run.'}:await payroll.setPaymentDate(context,body.id,body.input));
   case '/api/payroll/salary-payment':return response(await payroll.recordSalaryPayment(context,body.id,body.payment));
   case '/api/payroll/cpf-payment':return response(await payroll.recordCpfPayment(context,body.month,body.payment));
   case '/api/payroll/payment-exception':return response(await payroll.recordPaymentException(context,body.id,body.input));
   case '/api/payroll/resolve-correction':return response(await payroll.resolveCorrection(context,body.id,body.input));
   case '/api/payroll/correction':return response(await payroll.amendPaidEntry(context,body.id,body.changes));
   case '/api/leave/opening':return response(await opening.accept(context,body));
   case '/api/leave/reconcile-month':return response(await opening.reconcileMonth(context,body));
   case '/api/leave/review':return response(await review.reviewHold(context,body));
   case '/api/leave/profile':return response(await leave.configureProfile(context,body));
   case '/api/leave/preview':return response(await leave.previewLeave(actor,body));
   case '/api/leave/submit':return response(await leave.submitLeave(context,body));
   case '/api/leave/decision':return response(await leave.decideLeave(context,body.id,body.decision,body.revision));
   case '/api/leave/amend':return response(await leave.amendLeave(context,body.id,body.input,body.revision));
   case '/api/leave/exception':return response(await leave.recordExceptionalLeave(context,body));
   case '/api/claims/submit':return response(await claims.submitClaim(context,body));
   case '/api/claims/decision':return response(await claims.decideClaim(context,body.id,body.decision,body.revision));
   case '/api/claims/edit':return response(await claims.editClaim(context,body.id,body.input));
   case '/api/claims/withdraw':return response(await claims.withdrawClaim(context,body.id,body.revision));
   default:return new Response(null,{status:404});
  }
 };
 return Object.assign(handle,{reopenReceipts:receipts.reopenOnStartup});
}
