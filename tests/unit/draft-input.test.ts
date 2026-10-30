import {it,expect} from 'vitest';import {parseDraftSGD} from '../../src/modules/payroll/draft-input';
it('accepts an explicitly supplied zero without treating unknown amounts as zero',()=>{expect(parseDraftSGD('0')).toBe(0);expect(parseDraftSGD('0.00')).toBe(0);expect(parseDraftSGD('4000')).toBe(400000);for(const v of ['', ' ', '-1','abc'])expect(()=>parseDraftSGD(v)).toThrow();});
