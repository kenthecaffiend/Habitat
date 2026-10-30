import {FONT} from '../../src/modules/payslips/pdf-service';import {createHash} from 'node:crypto';import {canonical} from '../../src/modules/payslips/template';import {mkdir,writeFile} from 'node:fs/promises';import {strict as assert} from 'node:assert';import {buildPayslipData} from '../../src/modules/payslips/data';import {payslipFixture} from '../../tests/fixtures/payslip-data';import {pdfLayout} from '../../src/modules/payslips/template';import {pdfContainer,renderPdf,IMAGE} from './runner';import {PreviewRejected} from '../documents/outcomes';
const root='test-results/payslip-pdf';await mkdir(root,{recursive:true});
const probe=pdfContainer(['-I','-c',`import os,socket,json
s=open('/proc/self/status').read()
assert os.getuid()==65532 and 'NoNewPrivs:\\t1' in s and 'Seccomp:\\t2' in s
assert 'CapEff:\\t0000000000000000' in s
try:open('/forbidden','w');raise AssertionError('writable root')
except OSError:pass
assert not os.path.exists('/var/run/docker.sock')
x=socket.socket();x.settimeout(.2)
try:x.connect(('192.0.2.1',80));raise AssertionError('network')
except OSError:pass
print('controls verified')`]);assert.match(probe.toString(),/controls verified/);
for(const [name,change] of Object.entries({zeroAllowances:()=>{},allowances:()=>{},normal:(x:any)=>{x.reimbursements=[];x.payroll.reimbursementCents=0;x.payments[0].reimbursementCents=0;},claims:()=>{},bonus:(x:any)=>{x.payroll.bonusCents=100000;x.payments[0].wageCents=399800;},deductions:(x:any)=>{x.payroll.monthlySalaryCents=440000;x.payroll.unpaidHalfUnits=2;x.payments[0].wageCents=100000;},long:(x:any)=>{x.employee.fullName=('Synthetic Élodie <A&B> '+ 'LongName '.repeat(15));x.payments=Array.from({length:35},(_,i)=>({...x.payments[0],id:'payment-'+i,wageCents:100,reimbursementCents:0}));},correction:(x:any)=>{const old=buildPayslipData(x);if(!old.ok)throw Error(old.message);x.payroll.monthlySalaryCents=410000;x.payments.push({id:'top-up',date:'2026-11-03',wageCents:8000,reimbursementCents:0,evidenceId:'synthetic-top-up'});x.correction={id:'synthetic-correction',basis:{kind:'already-due-omission',coveredWageMonth:'2026-10',duePayableDate:'2026-10-31',evidenceId:'synthetic'},originalSnapshotHash:old.value.snapshotHash,originalSnapshot:old.value,originalPayroll:structuredClone(old.value.evidence.payrollInput),wageMonth:'2026-10',contributionMonth:'2026-10',reason:'Synthetic correction',evidenceId:'synthetic'};}})){
 const i=payslipFixture();change(i);const data=buildPayslipData(i);if(!data.ok)throw Error(name+': '+data.message);const reviewed:any=data.value;if(name==='zeroAllowances'||name==='allowances'){reviewed.payslip.allowances=[{code:'Zero transport',amountCents:0},...(name==='allowances'?[{code:'Meal allowance',amountCents:12500},{code:'Shift allowance',amountCents:5000}]:[])];delete reviewed.snapshotHash;reviewed.snapshotHash=createHash('sha256').update(canonical(reviewed)).digest('hex');}const layout=pdfLayout(reviewed,'synthetic-'+name,1),bytes=renderPdf(layout);assert.deepEqual(renderPdf(layout),bytes);await writeFile(root+'/'+name+'.pdf',bytes);
 const verified=JSON.parse(pdfContainer(['-I','-c',`import sys,io,json,base64
from pypdf import PdfReader
import pypdfium2 as p
b=sys.stdin.buffer.read();r=PdfReader(io.BytesIO(b));assert not r.trailer['/Root'].get('/OpenAction');assert not r.trailer['/Root'].get('/AcroForm');assert not r.trailer['/Root'].get('/Names');assert all(not x.get('/Annots') for x in r.pages)
d=p.PdfDocument(b);pages=[]
for page in d:
 out=io.BytesIO();page.render(scale=1.25).to_pil().save(out,format='PNG');pages.append(base64.b64encode(out.getvalue()).decode())
print(json.dumps({'text':'\\n'.join(x.extract_text() for x in r.pages),'pages':pages,'audit':str(r.metadata.subject)}))`],bytes).toString());assert.ok(verified.audit.includes(FONT),'renderer/font bundle mismatch');if(name==='zeroAllowances'||name==='allowances'){assert.ok(!verified.text.includes('Zero transport'));assert.ok(!verified.text.includes('Overtime'));if(name==='allowances'){assert.ok(verified.text.includes('Meal allowance'));assert.ok(verified.text.includes('Shift allowance'));}}for(const section of layout.sections)for(const row of section.rows){assert.ok(verified.text.replace(/\s+/g,' ').includes(row.label.replace(/\s+/g,' ')),name+' missing '+row.label);assert.ok(verified.text.replace(/\s+/g,'').includes(row.value.replace(/\s+/g,'')),name+' missing '+row.value);}for(let n=0;n<verified.pages.length;n++)await writeFile(root+'/'+name+'-'+(n+1)+'.png',Buffer.from(verified.pages[n],'base64'));console.log('PASS',name,verified.pages.length,'pages, fields, deterministic bytes, no actions/links');
}
const unsupported=pdfLayout((buildPayslipData(payslipFixture()) as any).value,'glyph',1);unsupported.sections[0].rows[0].value='漢';assert.throws(()=>renderPdf(unsupported),(e:any)=>e instanceof PreviewRejected&&e.kind==='decoder');
for(const b of [Buffer.from('{'),Buffer.alloc(131073,32)])assert.throws(()=>pdfContainer(null,b),(e:any)=>e instanceof PreviewRejected&&e.kind==='decoder');
assert.throws(()=>pdfContainer(['-I','-c','import time;time.sleep(5)'],Buffer.alloc(0),100),(e:any)=>e instanceof PreviewRejected&&e.kind==='timeout');console.log('PASS malformed/oversize/timeout, confirmed cleanup; image',IMAGE);
