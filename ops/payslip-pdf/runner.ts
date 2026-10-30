import {PreviewRejected} from '../documents/outcomes';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {isolationArgs} from '../documents/isolation';
export const IMAGE='sha256:78a084bc751482a4727972753f92259a2276418b03c1126b141c51c94ee4469f';
// Development rehearsal only; never imported by app routes. No paths/URLs accepted.
export function pdfContainer(command:string[]|null,input:Buffer=Buffer.alloc(0),timeout=10000,image=IMAGE){
 const name='hr-preview-'+randomUUID();
 const created=spawnSync('docker',['create',...isolationArgs(name),'-i',...(command?['--entrypoint','python']:[]),image,...(command??[])],{encoding:'utf8',timeout:15000,maxBuffer:65536});
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
   if(!r.error&&r.status===2&&state.ExitCode===2&&!state.Error&&!state.OOMKilled)throw new PreviewRejected('decoder','Unsupported or invalid PDF layout');
   throw Error('Container execution failed unexpectedly; stop rehearsal');
  }
  return r.stdout;
 }finally{const r=spawnSync('docker',['rm','-f',id],{timeout:10000,maxBuffer:65536});if(r.status!==0)throw Error('Cleanup unconfirmed for owned container '+id+'; stop before retry');}
}

export function renderPdf(layout:unknown){const input=Buffer.from(JSON.stringify(layout));if(input.length>131072)throw new PreviewRejected('input','Bounded layout required');const out=pdfContainer(null,input);if(out.length>262144||out.subarray(0,5).toString()!=='%PDF-')throw Error('Invalid PDF output');return out;}
