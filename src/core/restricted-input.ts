// Minimized actual-data pilot: reject identifier-shaped and explicitly labelled restricted content.
// This is not an identifier parser or a bank-account detection service.
export function containsRestrictedContent(value:unknown):boolean{if(typeof value==='string')return /(?:^|[^A-Za-z0-9])[STFGM]\d{7}[A-Z](?:$|[^A-Za-z0-9])/i.test(value)||/(?:bank\s*account|account\s*(?:number|no\.?)[\s:]*\d|national\s*id|passport|\bnric\b|\bfin\s*[:#])/i.test(value);return value!==null&&typeof value==='object'&&Object.values(value).some(containsRestrictedContent);}
