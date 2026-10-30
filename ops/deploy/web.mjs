import {readFileSync,lstatSync} from 'node:fs';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {Pool} from 'pg';
import {stageConfig,authorised,ownerAllowed,session,route} from './policy.mjs';
function secret(name){const p='/run/secrets/'+name,s=lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||s.size>512)throw Error('SECRET_FILE');const v=readFileSync(p,'utf8').trim();if(v.length<32)throw Error('SECRET_LENGTH');return v;}
const c=stageConfig(JSON.parse(readFileSync('/run/hr/config.json','utf8')));
const keys={operator:secret('operator'),session:secret('session')};
const pool=new Pool({host:'db',port:5432,user:'hr_app',password:secret('app_db'),database:c.database,max:2,connectionTimeoutMillis:3000,statement_timeout:3000});
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3001'],{stdio:['ignore','inherit','inherit'],env:{...process.env,NODE_ENV:'production'}});
child.on('exit',()=>process.exit(1));
const server=http.createServer({maxHeaderSize:8192},async(req,res)=>{
 res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'none'; style-src 'self' 'unsafe-inline'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
 if(req.url==='/healthz'&&req.method==='GET'&&req.headers.host==='127.0.0.1:3000'&&['127.0.0.1','::1'].includes(req.socket.remoteAddress)){
  try{const identity=(await pool.query('SELECT environment FROM environment_identity WHERE id=1')).rows[0]?.environment;const count=Number((await pool.query('SELECT count(id) AS n FROM employee')).rows[0].n);if(identity!==c.environment||count!==0)throw Error('EMPTY_IDENTITY');for(const path of ['/staged','/api/internal/production-contract'])await new Promise((resolve,reject)=>{const q=http.get('http://127.0.0.1:3001'+path,r=>{r.resume();r.statusCode===200?resolve():reject(Error('WEB_CONTRACT'));});q.setTimeout(4000,()=>q.destroy(Error('TIMEOUT')));q.on('error',reject);});res.setHeader('Content-Type','application/json');res.end(JSON.stringify({status:'staged-empty',environment:c.environment,release:c.release,image:c.image,payrollReady:false,realData:false,issuance:false,mail:false}));}catch{res.writeHead(503);res.end('staging-not-ready');}return;
 }
 if(!authorised(req.headers,c,keys)){const owner=ownerAllowed(req.headers,c);if(owner)res.setHeader('WWW-Authenticate','Basic realm="Private HR staging", charset="UTF-8"');res.writeHead(owner?401:403);res.end('Private owner access and HR operator credential required');return;}
 res.setHeader('Set-Cookie',session(c,keys)+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=3600');
 const target=route(req.method,req.url??'');if(!target){res.writeHead(503);res.end('HR operational workflows are gated: empty production staging only');return;}
 const upstream=http.request({host:'127.0.0.1',port:3001,path:target,method:req.method,headers:{host:'127.0.0.1:3001'}},r=>{res.statusCode=r.statusCode??502;if(r.headers['content-type'])res.setHeader('Content-Type',r.headers['content-type']);r.pipe(res);});upstream.on('error',()=>{res.writeHead(503);res.end('staging-not-ready');});upstream.end();
});
server.requestTimeout=5000;server.headersTimeout=5000;server.maxConnections=32;server.listen(3000,'0.0.0.0');
function stop(){server.close();child.kill('SIGTERM');pool.end().finally(()=>process.exit(0));}process.on('SIGTERM',stop);process.on('SIGINT',stop);
