import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {homedir} from 'node:os';
const root=process.argv[2],release=process.argv[3];
if(!root.endsWith('/AI-Server/hr/prod')||!release.startsWith(root+'/releases/'))throw Error('PATH');
const plist=join(homedir(),'Library/LaunchAgents/works.stratosphere.hr-renderer.plist');if(existsSync(plist))throw Error('EXISTING_AGENT');
function x(s){return s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');}
const args=['/opt/homebrew/opt/node@24/bin/node',release+'/ops/deploy/renderer.mjs'];
const env={PATH:'/Applications/Docker.app/Contents/Resources/bin:/opt/homebrew/bin:/usr/bin:/bin',HR_RENDER_TOKEN_FILE:root+'/secrets/renderer',HR_RENDER_STATE:root+'/state'};
writeFileSync(plist,'<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>works.stratosphere.hr-renderer</string><key>ProgramArguments</key><array>'+args.map(a=>'<string>'+x(a)+'</string>').join('')+'</array><key>EnvironmentVariables</key><dict>'+Object.entries(env).map(([k,v])=>'<key>'+k+'</key><string>'+x(v)+'</string>').join('')+'</dict><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>10</integer><key>Umask</key><integer>63</integer><key>StandardOutPath</key><string>'+x(root+'/logs/renderer.log')+'</string><key>StandardErrorPath</key><string>'+x(root+'/logs/renderer-error.log')+'</string></dict></plist>',{mode:0o600,flag:'wx'});
console.log('HR renderer supervisor definition prepared; no secret values embedded.');
