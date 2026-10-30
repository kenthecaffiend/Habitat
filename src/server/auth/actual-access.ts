import type{Pool}from'pg';
export type ColleagueLogin={employeeId:string;email:string};
export async function actualLoginAllowed(pool:Pool,config:{ownerLogin:string;colleagueLogin?:ColleagueLogin},userId:string,email?:string){
 const e=(await pool.query('SELECT e.id,e.role,e.active,u.email,EXISTS(SELECT FROM employee_source_binding b WHERE b.employee_id=e.id AND b.slot=\'colleague\' AND b.source_system=\'AIMM\') AS linked FROM employee e JOIN "user" u ON u.id=e.user_id WHERE e.user_id=$1',[userId])).rows[0];
 if(!e?.active||email!==undefined&&e.email!==email)return false;
 if(e.email===config.ownerLogin)return e.role==='admin';
 return !!config.colleagueLogin&&e.role==='employee'&&e.linked&&e.id===config.colleagueLogin.employeeId&&e.email===config.colleagueLogin.email;
}
