'use client';
import {useEffect,useState} from 'react';

type Theme='light'|'dark';
export default function CompanyLogo({theme,public:publicLogo=false}:{theme:Theme;public?:boolean}){
 const [branding,setBranding]=useState<{revision:number;light:string|null;dark:string|null}>();
 const [failed,setFailed]=useState(false);
 useEffect(()=>{
  if(publicLogo)return;
  let alive=true;
  const load=()=>{void fetch('/api/branding',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(d=>{if(alive){setBranding(d?.ok?d.value:undefined);setFailed(false);}}).catch(()=>{});};
  load();window.addEventListener('branding-changed',load);
  return()=>{alive=false;window.removeEventListener('branding-changed',load);};
 },[publicLogo]);
 useEffect(()=>setFailed(false),[theme,publicLogo]);
 const available=publicLogo||branding&&(branding[theme]||branding[theme==='dark'?'light':'dark']);
 const src=publicLogo?'/api/branding/public-logo?theme='+theme:'/api/branding/logo?variant='+theme+'&revision='+branding?.revision;
 return <span className="logo-space" aria-label={!failed&&available?'Company logo':'Company logo placeholder'}>{!failed&&available?<img src={src} alt="Company logo" onError={()=>setFailed(true)}/>:<>YOUR<br/>LOGO</>}</span>;
}
