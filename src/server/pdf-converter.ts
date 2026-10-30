import {spawn} from 'node:child_process';import {join} from 'node:path';import {PreviewRejected} from '../../ops/documents/outcomes';
export const isolatedPdfConverter=async(layout:unknown)=>{
 const bytes=Buffer.from(JSON.stringify(layout));if(bytes.length>131072)throw Error('Layout too large');
 const output=await new Promise<Buffer>((resolve,reject)=>{
  const child=spawn(process.execPath,[join(process.cwd(),'node_modules/tsx/dist/cli.mjs'),join(process.cwd(),'ops/payslip-pdf/convert-cli.ts')],{stdio:['pipe','pipe','pipe']});let size=0,errorText='',failure:Error|undefined;const chunks:Buffer[]=[];
  const timer=setTimeout(()=>{failure=Error('Processing deadline; operator review required');child.kill('SIGKILL');},75000);
  child.stdout.on('data',(b:Buffer)=>{size+=b.length;if(size>262144){failure=Error('Processing output exceeded bound');child.kill('SIGKILL');}else chunks.push(b);});child.stderr.on('data',(b:Buffer)=>{errorText=(errorText+b.toString()).slice(0,4096);});child.stdin.on('error',()=>{});
  child.on('error',error=>{failure=error;});child.on('close',code=>{clearTimeout(timer);if(failure)return reject(failure);if(code===0)return resolve(Buffer.concat(chunks));if(code===2){try{const kind=JSON.parse(errorText).kind;if(['input','decoder','timeout','output'].includes(kind))return reject(new PreviewRejected(kind,'PDF layout refused by isolated processor'));}catch{}}reject(Error('Processing outcome requires operator review'));});child.stdin.end(bytes);
 });
 return output;
};
