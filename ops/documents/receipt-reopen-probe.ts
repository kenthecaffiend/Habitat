// Child-process probe for disposable synthetic rehearsal only. No conversion or HTTP.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Pool} from 'pg';
import {readConfig} from '../../src/server/config';
import {createSyntheticReceiptStore} from '../../src/modules/files/synthetic-store';
const input=JSON.parse(readFileSync(0,'utf8'));
assert.equal(input.purpose,'synthetic-restart-probe');
const config=readConfig({APP_ENV:'test',DATABASE_URL:input.url,APP_ORIGIN:'http://127.0.0.1:3130',SESSION_SECRET:'synthetic-restart-probe-not-for-access',MAIL_TRANSPORT:'capture',STORAGE_ENV:'test'});
const pool=new Pool({connectionString:config.databaseUrl});
try{
 const store=await createSyntheticReceiptStore(pool,async()=>{throw Error('Restart retry must not reconvert');},{reopen:{storeId:input.storeId,context:input.adminContext}});
 assert.equal(store.root,input.root);
 for(const item of input.receipts){
  const original=await store.read(input.owner,item.id,'original');
  assert.equal(await store.store(item.context,original.bytes,item.mime,true),item.id);
  assert.equal((await store.read(input.owner,item.id,'preview')).headers['Content-Type'],'image/png');
 }
 console.log('PASS separate-process reopen, integrity reconciliation and exact retries');
}finally{await pool.end();}
