import {PreviewRejected} from './outcomes';
import {spawnSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {isolationArgs} from './isolation';
export const IMAGE='sha256:d08008b20a33a282b14db82122c2e37cbfeddc1cf9f6c561de9b724ed9e32d70';
// Development rehearsal only; never imported by app routes. No paths/URLs accepted.
export function isolated(command:string[]|null,input:Buffer=Buffer.alloc(0),timeout=10000){
 const name='hr-preview-'+randomUUID();
 const created=spawnSync('docker',['create',...isolationArgs(name),'-i',...(command?['--entrypoint','python']:[]),IMAGE,...(command??[])],{encoding:'utf8',timeout:15000,maxBuffer:65536});
 const id=created.stdout?.trim();if(created.status!==0||!id||!/^[a-f0-9]{64}$/.test(id))throw Error('Container creation unconfirmed; inspect '+name+' before retry');
 try{
  const inspected=spawnSync('docker',['inspect',id],{encoding:'utf8',timeout:10000,maxBuffer:65536});if(inspected.status!==0)throw Error('Isolation inspection failed');
  const [c]=JSON.parse(inspected.stdout),h=c.HostConfig;
  if(c.Config.User!=='65532:65532'||h.NetworkMode!=='none'||!h.ReadonlyRootfs||h.Privileged||c.Mounts.length||h.PortBindings&&Object.keys(h.PortBindings).length||!h.CapDrop.includes('ALL')||!h.SecurityOpt.includes('no-new-privileges')||h.Memory!==268435456||h.MemorySwap!==268435456||h.NanoCpus!==1e9||h.PidsLimit!==32||c.Config.Labels['com.centurylinklabs.watchtower.enable']!=='false')throw Error('Isolation configuration refused');
  const r=spawnSync('docker',['start','-a','-i',id],{input,timeout,maxBuffer:4*1024*1024+65536});
  if(r.error||r.status!==0){
   const check=spawnSync('docker',['inspect',id],{encoding:'utf8',timeout:10000,maxBuffer:65536});if(check.status!==0)throw Error('Post-failure inspection unconfirmed');
   const state=JSON.parse(check.stdout)[0].State;
   if((r.error as NodeJS.ErrnoException)?.code==='ETIMEDOUT'&&state.StartedAt&&!state.StartedAt.startsWith('0001'))throw new PreviewRejected('timeout','Bounded processing timeout');
   if((r.error as NodeJS.ErrnoException)?.code==='ENOBUFS')throw new PreviewRejected('output','Output bound exceeded');
   if(!r.error&&r.status===2&&state.ExitCode===2&&!state.Error&&!state.OOMKilled)throw new PreviewRejected('decoder','Unsupported or invalid image');
   throw Error('Container execution failed unexpectedly; stop rehearsal');
  }
  return r.stdout;
 }finally{const r=spawnSync('docker',['rm','-f',id],{timeout:10000,maxBuffer:65536});if(r.status!==0)throw Error('Cleanup unconfirmed for owned container '+id+'; stop before retry');}
}
export function previewSyntheticImage(bytes:Buffer,declaredMime:'image/png'|'image/jpeg',syntheticOnly:true){
 if(syntheticOnly!==true||bytes.length===0||bytes.length>20*1024*1024)throw new PreviewRejected('input','Synthetic bounded input required');
 const png=bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')),jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(!(declaredMime==='image/png'&&png)&&!(declaredMime==='image/jpeg'&&jpeg))throw new PreviewRejected('input','MIME/signature mismatch');
 const originalHash=createHash('sha256').update(bytes).digest('hex'),out=isolated(null,bytes);
 if(out.length>4*1024*1024||!out.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))throw Error('Invalid preview output');
 return {bytes:out,originalHash,previewHash:createHash('sha256').update(out).digest('hex'),syntheticOnly:true,uploadsEnabled:false};
}
