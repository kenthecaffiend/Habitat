import {expectRejected} from './outcomes';
import assert from 'node:assert/strict';
import {isolated,previewSyntheticImage,IMAGE} from './runner';
// Probe controls BEFORE invoking a decoder. No external endpoint receives data.
const probe=isolated(['-I','-c',`import os,socket,json
assert os.getuid()==65532
s=open('/proc/self/status').read()
assert 'NoNewPrivs:\\t1' in s
assert 'Seccomp:\\t2' in s
assert 'CapEff:\\t0000000000000000' in s
try: open('/opt/forbidden','w'); raise AssertionError('writable root')
except OSError: pass
assert not os.path.exists('/var/run/docker.sock')
assert not os.path.exists('/Users')
assert len(open('/proc/net/route').read().strip().splitlines())==1
for _,name in socket.if_nameindex():
 if name!='lo': assert open('/sys/class/net/'+name+'/operstate').read().strip()=='down'
x=socket.socket();x.settimeout(0.2)
try: x.connect(('192.0.2.1',80)); raise AssertionError('network allowed')
except OSError: pass
print('isolation probe passed')`]);
assert.match(probe.toString(),/isolation probe passed/);console.log('PASS nonroot/read-only/no-new-privileges/no capabilities/no host or socket mount/no network; Docker limits inspected');
const fixture=(fmt:string)=>isolated(['-I','-c',`from PIL import Image,PngImagePlugin
import io,sys
im=Image.new('RGB',(2000,1000),'blue');out=io.BytesIO()
meta=PngImagePlugin.PngInfo();meta.add_text('private','synthetic-secret')
im.save(out,format='${fmt}',**({'pnginfo':meta} if '${fmt}'=='PNG' else {}));sys.stdout.buffer.write(out.getvalue())`]);
for(const fmt of ['PNG','JPEG']){const original=fixture(fmt),copy=Buffer.from(original),r=previewSyntheticImage(original,fmt==='PNG'?'image/png':'image/jpeg',true);assert.equal(r.bytes.readUInt32BE(16),1600);assert.equal(r.bytes.readUInt32BE(20),800);assert(!r.bytes.includes(Buffer.from('synthetic-secret')));assert.deepEqual(original,copy);assert.equal(r.uploadsEnabled,false);console.log('PASS '+fmt+' bounded normalized preview, metadata stripped, original unchanged');}
const png=fixture('PNG');expectRejected(()=>previewSyntheticImage(png,'image/jpeg',true),'input');expectRejected(()=>previewSyntheticImage(Buffer.alloc(20*1024*1024+1),'image/png',true),'input');expectRejected(()=>previewSyntheticImage(png.subarray(0,35),'image/png',true),'decoder');
expectRejected(()=>isolated(null,Buffer.from('%PDF-1.7 unsupported')),'decoder');expectRejected(()=>isolated(['-I','-c','import time;time.sleep(5)'],Buffer.alloc(0),100),'timeout');
const bomb=isolated(['-I','-c',"from PIL import Image;import sys;Image.new('1',(4000,4000)).save(sys.stdout.buffer,format='PNG')"]);expectRejected(()=>previewSyntheticImage(bomb,'image/png',true),'decoder');
console.log('PASS forged MIME/oversize/truncated/PDF/pixel-limit rejection and timeout cleanup');console.log('IMAGE '+IMAGE);
const animated=isolated(['-I','-c',"from PIL import Image;import sys;a=Image.new('RGB',(2,2),'red');b=Image.new('RGB',(2,2),'blue');a.save(sys.stdout.buffer,format='PNG',save_all=True,append_images=[b],duration=100,loop=0)"]);expectRejected(()=>previewSyntheticImage(animated,'image/png',true),'decoder');console.log('PASS multi-frame PNG rejected');
