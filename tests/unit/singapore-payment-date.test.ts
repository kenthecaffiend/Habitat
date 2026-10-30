import {it,expect} from 'vitest';import {singaporeDate} from '../../src/modules/payroll/service';
it('payment confirmation today follows Singapore midnight instead of UTC or host timezone',()=>{expect(singaporeDate(new Date('2026-10-23T15:59:59Z'))).toBe('2026-10-23');expect(singaporeDate(new Date('2026-10-23T16:00:00Z'))).toBe('2026-10-24');});
