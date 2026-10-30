import {it,expect} from 'vitest';
import {calendarDays,moveDate,allowedDate,moveMonth} from '../../src/components/date-picker-model';
it('keeps ISO dates, Sunday-first weeks and leap days without timezone drift',()=>{expect(calendarDays('2026-10-01')).toHaveLength(42);expect(calendarDays('2026-10-01')[0]).toBe('2026-09-27');expect(moveDate('2028-02-28',1)).toBe('2028-02-29');expect(moveDate('2026-12-31',1)).toBe('2027-01-01');});
it('preserves min max and native date step constraints',()=>{expect(allowedDate('2026-10-12','2026-10-13','2026-10-20')).toBe(false);expect(allowedDate('2026-10-21','2026-10-13','2026-10-20')).toBe(false);expect(allowedDate('2026-10-15','2026-10-13','2026-10-20',2)).toBe(true);expect(allowedDate('2026-10-14','2026-10-13','2026-10-20',2)).toBe(false);expect(allowedDate('2026-02-30')).toBe(false);});

it('month and year keyboard jumps clamp end-of-month dates',()=>{expect(moveMonth('2026-01-31',1)).toBe('2026-02-28');expect(moveMonth('2028-02-29',12)).toBe('2029-02-28');expect(moveMonth('2026-01-01',-1)).toBe('2025-12-01');});
