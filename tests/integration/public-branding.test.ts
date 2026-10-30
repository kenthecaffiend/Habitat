import {beforeAll,afterAll,it,expect} from 'vitest';
import {createHash,randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {createSyntheticSource} from '../../ops/recovery/rehearsal';
import * as publicBranding from '../../src/server/public-branding';
let db:Awaited<ReturnType<typeof createSyntheticSource>>;
beforeAll(async()=>{db=await createSyntheticSource();});
afterAll(async()=>db?.stop());
const request=(query='theme=light',method='GET',path='/api/branding/public-logo')=>new Request('http://localhost'+path+'?'+query,{method});
async function asset(body:Buffer,sha256=createHash('sha256').update(body).digest('hex'),width=20,height=10){const id=randomUUID();await db.pool.query('INSERT INTO branding_asset VALUES($1,$2,$3,$4,$5)',[id,sha256,body,width,height]);return id;}
async function current(light:string|null,dark:string|null){await db.pool.query('UPDATE branding_setting SET light=$1,dark=$2 WHERE id=1',[light,dark]);}
// A public route that accepts asset selectors or returns historical assets would break this boundary.
it('accepts only GET with one light/dark theme, never arbitrary asset selectors or private paths',async()=>{
 expect(publicBranding.createPublicBrandingHttp).toBeTypeOf('function');
 const handle=publicBranding.createPublicBrandingHttp(db.pool);
 for(const query of ['', 'theme=system','theme=light&theme=dark','variant=light','theme=light&id='+randomUUID(),'theme=light&revision=1','theme=light&path=/private/file'])expect((await handle(request(query))).status).toBe(400);
 expect((await handle(request('theme=light','POST'))).status).toBe(405);
 expect((await handle(request('theme=light','GET','/api/branding/logo'))).status).toBe(404);
});
it('serves only the current selected theme and its configured opposite-theme fallback, without ids or metadata',async()=>{
 const light=await sharp({create:{width:20,height:10,channels:4,background:'red'}}).png().toBuffer();
 const dark=await sharp({create:{width:20,height:10,channels:4,background:'blue'}}).png().toBuffer();
 const l=await asset(light),d=await asset(dark);await current(l,d);
 const handle=publicBranding.createPublicBrandingHttp(db.pool);
 for(const [theme,body] of [['light',light],['dark',dark]] as const){const r=await handle(request('theme='+theme));expect(r.status).toBe(200);expect(Buffer.from(await r.arrayBuffer())).toEqual(body);expect(r.headers.get('content-type')).toBe('image/png');expect(r.headers.get('cache-control')).toBe('no-store');expect(r.headers.get('x-content-type-options')).toBe('nosniff');expect(r.headers.get('content-security-policy')).toContain("default-src 'none'");expect(r.headers.has('etag')).toBe(false);expect(r.headers.has('access-control-allow-origin')).toBe(false);}
 await current(l,null);expect(Buffer.from(await (await handle(request('theme=dark'))).arrayBuffer())).toEqual(light);
 await current(null,d);expect(Buffer.from(await (await handle(request())).arrayBuffer())).toEqual(dark);
 await current(null,null);const missing=await handle(request());expect(missing.status).toBe(404);expect(await missing.text()).toBe('');
});
it('fails closed for tampered, non-PNG, truncated and incorrectly sized current assets',async()=>{
 const png=await sharp({create:{width:20,height:10,channels:4,background:'green'}}).png().toBuffer();
 const jpeg=await sharp(png).jpeg().toBuffer();
 const corrupt=Buffer.from(png);corrupt[corrupt.length-20]^=255;
 for(const id of [await asset(png,'0'.repeat(64)),await asset(jpeg),await asset(png.subarray(0,24)),await asset(corrupt),await asset(png,undefined,21,10)]){await current(id,null);const r=await publicBranding.createPublicBrandingHttp(db.pool)(request());expect(r.status).toBe(404);expect(await r.text()).toBe('');}
});
it('serves bounded square favicons from the existing dark logo with opaque Habitat navy margins without exposing asset selectors',async()=>{const bytes=await sharp({create:{width:20,height:10,channels:4,background:'#ffffff'}}).png().toBuffer(),id=await asset(bytes);await current(null,id);for(const size of [32,64,180]){const r=await publicBranding.createPublicBrandingHttp(db.pool)(new Request('http://localhost/api/branding/favicon?size='+size+'&v=1'));expect(r.status).toBe(200);expect(r.headers.get('content-type')).toBe('image/png');expect(r.headers.get('cache-control')).toBe('no-store');const meta=await sharp(Buffer.from(await r.arrayBuffer())).metadata();expect(meta).toMatchObject({width:size,height:size});const raw=await sharp(Buffer.from(await (await publicBranding.createPublicBrandingHttp(db.pool)(new Request('http://localhost/api/branding/favicon?size='+size))).arrayBuffer())).ensureAlpha().raw().toBuffer();expect([...raw.subarray(0,4)]).toEqual([7,19,41,255]);expect([...raw].filter((_,i)=>i%4===3).every(a=>a===255)).toBe(true);expect(raw[((Math.floor(size/2)*size+Math.floor(size/2))*4)+3]).toBe(255);}expect((await publicBranding.createPublicBrandingHttp(db.pool)(new Request('http://localhost/api/branding/favicon?size=999'))).status).toBe(400);expect((await publicBranding.createPublicBrandingHttp(db.pool)(new Request('http://localhost/api/branding/favicon?size=32&id='+id))).status).toBe(400);});
