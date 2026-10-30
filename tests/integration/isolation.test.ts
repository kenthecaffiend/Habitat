import {beforeAll,afterAll,it,expect} from 'vitest';
import {disposablePostgres} from '../helpers/postgres';
import {prepareDatabase,withTransaction,appendAudit} from '../../src/server/db';
import {readConfig} from '../../src/server/config';
let db:Awaited<ReturnType<typeof disposablePostgres>>;
beforeAll(async()=>{db=await disposablePostgres();});
afterAll(async()=>{await db?.stop();});
const config=()=>readConfig({APP_ENV:'test',DATABASE_URL:db.url,APP_ORIGIN:'http://127.0.0.1:3130',SESSION_SECRET:'synthetic-isolation-secret-at-least-32',MAIL_TRANSPORT:'capture',STORAGE_ENV:'test'});
it('wrong identity blocks before migration objects are created',async()=>{
 await db.pool.query('CREATE TABLE environment_identity(id integer PRIMARY KEY,environment text)');
 await db.pool.query("INSERT INTO environment_identity VALUES(1,'production')");
 await expect(prepareDatabase(db.pool,config())).rejects.toThrow(/identity/i);
 expect((await db.pool.query("SELECT to_regclass('schema_migration') AS name")).rows[0].name).toBeNull();
 await db.pool.query('DROP TABLE environment_identity');
});
it('unidentified nonempty database is preserved and refused',async()=>{
 await db.pool.query('CREATE TABLE unrelated(id integer)');
 await expect(prepareDatabase(db.pool,config())).rejects.toThrow(/unidentified/i);
 expect((await db.pool.query("SELECT to_regclass('unrelated') AS name")).rows[0].name).toBe('unrelated');
 await db.pool.query('DROP TABLE unrelated');await prepareDatabase(db.pool,config());
});
it('domain write and audit failure roll back together',async()=>{
 await expect(withTransaction(db.pool,async tx=>{
  await tx.query('INSERT INTO "user"(id,name,email) VALUES($1,$2,$3)',['rollback-user','Synthetic','rollback@example.invalid']);
  await appendAudit(tx,{context:{actor:{userId:'missing-user',employeeId:'unused',role:'admin'},requestId:'synthetic'},action:'synthetic',entityId:'unused'});
 })).rejects.toThrow();
 expect((await db.pool.query('SELECT id FROM "user" WHERE id=$1',['rollback-user'])).rowCount).toBe(0);
 expect((await db.pool.query('SELECT id FROM audit_event')).rowCount).toBe(0);
});
