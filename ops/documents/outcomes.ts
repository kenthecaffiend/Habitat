export class PreviewRejected extends Error {constructor(public kind:'input'|'decoder'|'timeout'|'output',message:string){super(message);}}
export function expectRejected(action:()=>unknown,kind:PreviewRejected['kind']){try{action();}catch(error){if(error instanceof PreviewRejected&&error.kind===kind)return;throw error;}throw Error('Expected refusal: '+kind);}

export async function expectRejectedAsync(action:()=>Promise<unknown>,kind:PreviewRejected['kind']){try{await action();}catch(error){if(error instanceof PreviewRejected&&error.kind===kind)return;throw error;}throw Error('Expected refusal: '+kind);}
