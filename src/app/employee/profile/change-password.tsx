'use client';
import {useRef,useState} from 'react';
export function validatePasswordChange(current:string,next:string,confirm:string){
 if(!current)return 'Enter your current password.';
 if(next.length<1||next.length>128)return 'Enter a non-empty new password of up to 128 characters.';
 if(next!==confirm)return 'The new passwords do not match.';
 return '';
}
export function passwordChangeMessage(status:number,code?:string){
 if(status===429)return 'Too many attempts. Wait a minute before trying again.';
 if(status===401)return 'Your session expired. Sign in again to change your password.';
 if(code==='INVALID_PASSWORD')return 'Your current password is incorrect.';
 if(code==='PASSWORD_TOO_SHORT'||code==='PASSWORD_TOO_LONG')return 'Enter a non-empty new password of up to 128 characters.';
 return 'Unable to change your password. If your connection was interrupted, sign in again to check which password works before retrying.';
}
export default function ChangePassword({enabled=false}:{enabled?:boolean}){
 const [current,setCurrent]=useState(''),[next,setNext]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState(false);
 const saving=useRef(false),errorRef=useRef<HTMLParagraphElement>(null);
 function fail(message:string){setError(message);requestAnimationFrame(()=>errorRef.current?.focus());}
 async function save(){
  if(!enabled||saving.current)return;
  setSuccess(false);setError('');const invalid=validatePasswordChange(current,next,confirm);if(invalid){fail(invalid);return;}
  saving.current=true;setBusy(true);
  try{
   const response=await fetch('/api/auth/change-password',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({currentPassword:current,newPassword:next,revokeOtherSessions:true})});
   if(!response.ok){const data=await response.json().catch(()=>null);fail(passwordChangeMessage(response.status,data?.code));return;}
   setCurrent('');setNext('');setConfirm('');setSuccess(true);
  }catch{fail(passwordChangeMessage(0));}finally{saving.current=false;setBusy(false);}
 }
 return <section className="glass-card password-card"><h2>Change password</h2>{enabled?<form onSubmit={event=>{event.preventDefault();void save();}} aria-busy={busy}>
  <p id="password-guidance">Use a non-empty password of up to 128 characters. Other sessions will be signed out.</p>
  <div className="password-fields">
  <div className="password-field"><label htmlFor="current-password">Current password</label><input id="current-password" name="currentPassword" type="password" autoComplete="current-password" maxLength={128} required value={current} onChange={event=>setCurrent(event.target.value)} disabled={busy} aria-describedby="password-error"/></div>
  <div className="password-field"><label htmlFor="new-password">New password</label><input id="new-password" name="newPassword" type="password" autoComplete="new-password" minLength={1} maxLength={128} required value={next} onChange={event=>setNext(event.target.value)} disabled={busy} aria-describedby="password-guidance password-error"/></div>
  <div className="password-field"><label htmlFor="confirm-password">Confirm new password</label><input id="confirm-password" name="confirmPassword" type="password" autoComplete="new-password" minLength={1} maxLength={128} required value={confirm} onChange={event=>setConfirm(event.target.value)} disabled={busy} aria-describedby="password-error"/></div>
  </div>
  <p id="password-error" role="alert" tabIndex={-1} ref={errorRef}>{error}</p><p role="status" aria-live="polite">{success?'Password changed. Your other sessions have been signed out.':''}</p>
  <div className="application-actions"><button type="submit" disabled={busy}>{busy?'Changing password…':'Change password'}</button><button type="button" disabled={busy} onClick={()=>{setCurrent('');setNext('');setConfirm('');setError('');setSuccess(false);}}>Clear</button></div>
 </form>:<p>Password changes are currently unavailable.</p>}</section>;
}
