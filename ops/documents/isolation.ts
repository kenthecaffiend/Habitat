export function isolationArgs(name:string):string[]{
 if(!/^hr-preview-[a-z0-9-]+$/.test(name))throw Error('Invalid private container name');
 return ['--name',name,'--network','none','--user','65532:65532','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','256m','--memory-swap','256m','--cpus','1','--pids-limit','32','--ulimit','nofile=64:64','--label','com.centurylinklabs.watchtower.enable=false','--log-driver','none'];
}
