import{it,expect}from'vitest';import{roleLanding,showViewSwitch}from'../../src/core/role-navigation';
it('uses authenticated role rather than workspace mode or any stale callback',()=>{expect(roleLanding('employee')).toBe('/employee');expect(roleLanding('admin')).toBe('/admin');expect(roleLanding(null)).toBe('/login');});
it('only administrators have a view switch',()=>{expect(showViewSwitch('employee')).toBe(false);expect(showViewSwitch(null)).toBe(false);expect(showViewSwitch('admin')).toBe(true);});
