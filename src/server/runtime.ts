import {readActualDraftConfigFiles} from './actual-config';
import {Pool} from 'pg';import {readConfig} from './config';import {readLockedProductionConfigFiles} from './production-config';import {createApplication} from './application';
import {readSyntheticPreviewConfigFiles} from './preview-config';
let runtime:ReturnType<typeof createApplication>|undefined;
export function getApplication(){if(!runtime){const config=process.env.HR_ACTUAL_DATA_TEST==='enabled'?readActualDraftConfigFiles():process.env.HR_PRODUCTION_PROFILE==='locked'?readLockedProductionConfigFiles():process.env.HR_SYNTHETIC_PREVIEW==='enabled'?readSyntheticPreviewConfigFiles():readConfig(process.env);const pool=new Pool({connectionString:config.databaseUrl,max:2,connectionTimeoutMillis:3000,statement_timeout:5000});runtime=createApplication(pool,config).catch(async error=>{runtime=undefined;await pool.end();throw error;});}return runtime;}
