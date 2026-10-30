import {ok,fail,type Result} from '../../core/contracts';
import type {WorkCalendar} from './types';
import sg2026 from './data/sg-2026.json' with {type:'json'};
import sg2027 from './data/sg-2027.json' with {type:'json'};

export type WorkProfile = {workingWeekdays:number[]; restDay:number};

/** Explicitly selected five-day/Sunday-rest profile; no default employment assumptions. */
export function singaporeCalendar(year:number,profile:WorkProfile):Result<WorkCalendar> {
  if (!profile || profile.restDay !== 0 || !Array.isArray(profile.workingWeekdays) ||
      profile.workingWeekdays.join(',') !== '1,2,3,4,5') {
    return fail('WORK_PROFILE_UNSUPPORTED','Confirm Monday–Friday work and Sunday rest before using this calendar.');
  }
  const data = [sg2026,sg2027].find(item=>item.year===year);
  if (!data) return fail('HOLIDAY_YEAR_UNVERIFIED','No verified holiday catalog for '+year);
  return ok({
    year,
    workingWeekdays:[...profile.workingWeekdays],
    holidays:[...data.publicHolidays,...data.sundayRestObservances.map(item=>item.observed)].sort(),
    verifiedSource:data.source,
    verifiedAt:data.checkedAt
  });
}
