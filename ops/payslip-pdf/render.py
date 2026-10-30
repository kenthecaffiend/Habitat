import sys,json,io,os,re,hashlib,base64
from PIL import Image as PILImage
PILImage.MAX_IMAGE_PIXELS=768*384
from xml.sax.saxutils import escape
import reportlab
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Table,TableStyle,KeepTogether,HRFlowable,Image
from reportlab.pdfgen.canvas import Canvas
LIMIT=131072
TITLES={'Statement','Earnings','Employee deductions','Payment summary','Payment history (synthetic)','Payment history','Employer costs (not deductions)','Correction lineage'}
font=os.path.join(os.path.dirname(reportlab.__file__),'fonts','Vera.ttf')
pdfmetrics.registerFont(TTFont('FixedVera',font))
bold_font=os.path.join(os.path.dirname(reportlab.__file__),'fonts','VeraBd.ttf')
pdfmetrics.registerFont(TTFont('FixedVeraBold',bold_font))
font_hash=hashlib.sha256(open(font,'rb').read()+open(bold_font,'rb').read()).hexdigest()
def string(s,n=1000):
 if not isinstance(s,str) or not 0<len(s)<=n or any(ord(c)<32 or ord(c) not in pdfmetrics.getFont('FixedVera').face.charToGlyph for c in s):raise ValueError('Unsupported text or glyph')
 return s
def render(d):
 if not isinstance(d,dict) or set(d) not in ({'syntheticOnly','templateId','snapshotId','version','snapshotHash','sections'},{'syntheticOnly','templateId','snapshotId','version','snapshotHash','sections','logo'}) or not ((d['syntheticOnly'] is True and d['templateId']=='fixed-a4-v6') or (d['syntheticOnly'] is False and d['templateId']=='fixed-a4-v8')) or type(d['version'])!=int or not 1<=d['version']<=1000000:raise ValueError('Schema')
 issued=d['templateId']=='fixed-a4-v8'
 string(d['snapshotId'],100)
 if not isinstance(d['snapshotHash'],str) or not re.fullmatch('[a-f0-9]{64}',d['snapshotHash']):raise ValueError('Hash')
 if not isinstance(d['sections'],list) or not 1<=len(d['sections'])<=7:raise ValueError('Sections')
 for s in d['sections']:
  if not isinstance(s,dict) or set(s)!={'title','rows'} or s['title'] not in TITLES or not isinstance(s['rows'],list) or len(s['rows'])>40:raise ValueError('Section')
  for row in s['rows']:
   if not isinstance(row,dict) or set(row)!={'label','value'}:raise ValueError('Row')
   string(row['label'],100);string(row['value'])
 ink=colors.HexColor('#18252e');muted=colors.HexColor('#58636c');navy=colors.HexColor('#17354a');teal=colors.HexColor('#176b70');line=colors.HexColor('#a9bec4')
 body=ParagraphStyle('body',fontName='FixedVera',fontSize=9,leading=12,textColor=ink,splitLongWords=True)
 small=ParagraphStyle('small',parent=body,fontSize=7,leading=10,textColor=muted)
 amount=ParagraphStyle('amount',parent=body,alignment=2)
 subtotal=ParagraphStyle('subtotal',parent=body,fontName='FixedVeraBold',textColor=navy)
 subtotal_amount=ParagraphStyle('subtotal_amount',parent=subtotal,alignment=2)
 total=ParagraphStyle('total',parent=subtotal_amount,fontSize=14,leading=18,textColor=teal)
 netlabel=ParagraphStyle('netlabel',parent=subtotal,fontSize=10,leading=14)
 heading=ParagraphStyle('heading',parent=body,fontSize=10,leading=14,spaceBefore=8,spaceAfter=3,keepWithNext=True,textColor=navy)
 p=lambda v,style=body:Paragraph(escape(v),style)
 statement=next((s for s in d['sections'] if s['title']=='Statement'),None)
 if statement is None:raise ValueError('Statement required')
 employer=next((r['value'] for r in statement['rows'] if r['label']=='Employer'),'Employer')
 logo=p('LOGO SPACE',small)
 if 'logo' in d:
  a=d['logo']
  if not isinstance(a,dict) or set(a)!={'sha256','pngBase64','width','height'} or type(a['width'])!=int or type(a['height'])!=int or not 1<=a['width']<=768 or not 1<=a['height']<=384:raise ValueError('Logo')
  raw=base64.b64decode(a['pngBase64'],validate=True)
  if not 0<len(raw)<=49152 or hashlib.sha256(raw).hexdigest()!=a['sha256']:raise ValueError('Logo integrity')
  im=PILImage.open(io.BytesIO(raw))
  if im.format!='PNG' or im.size!=(a['width'],a['height']) or getattr(im,'n_frames',1)!=1:raise ValueError('Logo format')
  im.verify()
  scale=min(80/a['width'],44/a['height'])
  logo=Image(io.BytesIO(raw),width=a['width']*scale,height=a['height']*scale)
 brand=Table([[logo,[p('Employer',small),p(employer,ParagraphStyle('brand',parent=body,fontSize=15,leading=20,textColor=navy))]]],colWidths=[92,419])
 brand.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'MIDDLE'),('LEFTPADDING',(1,0),(1,0),16),('TOPPADDING',(0,0),(-1,-1),10),('BOTTOMPADDING',(0,0),(-1,-1),10)]))
 story=[brand,Spacer(1,8),p('ITEMISED PAYSLIP')]+([] if issued else [p('SYNTHETIC SAMPLE - NOT ISSUED',small)])+[Spacer(1,8)]
 footer_story=([Spacer(1,2),p('Employer contributions are separate from employee deductions.',small)] if issued else [Spacer(1,2),p('Reference '+d['snapshotId']+' / version '+str(d['version']),small),p('Synthetic preview - not issued. Employer costs are not employee deductions.',small)])
 for section in d['sections']:
  fields={r['label']:r['value'] for r in section['rows']}
  if section['title']=='Statement' and len(section['rows'])==5 and set(fields)=={'Employer','Employee','Salary period','Contribution month','Actual payment date(s)'}:
   # Compact only the known contract; any other fields retain the generic path below.
   cells=[]
   for left,right in [('Employee','Salary period'),('Contribution month','Actual payment date(s)')]:
    cells.append([[p(left,small),p(fields[left])],[p(right,small),p(fields[right])]])
   identity=Table(cells,colWidths=[255.5,255.5],hAlign='LEFT')
   identity.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),12),('TOPPADDING',(0,0),(-1,-1),3),('BOTTOMPADDING',(0,0),(-1,-1),8),('LINEBELOW',(0,-1),(-1,-1),.6,teal)]))
   story.append(identity)
   continue
  divider=HRFlowable(width='100%',thickness=.6,color=teal,spaceAfter=4)
  divider.keepWithNext=True
  section_story=[p(section['title'].upper(),heading),divider]
  for row in section['rows']:
   highlight=row['label']=='Net salary paid'
   is_subtotal=row['label'] in {'Gross earnings','Total deductions','Total cash paid'}
   # Values come from the reviewed snapshot. The renderer never calculates pay.
   t=Table([[p(row['label'],netlabel if highlight else subtotal if is_subtotal else body),p(row['value'],total if highlight else subtotal_amount if is_subtotal else amount)]],colWidths=[265,246],hAlign='LEFT')
   styles=[('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),3),('BOTTOMPADDING',(0,0),(-1,-1),3)]
   if highlight:styles.extend([('LINEABOVE',(0,0),(-1,-1),1,teal),('LINEBELOW',(0,0),(-1,-1),1,teal),('LINEBEFORE',(0,0),(0,0),3,teal),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8)])
   if is_subtotal:styles.extend([('LINEABOVE',(0,0),(-1,-1),.7,teal),('TOPPADDING',(0,0),(-1,-1),5)])
   t.setStyle(TableStyle(styles));section_story.append(t)
  # Keep the bounded correction lineage intact when it moves to another page.
  if section['title']=='Correction lineage':section_story.extend(footer_story)
  story.extend([KeepTogether(section_story)] if section['title']=='Correction lineage' else section_story)
 if not any(s['title']=='Correction lineage' for s in d['sections']):story.append(KeepTogether(footer_story))
 out=io.BytesIO()
 def footer(c,doc):
  if doc.page>8:raise ValueError('Page bound')
  c.setFont('FixedVera',8);c.drawString(42,25,'' if issued else 'SYNTHETIC - NOT ISSUED');c.drawRightString(A4[0]-42,25,'Page '+str(doc.page))
 audit='Template: '+d['templateId']+'; Snapshot SHA256: '+d['snapshotHash']+'; Font SHA256: '+font_hash
 SimpleDocTemplate(out,pagesize=A4,leftMargin=42,rightMargin=42,topMargin=36,bottomMargin=42,title='Itemised payslip' if issued else 'Synthetic payslip preview',author='Habitat' if issued else 'Synthetic HR development',subject=audit).build(story,onFirstPage=footer,onLaterPages=footer,canvasmaker=lambda *a,**k:Canvas(*a,**{**k,'invariant':1}))
 result=out.getvalue()
 if len(result)>262144:raise ValueError('Output bound')
 return result
if __name__=='__main__':
 try:
  raw=sys.stdin.buffer.read(LIMIT+1)
  if len(raw)>LIMIT:raise ValueError('Input bound')
  data=json.loads(raw)
  sys.stdout.buffer.write(render(data))
 except ValueError:
  sys.stderr.write('Invalid bounded layout or unsupported glyph\n');sys.exit(2)
