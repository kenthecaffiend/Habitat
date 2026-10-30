// Temporary loopback-only synthetic demo. No production services, real data or mail.
import {localApp} from '../../tests/helpers/local-app';
import {hashPassword} from '../../src/server/auth';
import {createLeaveService} from '../../src/modules/leave/service';
import {createPayrollService} from '../../src/modules/payroll/service';
import {appendAudit,withTransaction} from '../../src/server/db';
import {twoEmployeeFixture} from '../../tests/fixtures/payslip-data';
import {randomUUID} from 'node:crypto';import {mkdtemp,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {deflateSync} from 'node:zlib';
const app=await localApp('dev',true);let stopped=false;
async function stop(){if(stopped)return;stopped=true;await app.stop();process.exit(0);}
process.on('SIGINT',()=>void stop());process.on('SIGTERM',()=>void stop());
try{
 const root=await mkdtemp(join(tmpdir(),'hr-local-demo-')),admin=(await app.db.pool.query("SELECT id,user_id,role FROM employee WHERE role='admin'")).rows[0],actor={employeeId:admin.id,userId:admin.user_id,role:'admin' as const},context=()=>({actor,requestId:randomUUID()});
 await app.db.pool.query('UPDATE "user" SET name=$2 WHERE id=$1',[admin.user_id,'Demo Administrator']);
 const user=randomUUID(),employee=randomUUID(),staffEmail='staff@example.invalid',staffPassword='synthetic-demo-password';
 await app.db.pool.query('INSERT INTO "user"(id,name,email,email_verified) VALUES($1,$2,$3,true)',[user,'Demo Employee',staffEmail]);await app.db.pool.query("INSERT INTO account(id,account_id,provider_id,user_id,password) VALUES($1,$2,'credential',$2,$3)",[randomUUID(),user,await hashPassword(staffPassword)]);await app.db.pool.query("INSERT INTO employee(id,user_id,role) VALUES($1,$2,'employee')",[employee,user]);
 const fixtures=twoEmployeeFixture(),leave=createLeaveService(app.db.pool),payroll=createPayrollService(app.db.pool);
 for(const [n,id] of [admin.id,employee].entries()){const f=fixtures[n];f.employee.id=f.payroll.employeeId=f.payroll.funds.employeeId=f.opening.employeeId=id;f.employee.fullName=n?'Demo Employee':'Demo Administrator';const p=await leave.configureProfile(context(),{employeeId:id,continuing:true,eligibleSince:'2025-01-01',verifiedEvidence:'Invented demo continuing policy',workingWeekdays:[1,2,3,4,5],restDay:0});if(!p.ok)throw Error(p.message);const r=await payroll.configureProfile(context(),{employeeId:id,employerId:f.employer.id,effectiveMonth:'2026-10',syntheticOnly:true,dob:f.payroll.dob,citizenship:'citizen',monthlySalaryCents:f.payroll.monthlySalaryCents,openingAnnualOwSubjectCents:f.payroll.openingAnnualOwSubjectCents,projectedAnnualOwSubjectCents:f.payroll.projectedAnnualOwSubjectCents,priorAnnualAwSubjectCents:0,funds:f.payroll.funds,reviewed:{employer:f.employer,employee:f.employee,applicability:f.applicability,opening:f.opening}});if(!r.ok)throw Error(r.message);}
 await withTransaction(app.db.pool,async tx=>{await tx.query("INSERT INTO leave_grant VALUES($1,2025,4,'active')",[employee]);await appendAudit(tx,{context:context(),action:'demo.invented-opening-carryover',entityId:employee});});
 // Encode a tiny invented RGB PNG; never decode user bytes on the host.
 const crc=(b:Buffer)=>{let c=0xffffffff;for(const x of b){c^=x;for(let n=0;n<8;n++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
 const chunk=(name:string,data:Buffer)=>{const type=Buffer.from(name),size=Buffer.alloc(4),sum=Buffer.alloc(4);size.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([type,data])));return Buffer.concat([size,type,data,sum]);};
 const header=Buffer.alloc(13);header.writeUInt32BE(20,0);header.writeUInt32BE(20,4);header[8]=8;header[9]=2;const pixels=Buffer.alloc(20*61,255);for(let n=0;n<20;n++)pixels[n*61]=0;
 const receipt=join(root,'invented-receipt.png');await writeFile(receipt,Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]),{flag:'wx',mode:0o600});
 const state={syntheticOnly:true,origin:app.origin,ownerPid:process.pid,admin:{email:app.email,password:app.password},employee:{email:staffEmail,password:staffPassword},receipt,root,employeeId:employee,adminId:admin.id,createdAt:new Date().toISOString()};
 const statePath=join(root,'session.json');await writeFile(statePath,JSON.stringify(state,null,2),{flag:'wx',mode:0o600});console.log(JSON.stringify({status:'LOCAL_SYNTHETIC_DEMO_STARTED',origin:app.origin,statePath,ownerPid:process.pid}));
 await new Promise(()=>{});
}catch(error){console.error(error);await app.stop();process.exitCode=1;}
