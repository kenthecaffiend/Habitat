import {it,expect} from 'vitest';
import {expectRejected,PreviewRejected} from '../../ops/documents/outcomes';
it.each(['creation','inspection','cleanup'])('stops on %s failure during a negative case',stage=>{let continued=false;expect(()=>{expectRejected(()=>{throw Error(stage+' unconfirmed');},'decoder');continued=true;}).toThrow(stage);expect(continued).toBe(false);});
it('accepts only the expected processing refusal kind',()=>{expect(()=>expectRejected(()=>{throw new PreviewRejected('timeout','timeout');},'decoder')).toThrow();expect(()=>expectRejected(()=>{throw new PreviewRejected('decoder','rejected');},'decoder')).not.toThrow();});
