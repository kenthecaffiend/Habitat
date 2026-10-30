import {z} from 'zod';
import rules2026 from '../compliance/rules/sg-2026.json' with {type:'json'};
import rules2027 from '../compliance/rules/sg-2027.json' with {type:'json'};
export const payrollMonthSchema=z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).refine(value=>Number(value.slice(0,4))>=2026,'Choose a payroll month from 2026 onward');
// Effective start selects the configured version. Verified end is metadata, not an expiry.
const configured=[rules2026,rules2027].sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom));
export function configuredPayrollRules(month:string){payrollMonthSchema.parse(month);const rules=configured.filter(r=>r.effectiveFrom<=month+'-01').at(-1);if(!rules)throw Error('No configured payroll rules apply to this period');return rules;}
export function verifiedPayrollPeriod(month:string){try{const r=configuredPayrollRules(month);return month<=r.effectiveTo.slice(0,7);}catch{return false;}}
export function payrollRulesMessage(month:string,ruleId?:string){const rules=ruleId?configured.find(r=>r.id===ruleId):configuredPayrollRules(month);return rules&&month>rules.effectiveTo.slice(0,7)?`Using configured ${rules.effectiveFrom.slice(0,4)} rules. Update them if statutory rules change.`:null;}
