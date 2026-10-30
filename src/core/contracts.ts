export type Id=string;export type DateOnly=string;export type Month=string;export type Money=number;export type DayUnits=number;
export type Actor={userId:Id;employeeId:Id;role:'employee'|'admin'};
export type AuditContext={actor:Actor;requestId:Id;reason?:string};
export type Result<T>={ok:true;value:T}|{ok:false;code:string;message:string;fields?:Record<string,string>};
export const ok=<T>(value:T):Result<T>=>({ok:true,value});
export const fail=(code:string,message:string,fields?:Record<string,string>):Result<never>=>({ok:false,code,message,...(fields?{fields}:{})});
