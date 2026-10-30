import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {it,expect,vi} from 'vitest';
vi.mock('next/headers',()=>({headers:async()=>new Headers()}));
vi.mock('../../src/server/runtime',()=>({getApplication:async()=>({handle:async(request:Request)=>Response.json(request.url.includes('/api/leave/employees')?{ok:true,value:[{id:'one',name:'Fictional colleague',email:'one@example.invalid'},{id:'two',name:'Fictional colleague',email:'two@example.invalid'}]}:{ok:true,value:[]})})}));
import ReviewClaims from '../../src/app/admin/claims/page';
it('distinguishes duplicate names in employee selection and identifies the selected claims owner',async()=>{
 const html=renderToStaticMarkup(await ReviewClaims({searchParams:Promise.resolve({employeeId:'two'})}));
 expect(html).toContain('Fictional colleague — one@example.invalid');expect(html).toContain('Fictional colleague — two@example.invalid');
 expect(html).toMatch(/<section[^>]*aria-label="Claims for Fictional colleague — two@example.invalid"/);
 expect(html).toContain('aria-current="page"');
});
