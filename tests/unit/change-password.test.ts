import {afterEach,expect,it,vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ChangePassword,{validatePasswordChange,passwordChangeMessage} from '../../src/app/employee/profile/change-password';
afterEach(()=>vi.unstubAllGlobals());
it('validates confirmation and length without trimming password characters',()=>{
 expect(validatePasswordChange('old password','','')).toBe('Enter a non-empty new password of up to 128 characters.');
 expect(validatePasswordChange('old password','a'.repeat(129),'a'.repeat(129))).toBeTruthy();
 expect(validatePasswordChange('old password','a'.repeat(12),'different')).toBe('The new passwords do not match.');
 expect(validatePasswordChange('','a'.repeat(12),'a'.repeat(12))).toBe('Enter your current password.');
 expect(validatePasswordChange('old password',' 1234567890 ',' 1234567890 ')).toBe('');
});
it('renders password manager fields and a disabled capability by default',()=>{
 const disabled=renderToStaticMarkup(createElement(ChangePassword,{}));
 expect(disabled).toContain('Password changes are currently unavailable.');expect(disabled).not.toContain('type="password"');
 const enabled=renderToStaticMarkup(createElement(ChangePassword,{enabled:true}));
 expect(enabled).toContain('autoComplete="current-password"');expect(enabled.match(/autoComplete="new-password"/g)).toHaveLength(2);
 expect(enabled).toContain('role="alert"');expect(enabled).toContain('maxLength="128"');expect(enabled).toContain('Other sessions will be signed out.');
});
it('maps provider errors to safe actionable errors without echoing provider text',()=>{
 expect(passwordChangeMessage(400,'INVALID_PASSWORD')).toBe('Your current password is incorrect.');
 expect(passwordChangeMessage(429,'ANY')).toContain('Too many attempts');
 expect(passwordChangeMessage(401,'ANY')).toContain('Sign in again');
 expect(passwordChangeMessage(500,'password-secret')).not.toContain('password-secret');
});
