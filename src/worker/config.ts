import {z} from 'zod';import {singaporeCalendar} from '../modules/calendar/verified';
export const scheduleSchema=z.object({
 enabled:z.boolean(),
 payrollActorEmployeeId:z.uuid().optional(),
 companyId:z.uuid(),
 salaryMonths:z.array(z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)).min(1).max(24),
 profile:z.object({workingWeekdays:z.array(z.number()),restDay:z.number()})
}).strict();
export function readSchedule(value:unknown){
 const data=scheduleSchema.parse(value);const years=new Set<number>();
 for(const month of data.salaryMonths){const [year,number]=month.split('-').map(Number);years.add(year);if(number===12)years.add(year+1);}
 const calendars=[...years].map(year=>{const result=singaporeCalendar(year,data.profile);if(!result.ok)throw new Error(result.message);return result.value;});
 return {...data,calendars};
}
