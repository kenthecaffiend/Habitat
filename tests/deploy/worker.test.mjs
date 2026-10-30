import {test} from 'node:test';import assert from 'node:assert/strict';import {layoutAllowed} from '../../ops/deploy/worker-policy.mjs';
const v={syntheticOnly:true,templateId:'fixed-a4-v6',snapshotId:'synthetic',snapshotHash:'a'.repeat(64),version:1,sections:[]};
test('renderer permits only bounded synthetic fixed-layout jobs, no command/image/path knobs',()=>{assert.ok(layoutAllowed(v));for(const p of [{...v,command:['sh']},{...v,image:'other'},{...v,syntheticOnly:false},{...v,templateId:'other'},{...v,path:'/private'}])assert.ok(!layoutAllowed(p));});
