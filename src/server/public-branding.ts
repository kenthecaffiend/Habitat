import {createHash} from 'node:crypto';
import type {Pool} from 'pg';
import sharp from 'sharp';
import {LOGO_LIMIT} from '../modules/branding/service';

// Only current branding is public. Asset ids, revisions and file paths are not accepted.
export function createPublicBrandingHttp(pool:Pool){
 return async(request:Request):Promise<Response>=>{
  const url=new URL(request.url);
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"};
  const empty=(status:number)=>new Response(null,{status,headers});
  const favicon=url.pathname==='/api/branding/favicon';if(!favicon&&url.pathname!=='/api/branding/public-logo')return empty(404);
  if(request.method!=='GET')return new Response(null,{status:405,headers:{...headers,Allow:'GET'}});
  const theme=favicon?'dark':url.searchParams.get('theme'),size=Number(url.searchParams.get('size')??64);
  if(favicon?![32,64,180].includes(size)||[...url.searchParams.keys()].some(k=>!['size','v'].includes(k))||url.searchParams.getAll('size').length>1||url.searchParams.getAll('v').length>1:!['light','dark'].includes(theme??'')||[...url.searchParams.keys()].length!==1)return empty(400);
  try{
   const columns=favicon?'s.dark,s.dark':theme==='dark'?'s.dark,s.light':'s.light,s.dark';
   const row=(await pool.query('SELECT a.body,a.sha256,a.width,a.height FROM branding_setting s JOIN branding_asset a ON a.id=COALESCE('+columns+') WHERE s.id=1')).rows[0];
   if(!row||!Buffer.isBuffer(row.body)||row.body.length===0||row.body.length>LOGO_LIMIT)return empty(404);
   const bytes:Buffer=row.body;
   if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||createHash('sha256').update(bytes).digest('hex')!==row.sha256)return empty(404);
   const image=sharp(bytes,{limitInputPixels:768*384,failOn:'warning',sequentialRead:true});
   const meta=await image.metadata();
   if(meta.format!=='png'||!meta.width||!meta.height||meta.width>768||meta.height>384||(meta.pages??1)!==1||meta.width!==row.width||meta.height!==row.height)return empty(404);
   // Decode too: header inspection alone would permit truncated or corrupt PNG bytes.
   await image.raw().timeout({seconds:3}).toBuffer();
   const padding=Math.max(1,Math.round(size*0.14)),inner=size-2*padding;const output=favicon?await sharp(bytes).resize(inner,inner,{fit:'contain',background:'#071329'}).extend({top:padding,bottom:padding,left:padding,right:padding,background:'#071329'}).flatten({background:'#071329'}).png().timeout({seconds:3}).toBuffer():bytes;return new Response(new Uint8Array(output),{headers:{...headers,'Content-Type':'image/png',...(favicon?{ETag:'"'+createHash('sha256').update(output).digest('hex')+'"'}:{})}});
  }catch{return empty(404);}
 };
}
