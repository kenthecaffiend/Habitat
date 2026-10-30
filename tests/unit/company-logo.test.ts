import {it,expect,vi} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const route=vi.hoisted(()=>({path:'/login'}));
vi.mock('next/navigation',()=>({usePathname:()=>route.path}));
import AppShell from '../../src/components/app-shell';
it('renders the saved logo directly on the unauthenticated login page with a theme-only public URL',()=>{
 route.path='/login';const html=renderToStaticMarkup(React.createElement(AppShell,{children:'Login'}));expect(html).toContain('src="/api/branding/public-logo?theme=light"');expect(html).toContain('alt="Company logo"');expect(html).not.toContain('YOUR<br/>LOGO');
});
it('keeps signed-in branding private until authenticated metadata loads',()=>{
 route.path='/employee';const html=renderToStaticMarkup(React.createElement(AppShell,{children:'Workspace'}));expect(html).not.toContain('/public-logo');expect(html).toContain('Company logo placeholder');
});
