import {createSyntheticSource,backupSynthetic,restoreSynthetic} from '../recovery/rehearsal';
import {spawnSync} from 'node:child_process';
import {expectRejectedAsync} from './outcomes';
import assert from 'node:assert/strict';import {randomUUID,randomBytes} from 'node:crypto';import {rm,readFile} from 'node:fs/promises';
import {prepareDatabase} from '../../src/server/db';import {readConfig} from '../../src/server/config';import {createSyntheticReceiptStore} from '../../src/modules/files/synthetic-store';import {createClaimsService} from '../../src/modules/claims/service';import {isolated,previewSyntheticImage} from './runner';
const db=await createSyntheticSource();let store:Awaited<ReturnType<typeof createSyntheticReceiptStore>>|undefined;
try{
 await prepareDatabase(db.pool,readConfig({APP_ENV:'test',DATABASE_URL:db.url,APP_ORIGIN:'http://127.0.0.1:3130',SESSION_SECRET:'synthetic-private-receipt-test-only-secret',MAIL_TRANSPORT:'capture',STORAGE_ENV:'test'}));
 const actor={employeeId:randomUUID(),userId:randomUUID(),role:'employee' as const},context={actor,requestId:randomUUID()};
 await db.pool.query('INSERT INTO "user"(id,name,email) VALUES($1,$2,$3)',[actor.userId,'Synthetic receipt owner',actor.userId+'@example.invalid']);await db.pool.query("INSERT INTO employee(id,user_id,role) VALUES($1,$2,'employee')",[actor.employeeId,actor.userId]);
 const admin={employeeId:randomUUID(),userId:randomUUID(),role:'admin' as const};await db.pool.query('INSERT INTO "user"(id,name,email) VALUES($1,$2,$3)',[admin.userId,'Synthetic restart admin',admin.userId+'@example.invalid']);await db.pool.query("INSERT INTO employee(id,user_id,role) VALUES($1,$2,'admin')",[admin.employeeId,admin.userId]);const receipts:any[]=[];
 store=await createSyntheticReceiptStore(db.pool,async(bytes,mime)=>previewSyntheticImage(bytes,mime as 'image/png'|'image/jpeg',true));
 for(const format of ['PNG','JPEG'] as const){const mime=format==='PNG'?'image/png':'image/jpeg';const context={actor,requestId:randomUUID()};
 const original=isolated(['-I','-c',`from PIL import Image,ImageDraw;import sys;im=Image.new('RGB',(600,300),'white');ImageDraw.Draw(im).text((20,20),'SYNTHETIC RECEIPT - SGD 12.00',fill='black');im.save(sys.stdout.buffer,format='${format}')`]);
 const id=await store.store(context,original,mime,true);assert.equal(await store.store(context,original,mime,true),id);
 assert.deepEqual((await store.read(actor,id,'original')).bytes,original);assert.equal((await store.read(actor,id,'preview')).headers['Content-Type'],'image/png');
 receipts.push({id,context,mime});
 const claim=await createClaimsService(db.pool).submitClaim({actor,requestId:randomUUID()},{employeeId:actor.employeeId,description:'Synthetic receipt pipeline',expenseDate:'2026-10-01',amountCents:1200,attachmentIds:[id],revision:1});assert.equal(claim.ok,true);
 console.log('PASS '+format+' actual isolated decoder → private original/preview → authorized read → claim linkage; retry single attachment');
 }
 const child=spawnSync('node_modules/node/bin/node',['node_modules/tsx/dist/cli.mjs','ops/documents/receipt-reopen-probe.ts'],{input:JSON.stringify({purpose:'synthetic-restart-probe',url:db.url,storeId:store.storeId,root:store.root,owner:actor,adminContext:{actor:admin,requestId:randomUUID()},receipts}),encoding:'utf8',timeout:15000,maxBuffer:65536});if(child.error)throw child.error;assert.equal(child.status,0,child.stderr);console.log(child.stdout.trim());
 const before=Number((await db.pool.query('SELECT count(*) FROM private_attachment')).rows[0].count);await expectRejectedAsync(()=>store!.store({...context,requestId:randomUUID()},Buffer.from('89504e470d0a1a0a00000000','hex'),'image/png',true),'decoder');assert.equal(Number((await db.pool.query('SELECT count(*) FROM private_attachment')).rows[0].count),before);console.log('PASS decoder refusal leaves no ready metadata');
 const key=randomBytes(32),archive=await backupSynthetic(db,key,{includeReceiptFiles:true});const restored=await restoreSynthetic(archive,key,{syntheticOnly:true,incidentCutoff:new Date().toISOString(),effects:[]});
 try{assert.equal(restored.report.processingDisabled,true);assert.equal(restored.report.receiptFiles.verified,4);const binding=restored.report.receiptFiles.reboundStores[0];assert.notEqual(binding.root,store.root);for(const receipt of receipts){for(const kind of ['original','preview'] as const)assert.deepEqual(await readFile(binding.root+'/'+receipt.id+(kind==='original'?'.original':'.preview.png')),(await store.read(actor,receipt.id,kind)).bytes);}await assert.rejects(createSyntheticReceiptStore(restored.pool,async()=>{throw Error('Conversion forbidden');},{reopen:{storeId:store.storeId,context:{actor:admin,requestId:randomUUID()}}}),/RECOVERY_QUARANTINE/);console.log('PASS encrypted database + actual PNG/JPEG files restore with fresh bindings, byte hashes and processing quarantine');}finally{await restored.stop();}

}finally{await db.stop();if(store)await rm(store.root,{recursive:true,force:true});}
