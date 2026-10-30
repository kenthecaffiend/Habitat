// Generate one transaction for the fresh empty staging database. Password never logged.
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
const root=process.argv[2],password=readFileSync(join(root,'secrets/app_db'),'utf8').trim();
if(!/^[a-f0-9]{96}$/.test(password))throw Error('SECRET');
const files=readdirSync('db/migrations').filter(x=>/^\d{4}.*\.sql$/.test(x)&&Number(x.slice(0,4))<=17).sort();if(files.length!==17||files.some((f,i)=>Number(f.slice(0,4))!==i+1))throw Error('MIGRATION_COUNT');
let sql="\\set ON_ERROR_STOP on\nBEGIN;\nDO $$ BEGIN IF EXISTS(SELECT FROM pg_tables WHERE schemaname='public') THEN RAISE EXCEPTION 'Nonempty target refused'; END IF; END $$;\nCREATE TABLE environment_identity(id integer PRIMARY KEY CHECK(id=1),environment text NOT NULL);\nINSERT INTO environment_identity VALUES(1,'prod');\nCREATE TABLE schema_migration(version integer PRIMARY KEY);\n";
for(const [i,f]of files.entries())sql+=readFileSync(join('db/migrations',f),'utf8')+'\nINSERT INTO schema_migration VALUES('+(i+1)+');\n';
sql+="CREATE ROLE hr_app LOGIN PASSWORD '"+password+"';\nREVOKE ALL ON SCHEMA public FROM PUBLIC;\nGRANT CONNECT ON DATABASE hr_prod TO hr_app;\nGRANT USAGE ON SCHEMA public TO hr_app;\nGRANT SELECT ON environment_identity,schema_migration TO hr_app;\nGRANT SELECT(id) ON employee TO hr_app;\nCOMMIT;\n";
sql=sql.replace('REVOKE ALL ON SCHEMA public FROM PUBLIC;', 'REVOKE ALL ON SCHEMA public FROM PUBLIC;\nREVOKE TEMPORARY ON DATABASE hr_prod FROM PUBLIC;\nALTER ROLE hr_app SET default_transaction_read_only = on;');
process.stdout.write(sql);
