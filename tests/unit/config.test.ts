import {describe,it,expect} from 'vitest';
import {readConfig} from '../../src/server/config';
const base={APP_ENV:'dev',DATABASE_URL:'postgresql://hr:synthetic@127.0.0.1:55439/hr_dev',APP_ORIGIN:'http://127.0.0.1:3130',SESSION_SECRET:'synthetic-development-secret-which-is-long-enough',MAIL_TRANSPORT:'capture',STORAGE_ENV:'dev'};
describe('fail-closed environment config',()=>{
 it('rejects live mail transport before any connection',()=>expect(()=>readConfig({...base,MAIL_TRANSPORT:'smtp'})).toThrow());
 it('rejects production-labelled storage in dev',()=>expect(()=>readConfig({...base,STORAGE_ENV:'production'})).toThrow());
 it('rejects non-loopback database targets in the development slice',()=>expect(()=>readConfig({...base,DATABASE_URL:'postgresql://x:x@100.1.2.3/hr_prod'})).toThrow());
 it('rejects production startup in this checkpoint',()=>expect(()=>readConfig({...base,APP_ENV:'production'})).toThrow());
 it('rejects short session secrets',()=>expect(()=>readConfig({...base,SESSION_SECRET:'short'})).toThrow());
 it('returns distinct cookie prefixes for separate synthetic environments',()=>expect(readConfig(base).cookiePrefix).not.toBe(readConfig({...base,APP_ENV:'test',STORAGE_ENV:'test',DATABASE_URL:'postgresql://hr:x@127.0.0.1:55439/hr_test'}).cookiePrefix));
});
