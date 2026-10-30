# Minimal synthetic PDF smoke probe; full isolation checks are in rehearse.ts.
import subprocess,json
args=['docker','run','--rm','--network','none','--user','65532:65532','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','256m','--memory-swap','256m','--cpus','1','--pids-limit','32','-i','sha256:3a7bf12ba9313c79712300c688cf8430486d8ee9b1b2abb1446d981d922e2780']
r=subprocess.run(args,input=json.dumps({'syntheticOnly':True,'templateId':'fixed-a4-v1','snapshotId':'synthetic','version':1,'snapshotHash':'a'*64,'sections':[{'title':'Statement','rows':[{'label':'Employee','value':'Synthetic Example'}]}]}).encode(),capture_output=True,timeout=20)
assert r.returncode==0 and r.stdout.startswith(b'%PDF-'), 'Expected PDF, got '+str(r.returncode)+': '+r.stderr.decode()
