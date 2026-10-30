/** Resolves only complete receipt drafts for the claim mutation payload. */
export function claimReceiptIds(retained:string[],uploaded:{id?:string}[]):string[]|null{
 const count=retained.length+uploaded.length;
 if(count<1||count>5||uploaded.some(file=>!file.id))return null;
 return [...retained,...uploaded.map(file=>file.id!)];
}
