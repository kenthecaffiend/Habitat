import {it,expect} from 'vitest';
import {expectRejectedAsync,PreviewRejected} from '../../ops/documents/outcomes';

it.each(['container creation','container inspection','container cleanup'])('async refusal assertion propagates %s failure',async(stage)=>{
 const failure=new Error(stage+' failed');
 await expect(expectRejectedAsync(async()=>{await Promise.resolve();throw failure;},'decoder')).rejects.toBe(failure);
});
it('accepts only an actual decoder refusal',async()=>{
 await expect(expectRejectedAsync(async()=>{await Promise.resolve();throw new PreviewRejected('decoder','Malformed image');},'decoder')).resolves.toBeUndefined();
});
it.each(['input','timeout','output'] as const)('propagates wrong rejection kind %s',async(kind)=>{
 const failure=new PreviewRejected(kind,'Not a decoder refusal');
 await expect(expectRejectedAsync(async()=>{throw failure;},'decoder')).rejects.toBe(failure);
});
it('fails if the operation succeeds',async()=>{
 await expect(expectRejectedAsync(async()=>42,'decoder')).rejects.toThrow();
});
