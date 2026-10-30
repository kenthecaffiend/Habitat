import {z} from 'zod';
import {parseDate} from '../calendar';
export const dateSchema=z.string().refine(s=>{try{parseDate(s);return true;}catch{return false;}});
export const rangeSchema=z.object({start:dateSchema,end:dateSchema,startPart:z.enum(['full','am','pm']),endPart:z.enum(['full','am','pm'])});
export const leaveSchema=z.object({employeeId:z.uuid(),type:z.enum(['annual','sick','hospitalisation','unpaid']),range:rangeSchema,reason:z.string().trim().max(2000).default(''),attachmentIds:z.array(z.uuid()).max(5)});
export const profileSchema=z.object({employeeId:z.uuid(),continuing:z.literal(true),eligibleSince:dateSchema,verifiedEvidence:z.string().trim().min(1).max(2000),workingWeekdays:z.tuple([z.literal(1),z.literal(2),z.literal(3),z.literal(4),z.literal(5)]),restDay:z.literal(0)});
export const exceptionSchema=z.object({employeeId:z.uuid(),category:z.string().trim().min(1).max(200),range:rangeSchema,paidTreatment:z.enum(['paid','unpaid']),evidenceId:z.string().trim().max(200),verifiedBy:z.string(),verifiedAt:dateSchema,reason:z.string().trim().min(1).max(2000)});
export type LeaveInput=z.infer<typeof leaveSchema>;
export type ExceptionalLeaveInput=z.infer<typeof exceptionSchema>;
