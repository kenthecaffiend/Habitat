import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {getApplication} from '../../../server/runtime';
import OwnProfile from './profile-panel';
import ChangePassword from './change-password';
export const dynamic='force-dynamic';
export default async function ProfilePage(){
 const response=await(await getApplication()).handle(new Request('http://localhost/api/employees/me',{headers:await headers()}));
 if(response.status===401)redirect('/login');
 const result=await response.json();
 const capability=await(await getApplication()).handle(new Request('http://localhost/api/employee',{headers:await headers()}));
 const passwordChangeEnabled=capability.ok&&(await capability.json()).passwordChangeEnabled===true;
 return <main><h1>Profile</h1>{result.ok?<><OwnProfile initial={result.value}/><ChangePassword enabled={passwordChangeEnabled}/></>:<p role="alert">Your profile is unavailable. Please try again.</p>}</main>;
}
