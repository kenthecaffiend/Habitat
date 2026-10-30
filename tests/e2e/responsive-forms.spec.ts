import {test,expect} from '@playwright/test';
import {localApp} from '../helpers/local-app';

test('workflow fields adapt without losing labels, focus, validation or account controls',async({page})=>{
 test.setTimeout(120000);const app=await localApp('test');await page.emulateMedia({reducedMotion:'reduce'});
 try{
  await page.goto(app.origin+'/login');await page.getByLabel('Email').fill(app.email);await page.getByLabel('Password',{exact:true}).fill(app.password);await page.getByRole('button',{name:'Sign in'}).click();await expect(page.getByRole('heading',{name:'Your HR'})).toBeVisible();
  await page.goto(app.origin+'/admin/employees');const add=page.getByRole('form',{name:'Add employee'});await add.getByLabel('Name',{exact:true}).fill('Synthetic colleague with a longer display name');await add.getByLabel('Email',{exact:true}).fill('synthetic-long-email-colleague@example.invalid');await add.getByLabel('Initial password').fill('synthetic-layout-test-password');await add.getByLabel('Invented dev/test employee').check();await add.getByRole('button',{name:'Add employee',exact:true}).click();await expect(page.locator('.employee-grid>article')).toHaveCount(2);
  for(const width of [1440,900,390])for(const theme of ['light','dark']){
   await page.setViewportSize({width,height:900});await page.evaluate(t=>{localStorage.setItem('stratosphere-theme',t);document.documentElement.dataset.theme=t;},theme);
   for(const route of ['/admin/employees','/employee/leave','/employee/claims','/admin/leave','/admin/payroll','/admin/payslips','/admin/imports']){
    await page.goto(app.origin+route);await expect(page.locator('main h1')).toBeVisible();
    await page.locator('details').evaluateAll(nodes=>nodes.forEach(n=>(n as HTMLDetailsElement).open=true));
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),route+' page overflow').toBe(true);
    const overflow=await page.locator('.workflow-form input:not([type=checkbox]),.workflow-form select,.workflow-form textarea').evaluateAll(nodes=>nodes.filter(n=>{const r=n.getBoundingClientRect();return r.width>0&&(r.left<0||r.right>innerWidth+1||r.height<42);}).map(n=>n.outerHTML.slice(0,100)));
    expect(overflow,route+' fields remain visible and tappable').toEqual([]);
    if(route==='/admin/employees'){
     const form=page.getByRole('form',{name:'Add employee'}),name=form.getByLabel('Name',{exact:true}),email=form.getByLabel('Email',{exact:true});const a=(await name.boundingBox())!,b=(await email.boundingBox())!;
     if(width>700){expect(Math.abs(a.y-b.y)).toBeLessThan(2);expect(a.width).toBeLessThan((await form.boundingBox())!.width*.6);}else{expect(b.y).toBeGreaterThan(a.y+a.height);}
     const cards=await page.locator('.employee-grid>article').all();const first=(await cards[0].boundingBox())!,second=(await cards[1].boundingBox())!;if(width>1100){expect(Math.abs(first.y-second.y)).toBeLessThan(2);expect(Math.abs(first.width-second.width)).toBeLessThan(2);}else expect(second.y).toBeGreaterThan(first.y+first.height);
     await name.focus();await expect(name).toBeFocused();expect(await name.evaluate(n=>getComputedStyle(n).outlineStyle)).not.toBe('none');
     await form.getByRole('button',{name:'Add employee',exact:true}).click();expect(await name.evaluate(n=>(n as HTMLInputElement).validity.valueMissing)).toBe(true);
     await page.keyboard.press('Escape');await name.blur();await page.locator('details').evaluateAll(nodes=>nodes.forEach(n=>(n as HTMLDetailsElement).open=false));await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'test-results/forms-'+width+'-'+theme+'.png',fullPage:true});
    }
    if(['/employee/leave','/admin/payroll'].includes(route)&&width!==900){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'test-results/'+route.split('/').join('-')+'-'+width+'-'+theme+'.png',fullPage:true});}
   }
  }
  await expect(page.getByText('Good work starts with a little space.',{exact:true})).toHaveCount(0);await expect(page.locator('.mission-note')).toHaveCount(0);
  await page.locator('.view-link').click();await expect(page).toHaveURL(app.origin+'/employee');
  await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page).toHaveURL(app.origin+'/login');expect((await page.request.get(app.origin+'/api/employee')).status()).toBe(401);
 }finally{await app.stop();}
});
