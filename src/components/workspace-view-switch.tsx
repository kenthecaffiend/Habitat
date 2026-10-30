import Link from'next/link';import{ArrowUpRight}from'lucide-react';import{showViewSwitch}from'../core/role-navigation';
export function WorkspaceViewSwitch({role,admin}:{role:string|null;admin:boolean}){return showViewSwitch(role)?<Link className="view-link" href={admin?'/employee':'/admin'}><ArrowUpRight size={16}/>{admin?'My employee view':'Admin View'}</Link>:null;}
