import {runSchedulerLoop} from '../../src/worker/loop';import {readSchedule} from '../../src/worker/config';
import {beforeAll,afterAll,it,expect} from 'vitest';import {disposablePostgres} from '../helpers/postgres';import {readConfig} from '../../src/server/config';import {prepareDatabase} from '../../src/server/db';import {enqueueDueDrafts} from '../../src/worker/scheduler';
let db:Awaited<ReturnType<typeof disposablePostgres>>;const company='00000000-0000-4000-8000-000000000001';
const calendars=[{year:2026,workingWeekdays:[1,2,3,4,5],holidays:[],verifiedSource:'synthetic:test',verifiedAt:'2026-10-23'}];
beforeAll(async()=>{db=await disposablePostgres();await prepareDatabase(db.pool,readConfig({APP_ENV:'test',DATABASE_URL:db.url,APP_ORIGIN:'http://127.0.0.1:3130',SESSION_SECRET:'synthetic-only-long-session-secret-for-tests',MAIL_TRANSPORT:'capture',STORAGE_ENV:'test'}));});
afterAll(async()=>{await db?.stop();});
it('two workers plus restart catch-up create one intent and no external effects',async()=>{
 const args=[db.pool,'2026-11-02T00:00:00Z',company,['2026-10'],calendars] as const;
 const results=await Promise.all([enqueueDueDrafts(...args),enqueueDueDrafts(...args)]);expect(results.every(r=>r.ok)).toBe(true);
 expect((await db.pool.query('SELECT * FROM draft_intent')).rows).toHaveLength(1);
 expect(await enqueueDueDrafts(...args)).toEqual({ok:true,value:[]});
 expect((await db.pool.query('SELECT * FROM draft_intent')).rows[0]).toMatchObject({status:'pending',job_kind:'draft',salary_month:'2026-10'});
});
it('future jobs are not enqueued and missing calendar is an explicit block',async()=>{
 expect(await enqueueDueDrafts(db.pool,'2026-11-01T00:00:00Z',company,['2026-11'],calendars)).toEqual({ok:true,value:[]});
 expect(await enqueueDueDrafts(db.pool,'2027-01-02T00:00:00Z',company,['2026-12'],calendars)).toMatchObject({ok:false});
});

it('real scheduler loop catches the due boundary and restart adds no duplicate',async()=>{
 const cfg=readSchedule({enabled:true,companyId:'00000000-0000-4000-8000-000000000005',salaryMonths:['2026-10'],profile:{workingWeekdays:[1,2,3,4,5],restDay:0}});
 const controller=new AbortController();let ticks=0;const created:string[]=[];
 await runSchedulerLoop(async()=>{const now=ticks++===0?'2026-10-31T23:59:00Z':'2026-11-01T00:00:00Z';const r=await enqueueDueDrafts(db.pool,now,cfg.companyId,cfg.salaryMonths,cfg.calendars);expect(r.ok).toBe(true);if(r.ok)created.push(...r.value);if(ticks===2)controller.abort();},controller.signal,e=>{throw e;},async ms=>{expect(ms).toBe(60000);});
 expect(created).toHaveLength(1);
 expect(await enqueueDueDrafts(db.pool,'2026-11-02T00:00:00Z',cfg.companyId,cfg.salaryMonths,cfg.calendars)).toEqual({ok:true,value:[]});
});
it('worker refuses a different deployment database identity',async()=>expect(await enqueueDueDrafts(db.pool,'2026-11-01T00:00:00Z',company,['2026-10'],calendars,'dev')).toMatchObject({ok:false,code:'ENVIRONMENT_BLOCKED'}));
