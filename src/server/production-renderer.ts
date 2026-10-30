import {request,type RequestOptions,type IncomingMessage,type ClientRequest} from 'node:http';
import {layoutAllowed,issuedLayoutAllowed} from '../../ops/deploy/worker-policy.mjs';
import {PreviewRejected} from '../../ops/documents/outcomes';
type Transport=(options:RequestOptions,callback:(response:IncomingMessage)=>void)=>ClientRequest;
export function createProductionRenderer(token:string,transport:Transport=request,issued=false){
 if(!/^[a-f0-9]{96}$/.test(token))throw Error('RENDERER_TOKEN');
 function call(path:'/healthz'|'/pdf',body?:Buffer){return new Promise<{status:number;mime:string;body:Buffer}>((resolve,reject)=>{
  const q=transport({hostname:'host.docker.internal',port:issued?3135:3133,path,method:body?'POST':'GET',headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json','content-length':body.length}:{})}},r=>{let size=0;const chunks:Buffer[]=[];if(r.headers['content-encoding']&&r.headers['content-encoding']!=='identity'){q.destroy(Error('RENDERER_ENCODING'));return;}r.on('data',(b:Buffer)=>{size+=b.length;if(size>(body?262144:32))q.destroy(Error('RENDERER_OUTPUT'));else chunks.push(b);});r.on('error',()=>reject(Error('RENDERER_UNCERTAIN')));r.on('end',()=>resolve({status:r.statusCode??0,mime:String(r.headers['content-type']??''),body:Buffer.concat(chunks)}));});
  q.setTimeout(body?20000:3000,()=>q.destroy(Error('RENDERER_UNCERTAIN')));q.on('error',()=>reject(Error('RENDERER_UNCERTAIN')));q.end(body);
 });}
 async function healthy(){try{const r=await call('/healthz');return r.status===200&&r.body.toString()==='ready';}catch{return false;}}
 async function render(layout:unknown){if(!(issued?issuedLayoutAllowed(layout):layoutAllowed(layout)))throw Error('RENDERER_LAYOUT');const input=Buffer.from(JSON.stringify(layout));if(input.length>131072)throw Error('RENDERER_LAYOUT');const r=await call('/pdf',input);if(r.status===422)throw new PreviewRejected('decoder','Renderer refused fixed layout');if(r.status!==200)throw Error('RENDERER_UNCERTAIN');if(r.mime!=='application/pdf'||r.body.subarray(0,5).toString()!=='%PDF-')throw Error('RENDERER_OUTPUT');return r.body;}
 return {healthy,render};
}
