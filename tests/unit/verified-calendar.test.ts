import {it,expect} from 'vitest';
import {singaporeCalendar} from '../../src/modules/calendar/verified';
import {countLeaveUnits,countPayrollMonthUnits,scheduleFor} from '../../src/modules/calendar';
const profile={workingWeekdays:[1,2,3,4,5],restDay:0};
function year(n:number){const r=singaporeCalendar(n,profile);if(!r.ok)throw new Error(r.message);return r.value;}
it('2026 official dates include the three Sunday-rest observances',()=>{
 expect(year(2026).holidays).toEqual(['2026-01-01','2026-02-17','2026-02-18','2026-03-21','2026-04-03','2026-05-01','2026-05-27','2026-05-31','2026-06-01','2026-08-09','2026-08-10','2026-11-08','2026-11-09','2026-12-25']);
});
it('2027 official dates include February8 but no guessed Saturday substitutions',()=>{
 expect(year(2027).holidays).toEqual(['2027-01-01','2027-02-06','2027-02-07','2027-02-08','2027-03-10','2027-03-26','2027-05-01','2027-05-17','2027-05-20','2027-08-09','2027-10-28','2027-12-25']);
 expect(year(2027).holidays).not.toContain('2027-12-27');
});
it('January1 holiday moves December payday to December31',()=>expect(scheduleFor('2026-12',[year(2026),year(2027)])).toEqual({ok:true,value:{payday:'2026-12-31',draftAt:'2026-12-31T08:00:00+08:00'}}));
it('observed holiday changes leave but not payroll denominator',()=>{
 expect(countLeaveUnits({start:'2026-11-09',end:'2026-11-09',startPart:'full',endPart:'full'},[year(2026)])).toEqual({ok:true,value:0});
 expect(countPayrollMonthUnits('2026-11',[year(2026)])).toEqual({ok:true,value:42});
});
it('unknown year and unconfirmed rest profile block rather than guessing',()=>{
 expect(singaporeCalendar(2028,profile)).toMatchObject({ok:false});
 expect(singaporeCalendar(2026,{...profile,restDay:6})).toMatchObject({ok:false});
 expect(singaporeCalendar(2026,{workingWeekdays:[1,2,3,4,5,6],restDay:0})).toMatchObject({ok:false});
});
it('callers cannot mutate the catalog for later calculations',()=>{const c=year(2026);c.holidays.length=0;expect(year(2026).holidays).toContain('2026-11-09');});
