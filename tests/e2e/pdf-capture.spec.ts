import {test,expect} from '@playwright/test';
import {randomUUID,createHash} from 'node:crypto';
import {localApp} from '../helpers/local-app';
import {buildPayslipData} from '../../src/modules/payslips/data';
import {payslipFixture} from '../fixtures/payslip-data';
import {canonical} from '../../src/modules/payslips/template';
import {createPdfService} from '../../src/modules/payslips/pdf-service';
test('admin captures an existing synthetic artifact locally without rendering or sending',async({page})=>{
 const app=await localApp('test');try{const a=(await app.db.pool.query('SELECT id,user_id,role FROM employee')).rows[0],actor={employeeId:a.id,userId:a.user_id,role:a.role};
 const i=payslipFixture();i.employee.id=i.payroll.employeeId=i.payroll.funds.employeeId=i.opening.employeeId=a.id;const d=buildPayslipData(i);if(!d.ok)throw Error(d.message);
 const run=randomUUID(),entry=randomUUID(),id=randomUUID(),snapshot={reviewedData:d.value,employee:{id:a.id,name:'Fictional capture owner'},period:'2026-10',version:1,event:{kind:'payment',id:randomUUID()}};
 await app.db.pool.query("INSERT INTO payroll_run(id,month,state,capture,roster) VALUES($1,'2026-10','approved','{}','[]')",[run]);await app.db.pool.query("INSERT INTO payroll_entry(id,run_id,employee_id,snapshot) VALUES($1,$2,$3,'{}')",[entry,run,a.id]);await app.db.pool.query("INSERT INTO payslip_obligation(id,entry_id,employee_id,event_kind,event_id,version,snapshot,snapshot_hash,recipient) VALUES($1,$2,$3,'payment',$4,1,$5,$6,$7)",[id,entry,a.id,randomUUID(),snapshot,createHash('sha256').update(canonical(snapshot)).digest('hex'),app.email]);
 await app.db.pool.query('INSERT INTO delivery_preference VALUES($1,true)',[a.id]);const job=randomUUID();await app.db.pool.query('INSERT INTO delivery_outbox(id,obligation_id,message_id) VALUES($1,$2,$3)',[job,id,'<synthetic-'+job+'@hr.example.invalid>']);
 const pdf=createPdfService(app.db.pool,async()=>Buffer.from('%PDF-1.4\nsynthetic adapter fixture\n%%EOF'));expect((await pdf.render({actor,requestId:randomUUID()},id)).ok).toBe(true);
 await page.goto(app.origin+'/login');await page.getByLabel('Email').fill(app.email);await page.getByLabel('Password').fill(app.password);await page.getByRole('button',{name:'Sign in'}).click();await expect(page.getByRole('heading',{name:'Your HR'})).toBeVisible();await page.goto(app.origin+'/admin/payslips');await expect(page.getByRole('button',{name:'Capture PDF locally - no email'})).toHaveCount(0);const capture=await page.request.post(app.origin+'/api/payslips/pdf/capture',{headers:{'Idempotency-Key':randomUUID(),origin:app.origin},data:{id}});expect((await capture.json()).ok).toBe(true);await page.reload();await expect(page.getByText('PDF captured locally only; no recipient transmission.')).toBeVisible();await expect(page.getByText('Actual issued: no. Actual delivered: no.')).toBeVisible();expect((await app.db.pool.query('SELECT * FROM pdf_mail_capture')).rowCount).toBe(1);
 }finally{await app.stop();}
});
