import{headers}from'next/headers';import{redirect}from'next/navigation';import{getApplication}from'../server/runtime';import{roleLanding}from'../core/role-navigation';
export const dynamic='force-dynamic';
export default async function Home(){const app=await getApplication(),response=await app.handle(new Request('http://localhost/api/employee',{headers:await headers()}));if(!response.ok)redirect('/login');const actor=await response.json();redirect(roleLanding(actor.role));}
