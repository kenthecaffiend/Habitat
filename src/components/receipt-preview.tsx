 'use client';
import {useRef,useState} from 'react';
/** Preview always uses the authenticated, locally converted PNG; original evidence is unchanged. */
export function ReceiptPreview({id,label}:{id:string;label:string}){
 const dialog=useRef<HTMLDialogElement>(null),[failed,setFailed]=useState(false);
 return <><button type="button" onClick={()=>{setFailed(false);dialog.current?.showModal();}}>{label}</button><dialog ref={dialog} className="receipt-preview" aria-label="Receipt preview" onClick={e=>{if(e.target===dialog.current)dialog.current.close();}}><header><h2>Receipt</h2><button type="button" onClick={()=>dialog.current?.close()} aria-label="Close receipt preview">Close</button></header>{failed?<p role="alert">This receipt could not be opened. Check your access or try again.</p>:<img src={'/api/files/'+encodeURIComponent(id)+'?kind=preview'} alt="Receipt" onError={()=>setFailed(true)}/>}<a href={'/api/files/'+encodeURIComponent(id)+'?kind=original'}>Download original</a></dialog></>;
}
