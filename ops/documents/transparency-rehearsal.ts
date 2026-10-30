import assert from 'node:assert/strict';
import {isolated,previewSyntheticImage} from './runner';
for(const kind of ['palette','rgb-key']){
 const source=isolated(['-I','-c',`from PIL import Image
import sys
if '${kind}'=='palette':
 im=Image.new('P',(2,1),0);im.putpalette([0,0,0,0,0,0]+[0,0,0]*254);im.putpixel((1,0),1);im.save(sys.stdout.buffer,format='PNG',transparency=0)
else:
 im=Image.new('RGB',(2,1),(255,0,0));im.putpixel((1,0),(0,0,0));im.save(sys.stdout.buffer,format='PNG',transparency=(255,0,0))`]);
 const out=previewSyntheticImage(source,'image/png',true).bytes;
 const pixels=isolated(['-I','-c',"from PIL import Image;import sys,io,json;im=Image.open(io.BytesIO(sys.stdin.buffer.read()));print(json.dumps([im.getpixel((0,0)),im.getpixel((1,0))]))"],out);
 assert.deepEqual(JSON.parse(pixels.toString()),[[255,255,255],[0,0,0]]);console.log('PASS '+kind+' transparent background and opaque text');
}
