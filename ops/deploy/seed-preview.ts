// Explicit one-off fixture seed. Never imported by routes; cannot run against prod identity.
import {readFileSync} from 'node:fs';import {randomBytes,randomUUID} from 'node:crypto';import {Pool} from 'pg';
import {readSyntheticPreviewConfigFiles} from '../../src/server/preview-config';import {createApplication} from '../../src/server/application';import {createEmployeeService} from '../../src/modules/employees/service';import {createLeaveService} from '../../src/modules/leave/service';import {createPayrollService} from '../../src/modules/payroll/service';import type {Actor,Result} from '../../src/core/contracts';
const config=readSyntheticPreviewConfigFiles(),pool=new Pool({connectionString:config.databaseUrl,max:2});
function value<T>(r:Result<T>):T{if(!r.ok)throw Error('PREVIEW_SEED_'+r.code);return r.value;}
try{
 if(Number((await pool.query('SELECT count(*) AS n FROM "user"')).rows[0].n)!==0)throw Error('PREVIEW_SEED_NONEMPTY_REFUSED');
 const password=readFileSync('/run/secrets/preview_admin','utf8').trim();if(!/^[a-f0-9]{96}$/.test(password))throw Error('PREVIEW_ADMIN_SECRET');
 const app=await createApplication(pool,config),u=await app.bootstrap({name:'Habitat preview administrator',email:'preview-admin@example.invalid',password}),e=(await pool.query('SELECT id FROM employee WHERE user_id=$1',[u.id])).rows[0];
 const actor:Actor={userId:u.id,employeeId:e.id,role:'admin'},context=()=>({actor,requestId:randomUUID()}),directory=createEmployeeService(pool,config.secret),leave=createLeaveService(pool),payroll=createPayrollService(pool);
 const staff=[{id:e.id}];for(const [name,email]of [['Sample colleague A','sample-a@example.invalid'],['Sample colleague B','sample-b@example.invalid']])staff.push(value(await directory.add(context(),{name,email,password:randomBytes(32).toString('hex'),syntheticOnly:true})));
 for(const person of staff)value(await leave.configureProfile(context(),{employeeId:person.id,continuing:true,eligibleSince:'2025-01-01',verifiedEvidence:'Fictional preview policy only',workingWeekdays:[1,2,3,4,5],restDay:0}));
 for(const [i,person]of staff.slice(1).entries())value(await payroll.configureProfile(context(),{employeeId:person.id,effectiveMonth:'2026-10',syntheticOnly:true,dob:'1990-01-13',citizenship:'citizen',monthlySalaryCents:i===0?350000:280000,openingAnnualOwSubjectCents:0,projectedAnnualOwSubjectCents:i===0?4200000:3360000,priorAnnualAwSubjectCents:0,funds:{status:'verified-none',evidenceId:'Fictional preview declaration; not real payroll evidence'}}));
 value(await payroll.createDraft(context(),'2026-10'));
 value(await leave.submitLeave(context(),{employeeId:staff[1].id,type:'annual',range:{start:'2026-11-03',end:'2026-11-03',startPart:'am',endPart:'am'},reason:'Fictional half-day leave request',attachmentIds:[]}));
 await pool.query("INSERT INTO claim(id,employee_id,description,expense_date,amount_cents,state) VALUES($1,$2,'Fictional withdrawn expense example','2026-10-12',1200,'withdrawn')",[randomUUID(),staff[2].id]);
 console.log('Preview seeded: fictional administrator and two colleagues, leave profiles, a draft payroll, sample leave and withdrawn claim. No real data, issuance, payments or email.');
}finally{await pool.end();}
