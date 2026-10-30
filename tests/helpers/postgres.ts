import EmbeddedPostgres from 'embedded-postgres';import {Pool} from 'pg';import {mkdtemp} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createServer} from 'node:net';
export async function disposablePostgres(environment:'dev'|'test'='test'){
 const port=await new Promise<number>(resolve=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=(s.address() as any).port;s.close(()=>resolve(p));});});
 const dir=await mkdtemp(join(tmpdir(),'hr-synthetic-'));const password='synthetic-test-only-password';
 const server=new EmbeddedPostgres({databaseDir:dir,user:'hr',password,port,persistent:false,onLog:()=>{},onError:()=>{},postgresFlags:['-h','127.0.0.1']});
 await server.initialise();await server.start();await server.createDatabase('hr_'+environment);
 const url='postgresql://hr:'+password+'@127.0.0.1:'+port+'/hr_'+environment;const pool=new Pool({connectionString:url});
 return {pool,url,stop:async()=>{await pool.end();await server.stop();}};
}
