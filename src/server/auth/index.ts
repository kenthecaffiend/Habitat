import {actualLoginAllowed} from './actual-access';
import {betterAuth} from 'better-auth';import {drizzleAdapter} from '@better-auth/drizzle-adapter';import {drizzle} from 'drizzle-orm/node-postgres';import {hash,verify} from '@node-rs/argon2';import type {Pool} from 'pg';import type {Config} from '../config';import * as schema from '../db/schema';
export const hashPassword=(password:string)=>hash(password,{algorithm:2,memoryCost:19456,timeCost:2,parallelism:1});
export function createAuth(pool:Pool,config:Config){return betterAuth({
 baseURL:config.origin,secret:config.secret,database:drizzleAdapter(drizzle(pool,{schema}),{provider:'pg',schema,transaction:true}),
 trustedOrigins:[config.origin],emailAndPassword:{enabled:true,disableSignUp:true,minPasswordLength:1,maxPasswordLength:128,password:{hash:hashPassword,verify:({hash:encoded,password})=>verify(encoded,password)}},
 session:{cookieCache:{enabled:false},expiresIn:3600},
 rateLimit:{enabled:true,storage:'database',window:60,max:60,customRules:{'/sign-in/email':{window:60,max:5},'/change-password':{window:60,max:5}}},
 advanced:{cookiePrefix:config.cookiePrefix,useSecureCookies:config.secureCookies,defaultCookieAttributes:{httpOnly:true,sameSite:'strict'},ipAddress:{ipAddressHeaders:[]}},
 logger:{disabled:true},onAPIError:config.environment==='actual-test'?{throw:true}:undefined
 ,databaseHooks:{session:{create:{before:async session=>{const e=(await pool.query('SELECT e.active,u.email FROM employee e JOIN \"user\" u ON u.id=e.user_id WHERE e.user_id=$1',[session.userId])).rows[0];if(config.environment==='actual-test'&&!await actualLoginAllowed(pool,config,session.userId))return false;return e&&!e.active?false:{data:session};}}}}
});}
