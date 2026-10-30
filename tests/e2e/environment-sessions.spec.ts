import {test,expect,type Page} from '@playwright/test';import {localApp} from '../helpers/local-app';
let dev:Awaited<ReturnType<typeof localApp>>,other:Awaited<ReturnType<typeof localApp>>;
test.beforeAll(async()=>{dev=await localApp('dev');other=await localApp('test');});
test.afterAll(async()=>{await other?.stop();await dev?.stop();});
async function login(page:Page,app:Awaited<ReturnType<typeof localApp>>){await page.goto(app.origin+'/login');await page.getByLabel('Email').fill(app.email);await page.getByLabel('Password').fill(app.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('heading',{name:'Your HR'})).toBeVisible();}
test('same-browser sessions coexist; swapped cookies, cross-port writes and revocation fail',async({page,context})=>{
 await login(page,dev);await expect(page.getByRole('navigation',{name:'Employee'}).getByRole('link')).toHaveCount(3);
 await page.getByRole('link',{name:'Administrator view'}).click();await expect(page.getByRole('heading',{name:'Administrator',exact:true})).toBeVisible();
 await login(page,other);
 const cookies=await context.cookies();const a=cookies.find(c=>c.name==='hr-dev.session_token'),b=cookies.find(c=>c.name==='hr-test.session_token');expect(a).toBeDefined();expect(b).toBeDefined();expect(a!.httpOnly&&b!.httpOnly).toBe(true);expect(a!.sameSite).toBe('Strict');
 await page.goto(dev.origin+'/employee');await expect(page.getByRole('heading',{name:'Your HR'})).toBeVisible();
 expect((await context.request.post(dev.origin+'/api/auth/sign-out',{headers:{origin:other.origin}})).status()).toBe(403);
 await context.addCookies([{...a!,value:b!.value}]);expect((await context.request.get(dev.origin+'/api/employee')).status()).toBe(401);
 await context.addCookies([a!]);expect((await context.request.get(dev.origin+'/api/employee')).status()).toBe(200);
 await dev.db.pool.query('DELETE FROM session');await page.goto(dev.origin+'/employee');await expect(page.getByRole('heading',{name:'Sign in',exact:true})).toBeVisible();
 await page.goto(other.origin+'/employee');await expect(page.getByRole('heading',{name:'Your HR'})).toBeVisible();
});
