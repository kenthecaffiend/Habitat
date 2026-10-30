import {spawn} from 'node:child_process';import {join} from 'node:path';
// Keep parsers off the web event loop; no application secrets are passed in the environment.
export function validateUpload(bytes:Buffer,mime:string):Promise<Buffer>{return new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,['--max-old-space-size=96','--max-semi-space-size=4','--disable-wasm-trap-handler','--wasm-max-mem-pages=2048',join(process.cwd(),'ops/documents/validate-upload.mjs'),mime],{stdio:['pipe','pipe','ignore'],env:{PATH:process.env.PATH??'',NODE_ENV:'production'}});let size=0;const chunks:Buffer[]=[];let invalid=false;
 const timer=setTimeout(()=>{invalid=true;child.kill('SIGKILL');},8000);child.stdin.on('error',()=>{});child.on('error',()=>{invalid=true;});child.stdout.on('data',(b:Buffer)=>{size+=b.length;if(size>4194304){invalid=true;child.kill('SIGKILL');}else chunks.push(b);});child.on('close',code=>{clearTimeout(timer);if(invalid||code!==0)return reject(Error('FILE_FORMAT'));resolve(Buffer.concat(chunks));});child.stdin.end(bytes);
});}
