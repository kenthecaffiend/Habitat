import {describe,it,expect} from 'vitest';import {scheduleFor,countLeaveUnits,countPayrollMonthUnits} from '../../src/modules/calendar';import type {WorkCalendar} from '../../src/modules/calendar/types';
const cal=(year:number,holidays:string[]=[]):WorkCalendar=>({year,workingWeekdays:[1,2,3,4,5],holidays,verifiedSource:'synthetic:test',verifiedAt:'2026-10-23'});
describe('calendar and payroll day basis',()=>{
 it('October salary payday is Monday November 2, draft Sunday 08 Singapore',()=>expect(scheduleFor('2026-10',[cal(2026)])).toEqual({ok:true,value:{payday:'2026-11-02',draftAt:'2026-11-01T08:00:00+08:00'}}));
 it('Saturday first moves to preceding Friday',()=>expect(scheduleFor('2025-01',[cal(2025)])).toEqual({ok:true,value:{payday:'2025-01-31',draftAt:'2025-01-31T08:00:00+08:00'}}));
 it('equidistant workdays choose earlier',()=>expect(scheduleFor('2026-03',[cal(2026,['2026-04-01'])])).toEqual({ok:true,value:{payday:'2026-03-31',draftAt:'2026-03-31T08:00:00+08:00'}}));
 it('Friday afternoon and Monday morning consume one day',()=>expect(countLeaveUnits({start:'2026-10-23',end:'2026-10-26',startPart:'pm',endPart:'am'},[cal(2026)])).toEqual({ok:true,value:2}));
 it('single half day is counted once',()=>expect(countLeaveUnits({start:'2026-10-23',end:'2026-10-23',startPart:'am',endPart:'am'},[cal(2026)])).toEqual({ok:true,value:1}));
 it('payroll denominator includes paid holidays but leave excludes them',()=>{const c=[cal(2026,['2026-10-01'])];expect(countPayrollMonthUnits('2026-10',c)).toEqual({ok:true,value:44});expect(countLeaveUnits({start:'2026-10-01',end:'2026-10-31',startPart:'full',endPart:'full'},c)).toEqual({ok:true,value:42});});
 it('cross year leave respects both calendars',()=>expect(countLeaveUnits({start:'2026-12-31',end:'2027-01-04',startPart:'full',endPart:'full'},[cal(2026),cal(2027,['2027-01-01'])])).toEqual({ok:true,value:4}));
 it.each(['2026-12','2026-13','bad'])('unknown year or invalid month blocks %s',m=>expect(scheduleFor(m,[cal(2026)])).toMatchObject({ok:false}));
 it('impossible date is refused',()=>expect(countLeaveUnits({start:'2026-02-30',end:'2026-03-01',startPart:'full',endPart:'full'},[cal(2026)])).toMatchObject({ok:false}));
});
