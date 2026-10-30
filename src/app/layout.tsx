import type {ReactNode} from 'react';import AppShell from '@/components/app-shell';import './globals.css';
export const dynamic='force-dynamic';
export const metadata={title:"Habitat by Stratosphere",description:"Private workspace for payroll, leave and claims",icons:{icon:[{url:"/api/branding/favicon?size=32&v=3",sizes:"32x32",type:"image/png"},{url:"/api/branding/favicon?size=64&v=3",sizes:"64x64",type:"image/png"}],apple:[{url:"/api/branding/favicon?size=180&v=3",sizes:"180x180",type:"image/png"}]}};
export default function Layout({children}:{children:ReactNode}){return <html lang="en" suppressHydrationWarning><body><AppShell actualDraftOnly={process.env.HR_ACTUAL_DATA_TEST==='enabled'}>{children}</AppShell></body></html>;}
