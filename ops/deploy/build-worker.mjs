import {build} from 'esbuild';
await build({entryPoints:['ops/deploy/runner-entry.ts'],outfile:'ops/deploy/dist/runner.mjs',bundle:true,platform:'node',format:'esm',target:'node24',logLevel:'error'});
