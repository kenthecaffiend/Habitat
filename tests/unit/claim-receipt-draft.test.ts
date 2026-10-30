import {it,expect} from 'vitest';
import {claimReceiptIds} from '../../src/modules/claims/receipt-draft';
it('retains existing receipts and adds uploaded replacements in an edit payload',()=>{
 expect(claimReceiptIds(['retained'],[{id:'replacement'}])).toEqual(['retained','replacement']);
 expect(claimReceiptIds([],[{id:'replacement'}])).toEqual(['replacement']);
 expect(claimReceiptIds(['retained'],[])).toEqual(['retained']);
});
it('blocks empty, incomplete and excessive receipt drafts before saving',()=>{
 expect(claimReceiptIds([],[])).toBeNull();
 expect(claimReceiptIds(['retained'],[{}])).toBeNull();
 expect(claimReceiptIds(['a','b','c','d','e'],[{id:'f'}])).toBeNull();
});
