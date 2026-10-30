import {z} from 'zod';import {dateSchema} from '../leave/types';
export const claimSchema=z.object({employeeId:z.uuid(),description:z.string().trim().min(1).max(2000),expenseDate:dateSchema,amountCents:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),attachmentIds:z.array(z.uuid()).min(1).max(5).refine(ids=>new Set(ids).size===ids.length),revision:z.number().int().positive().max(Number.MAX_SAFE_INTEGER)});
export type ClaimInput=z.infer<typeof claimSchema>;
