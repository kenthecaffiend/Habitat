import {it,expect} from 'vitest';
import {isolationArgs} from '../../ops/documents/isolation';
it('processing has no network or mounts, nonroot read-only and bounded resources',()=>{
 const a=isolationArgs('hr-preview-test');
 for(const pair of [['--network','none'],['--user','65532:65532'],['--cap-drop','ALL'],['--security-opt','no-new-privileges'],['--memory','256m'],['--memory-swap','256m'],['--cpus','1'],['--pids-limit','32'],['--label','com.centurylinklabs.watchtower.enable=false']])expect(a).toEqual(expect.arrayContaining(pair));
 expect(a).toContain('--read-only');expect(a.some(x=>/privileged|unconfined|--volume|--mount|--publish/.test(x))).toBe(false);
});
