import {it,expect} from 'vitest';
import {paySettingsInput,previousPayrollMonth} from '../../src/modules/payroll/settings-input';
const form=()=>{const f=new FormData();for(const [k,v]of Object.entries({effective:'2026-10',dob:'1990-01-13',citizenship:'citizen',salary:'4000.00',fundDecision:'selected',fund:'CDAC',through:'2026-10',ow:'4000',aw:'0',projection:'48000'}))f.set(k,v);return f;};
it('ordinary salary setup excludes unselected optional history without inventing totals',()=>{expect(paySettingsInput(form(),'fictional-employee').opening).toBeNull();});
it('bonus history requires a real prior cutoff without shifting wages or dates',()=>{const f=form();f.set('useOpening','on');expect(()=>paySettingsInput(f,'fictional-employee')).toThrow('before');f.set('through','2026-09');expect(paySettingsInput(f,'fictional-employee').opening).toEqual({throughMonth:'2026-09',owCents:400000,awCents:0,projectedOwCents:4800000});f.set('ow','');expect(()=>paySettingsInput(f,'fictional-employee')).toThrow();});
it('shows previous month limit and keeps year-start history empty',()=>{expect(previousPayrollMonth('2026-10')).toBe('2026-09');expect(previousPayrollMonth('2026-01')).toBe('');});
