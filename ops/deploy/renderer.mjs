import http from 'node:http';
import {readFileSync,writeFileSync,existsSync,unlinkSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {equal} from './policy.mjs';
import {layoutAllowed} from './worker-policy.mjs';
import {renderPdf,PreviewRejected} from './dist/runner.mjs';
const token=readFileSync(process.env.HR_RENDER_TOKEN_FILE,'utf8').trim();if(token.length<32)throw Error('TOKEN');
const marker=process.env.HR_RENDER_STATE+'/processing.json';
const server=http.createServer({maxHeaderSize:8192},async(req,res)=>{
 res.setHeader('Cache-Control','no-store');if(!equal(req.headers.authorization,'Bearer '+token)){res.writeHead(403);res.end();return;}
 if(req.url==='/healthz'&&req.method==='GET'){res.writeHead(existsSync(marker)?503:200);res.end(existsSync(marker)?'held':'ready');return;}
 if(req.method!=='POST'||req.url!=='/pdf'||req.headers['content-type']!=='application/json'){res.writeHead(404);res.end();return;}
 if(existsSync(marker)){res.writeHead(503);res.end('held');return;}
 let size=0,body=[];try{for await(const b of req){size+=b.length;if(size>131072){res.writeHead(413);res.end();return;}body.push(b);}const layout=JSON.parse(Buffer.concat(body).toString());if(!layoutAllowed(layout)){res.writeHead(422);res.end('unsupported-layout');return;}
  writeFileSync(marker,JSON.stringify({jobId:randomUUID(),state:'processing'}),{mode:0o600,flag:'wx'});
  try{const pdf=renderPdf(layout);unlinkSync(marker);res.setHeader('Content-Type','application/pdf');res.end(pdf);}catch(e){if(e instanceof PreviewRejected){unlinkSync(marker);res.writeHead(422);res.end('render-refused');}else{res.writeHead(503);res.end('held');}}
 }catch{res.writeHead(existsSync(marker)?503:422);res.end(existsSync(marker)?'held':'invalid-input');}
});
server.maxConnections=2;server.requestTimeout=5000;server.headersTimeout=5000;server.listen(3133,'127.0.0.1');
