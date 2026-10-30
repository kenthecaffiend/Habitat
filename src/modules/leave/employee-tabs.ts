export function employeeTabFocus(key:string,index:number,count:number):number|null{
 if(count<1)return null;
 if(key==='Home')return 0;if(key==='End')return count-1;
 if(key==='ArrowRight')return (index+1)%count;if(key==='ArrowLeft')return (index-1+count)%count;
 return null;
}
export function employeeTabChange(current:string,next:string,dirty:boolean,busy:boolean){return current===next?'stay':busy?'wait':dirty?'confirm':'switch';}
