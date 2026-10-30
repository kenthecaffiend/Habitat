export function roleLanding(role:unknown){return role==='admin'?'/admin':role==='employee'?'/employee':'/login';}
export const showViewSwitch=(role:unknown)=>role==='admin';
