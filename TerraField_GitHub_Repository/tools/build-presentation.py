from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pathlib import Path
from PIL import Image
from io import BytesIO
root=Path(__file__).resolve().parent.parent
prs=Presentation();prs.slide_width=Inches(13.333);prs.slide_height=Inches(7.5)
DARK=RGBColor(25,50,41); GREEN=RGBColor(34,82,58); MUTED=RGBColor(96,119,103); LIME=RGBColor(201,230,168); PAPER=RGBColor(246,248,243); WHITE=RGBColor(255,255,255)
def textbox(slide,x,y,w,h,text,size=20,color=DARK,bold=False,font='Aptos',align=None):
 sh=slide.shapes.add_textbox(Inches(x),Inches(y),Inches(w),Inches(h)); tf=sh.text_frame;tf.word_wrap=True;tf.margin_left=0;tf.margin_right=0
 for i,line in enumerate(text.split('\n')):
  p=tf.paragraphs[0] if not i else tf.add_paragraph();p.text=line;p.font.name=font;p.font.size=Pt(size);p.font.bold=bold;p.font.color.rgb=color;p.space_after=Pt(12)
  if align is not None:p.alignment=align
 return sh
def rect(slide,x,y,w,h,fill=WHITE,rad=False):
 sh=slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE if rad else MSO_SHAPE.RECTANGLE, Inches(x),Inches(y),Inches(w),Inches(h));sh.fill.solid();sh.fill.fore_color.rgb=fill;sh.line.fill.background();return sh
def slide(title,tag='TERRAFIELD  /  HACK-P302'):
 s=prs.slides.add_slide(prs.slide_layouts[6]);s.background.fill.solid();s.background.fill.fore_color.rgb=PAPER
 textbox(s,.65,.35,11,.3,tag,10,GREEN,True);textbox(s,.65,.78,12,0.65,title,29,DARK,True)
 rect(s,.65,1.54,12,.025,LIME);textbox(s,.65,7.14,11,.2,'TERRAFIELD  •  STUDENT PROTOTYPE  •  ADVISORY ONLY',9,MUTED)
 textbox(s,12.15,7.14,.5,.2,f'{len(prs.slides):02}',9,MUTED,align=PP_ALIGN.RIGHT)
 return s
def bullets(s,items,x=.9,y=1.9,w=11.5,size=20):
 for i,t in enumerate(items):
  rect(s,x,y+i*.78,.09,.09,GREEN,True);textbox(s,x+.3,y+i*.78,w-.3,.7,t,size,DARK)
def card(s,x,y,w,h,title,body):
 rect(s,x,y,w,h,WHITE,True);textbox(s,x+.24,y+.22,w-.48,.45,title,16,GREEN,True);textbox(s,x+.24,y+.75,w-.48,h-.8,body,15,DARK)
s=slide('Better decisions start from the ground up.');textbox(s,.9,2.05,6,1.0,'Crop planning with transparent screening.',26,GREEN,True);textbox(s,.9,3.25,5.6,1.3,'HACK-P302  •  Crop Recommendation System\nTeam, roll numbers and contributions: to be supplied',16,MUTED);s.shapes.add_picture(str(root/'client/assets/field-hero.jpg'),Inches(7.4),Inches(1.9),width=Inches(5.15),height=Inches(3.9))
s=slide('The problem');bullets(s,['Crop choices depend on field conditions and local context.','Users need a way to compare options and understand the reasons.','A screening tool cannot guarantee yield, profit or suitability.','Field measurements and local expert advice remain essential.'])
s=slide('Our approach');card(s,.8,1.95,3.8,3.3,'01  FIELD PROFILE','Enter soil texture, pH, annual rainfall, growing-season temperature and season.');card(s,4.76,1.95,3.8,3.3,'02  SCREEN','The backend evaluates 21 crop profiles using documented, inspectable rules.');card(s,8.72,1.95,3.8,3.3,'03  EXPLORE','Review explanations, compare two crops, and save a historical report.')
s=slide('What works locally');bullets(s,['Inline and server validation; clearly labelled synthetic examples.','Rankings, factor explanations, comparison and print-friendly output.','SQLite-backed reports: save, reopen, rename and delete.','Plant reference library and dated soil snapshots; optional online data.','Browser-held workspace key is not an account or production authentication.'],size=19)
s=slide('Architecture & stack');card(s,.85,2.0,3.65,2.5,'FRONTEND','Existing HTML, CSS and vanilla JavaScript\nSame-origin API requests');card(s,4.83,2.0,3.65,2.5,'BACKEND','Node 24 HTTP API\nValidation and scoring engine');card(s,8.82,2.0,3.65,2.5,'PERSISTENCE','SQLite reports and soil cache\nReference data in versioned files');textbox(s,1.0,5.15,11.5,.8,'User → frontend → REST API → validation / scoring → SQLite → response',19,GREEN,True)
s=slide('The screening index');bullets(s,['pH 30 + temperature 25 + annual rainfall 25; texture 10; humidity and season 5 each.','Within optimal range: 100; declines toward absolute boundaries; outside: 0.','Outside an absolute range caps the overall index at 50.','Unknown optional factors are excluded; remaining weights are renormalized.','Humidity / season and weights are prototype heuristics. N, P and K are not scored.'],size=18);textbox(s,1,6.05,11,.5,'Index ≠ probability. Not the FAO ECOCROP model.',18,GREEN,True)
s=slide('Database & API');card(s,.85,1.95,5.65,3.7,'SQLite','reports: owner hash, title, input and result snapshots, timestamps\nsoil_cache: lookup key, JSON, expiry\nHistorical results remain understandable after source changes.');card(s,6.8,1.95,5.65,3.7,'Key REST endpoints','GET /api/health, /api/crops\nPOST /api/recommendations\nGET / POST /api/reports\nGET / PATCH / DELETE /api/reports/{id}\nExternal soil, weather and location routes')
s=slide('Application evidence');s.shapes.add_picture(str(root/'screenshots/01-analysis.png'), Inches(.75),Inches(1.85),width=Inches(5.5)); im=Image.open(root/'screenshots/02-results.png'); im=im.crop((0,0,im.width,1200)); bio=BytesIO(); im.save(bio,format='PNG'); bio.seek(0); s.shapes.add_picture(bio, Inches(6.7),Inches(1.85),width=Inches(5.5)); textbox(s,.8,6.65,11,.3,'Captured from the running application. Example inputs are synthetic.',12,MUTED)
s=slide('Testing: actual results');bullets(s,['Node 24.22.2: 31 of 32 tests passed; one offline GeoNames index test failed because source files were omitted.','Automated Chromium workflow passed: validation, request failure, calculate, compare, save, refresh, reopen and edit.','Four viewport widths checked; print CSS and PDF checked, not the native print dialog.','SQLite restart persistence, ownership, report CRUD and safe database errors tested.'],size=18)
s=slide('Deployment & limitations');bullets(s,['No live deployment or public URL has been verified.','Docker packaging prepared but not tested here; a persistent database volume is required.','Offline GeoNames dataset and original LICENSE were not supplied.','External lookups may fail; modelled soil/weather are not field measurements.','Not production authentication; public use needs security review and abuse controls.'],size=18)
s=slide('Next steps');bullets(s,['Restore the original GeoNames index and confirm project licensing.','Provide team names, roll numbers and actual contributions.','Complete native print and device testing; validate with agricultural experts.','Deploy with HTTPS and persistent storage, then verify the full workflow.','Record a real 3–5 minute demo using docs/DEMO.md.'],size=19)
prs.save(root/'TerraField_Presentation.pptx')
