/* TerraField — client of the same-origin REST API. No frontend-only mock data. */
'use strict';
const $ = (selector, root=document) => root.querySelector(selector);
const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
const app = $('#app');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ico = (name, cls='icon') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
const fmt = n => n === null || n === undefined || n === '' ? '—' : Number(n).toLocaleString('en-US',{maximumFractionDigits:2});
const SOIL_LABELS = {sandy:'Sandy',sandy_loam:'Sandy loam',loamy:'Loamy',silty:'Silty',clay_loam:'Clay loam',clayey:'Clayey'};
const SEASON_LABELS = {wet:'Warm / wet',cool:'Cool / dry',dry:'Warm / dry',unknown:'Not sure'};
const SOIL_DEPTHS = ['0-5cm','5-15cm','15-30cm','30-60cm','60-100cm','100-200cm'];
const depthLabel = depth => (depth || '0-5cm').replace('cm','').replace('-','–');
const emptyProfile = () => ({name:'',soil_type:'',ph:null,rainfall:null,temperature:null,humidity:null,season:'',nitrogen:null,phosphorus:null,potassium:null,source:'manual',illustrative:false,latitude:null,longitude:null,location:'',soil_retrieved_at:'',soil_depth:'',soil_method:'',soil_ph_interval_90:null,weather_source:'manual',weather_time:'',weather_location:''});
const state = {view:'analysis',profile:emptyProfile(),examples:[],crops:[],regions:[],reports:[],reportsError:'',result:null,resultField:null,resultAt:null,reportId:null,showAll:false,compareA:'',compareB:'',search:'',plantLibrary:null,plantLoading:false,plantError:'',plantFilter:'all',plantLimit:24,hideSourceWeeds:true, lookup:{lat:'',lon:'',depth:'0-5cm',name:'',results:[],searchStatus:'idle',searchNotice:'',searchSeq:0,selection:null,soil:null,weather:null,weatherError:'',weatherReceived:0,seq:{soil:0,weather:0}},busy:false};

function getWorkspaceKey(){
  const keyName='terrafield_workspace_key';
  try {
    let key=localStorage.getItem(keyName);
    if (!/^[a-f0-9]{64}$/i.test(key||'')) {
      const bytes=new Uint8Array(32); crypto.getRandomValues(bytes);
      key=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
      localStorage.setItem(keyName,key);
    }
    return key;
  } catch (_) { return null; }
}
const workspaceKey=getWorkspaceKey();
async function api(path,options={}) {
  const headers={'Accept':'application/json',...(options.headers||{})};
  if(options.body && typeof options.body!=='string'){headers['Content-Type']='application/json';options.body=JSON.stringify(options.body);}
  if((path.startsWith('/api/reports')||path==='/api/farm-plan') && workspaceKey) headers['X-Workspace-Key']=workspaceKey;
  const response=await fetch(path,{...options,headers});
  if(response.status===204) return null;
  let body; try {body=await response.json()} catch(_){body={error:'The server returned an unexpected response.'};}
  if(!response.ok){const error=new Error(body.error || `Request failed (${response.status})`); error.fields=body.fields||{}; error.status=response.status;throw error;}
  return body;
}
let toastTimer;
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3800);}
function setBusy(button, busy, text='Working…'){
  if(!button)return;
  if(busy){button.dataset.oldText=button.innerHTML;button.disabled=true;button.innerHTML=`<span class="spinner"></span> ${esc(text)}`;}
  else{button.disabled=false;if(button.dataset.oldText)button.innerHTML=button.dataset.oldText;}
}
function setNav(view){
  $$('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.nav===view || (view==='results'&&el.dataset.nav==='analysis')));
  const names={analysis:'NEW ANALYSIS',reports:'SAVED REPORTS',crops:'PLANT CATALOGUE',soil:'GLOBAL SOIL DATA',method:'OUR METHODOLOGY',results:'YOUR RESULTS',advisor:'ORGANIC FARMING GUIDE'};
  $('#breadcrumb').textContent=names[view]||'WORKSPACE';
  $('#sidebar').classList.remove('open');
}
function navigate(view,scroll=true){
  if(view==='results'&&!state.result)view='analysis';
  state.view=view;setNav(view);render();
  const hash='#'+view;if(location.hash!==hash)history.replaceState(null,'',hash);
  if(scroll)window.scrollTo({top:0,behavior:'instant'});
}
function render(){
  destroyFieldMap();
  if(state.view==='analysis')renderAnalysis();
  else if(state.view==='results')renderResults();
  else if(state.view==='reports')renderReports();
  else if(state.view==='crops')renderCatalogue();
  else if(state.view==='soil')renderSoil();
  else if(state.view==='method')renderMethod();
  else if(state.view==='advisor')renderAdvisor();
}
function pageHeading(eyebrow,title,description,buttons=''){
 return `<div class="page-heading"><div><div class="eyebrow">${esc(eyebrow)}</div><h1 class="page-title">${esc(title)}</h1><p class="page-description">${esc(description)}</p></div>${buttons ? `<div class="button-row no-print">${buttons}</div>`:''}</div>`;
}
function field(name,label,opts={}){
  const p=state.profile, value=p[name]??'';
  const option=opts.optional ? ' <span class="optional">(optional)</span>':'';
  let input;
  if(opts.options){
    input=`<select id="f-${name}" name="${name}" aria-describedby="error-${name}"><option value="">${esc(opts.placeholder||'Select an option')}</option>${opts.options.map(([v,l])=>`<option value="${esc(v)}" ${v===value?'selected':''}>${esc(l)}</option>`).join('')}</select>${ico('chevron','icon trailing-icon')}`;
  }else{
    input=`<input id="f-${name}" name="${name}" type="${opts.type||'number'}" value="${esc(value)}" placeholder="${esc(opts.placeholder||'') }" ${opts.min!==undefined?`min="${opts.min}"`:''} ${opts.max!==undefined?`max="${opts.max}"`:''} ${opts.type==='text'?'maxlength="80"':`step="${opts.step||'any'}" inputmode="decimal"`} ${opts.unit?'class="has-unit"':''} aria-describedby="error-${name}">${opts.unit?`<span class="unit">${esc(opts.unit)}</span>`:''}`;
  }
  return `<div class="field"><label for="f-${name}">${esc(label)}${option}</label><div class="input-wrap">${input}</div>${opts.hint?`<p class="field-hint">${esc(opts.hint)}</p>`:''}<span class="field-error" id="error-${name}"></span></div>`;
}
function profileSourceTag(){
 const p=state.profile;
 let tags='';
 if(p.illustrative||p.source==='example') tags+=`<div class="source-tag demo">${ico('info')}<span><strong>Illustrative example.</strong> This profile contains made-up demonstration inputs, not a field reading. Edit or reset it before using real data.</span></div>`;
 if(p.source==='soilgrids_live'||p.source==='soilgrids_snapshot') {
  const label=p.soil_method==='wcs_fallback'?'SoilGrids WCS fallback used':p.source==='soilgrids_live'?'SoilGrids live estimate used':'SoilGrids saved point estimate used';
  const range=p.soil_ph_interval_90;
  const interval=range && range.lower!=null && range.upper!=null?` Original modelled pH 90% interval: ${fmt(range.lower)}–${fmt(range.upper)} (not a guarantee).`:'';
  tags+=`<div class="source-tag soil-source-tag">${ico('globe')}<span><strong>${label}</strong>${p.location?' · '+esc(p.location):''} · ${esc(depthLabel(p.soil_depth))} cm${p.soil_retrieved_at?' · retrieved '+esc(formatDate(p.soil_retrieved_at)):''}.${interval} Inputs may have been edited; uncertainty ranges are not scored. Verify with a field test for the relevant root zone.</span></div>`;
 }
 return tags;
}
function weatherTag(){
 if(state.profile.weather_source!=='open_meteo_current')return '';
 return `<div class="source-tag demo weather-source-tag">${ico('sun')}<span><strong>Current weather, not a seasonal average.</strong> Open-Meteo conditions were added at ${esc(state.profile.weather_time || 'the selected time')}${state.profile.weather_location?' for '+esc(state.profile.weather_location):''}. Verify or replace them for your growing season, then <button type="button" class="subtle-link" data-action="confirm-seasonal">mark as checked</button>.</span></div>`;
}
function renderAnalysis(){
 restoreAnalysisMap();
 destroyFieldMap();
 const p=state.profile;
 app.innerHTML=`
 <section class="hero"><div class="hero-inner"><div class="eyebrow"><span class="eyebrow-dot"></span> A MORE GROUNDED WAY TO GROW</div><h1>Better decisions start<br><em>from the ground up.</em></h1><p>Discover crop options that fit your soil and climate, with the reasons behind every suggestion.</p><button class="hero-btn" data-action="scroll-form">Start your field profile ${ico('arrow')}</button></div><div class="hero-label"><i></i><div><strong>GROW WITH CLARITY</strong><span>One field at a time.</span></div></div></section>
 <section class="journey" aria-label="How it works"><div class="journey-heading"><strong>A thoughtful place to start.</strong><span>Three steps to a clearer path.</span></div><div class="journey-divider"></div><div class="journey-step"><span class="step-icon">${ico('layers')}</span><span class="step-copy"><small>STEP 01</small><strong>Know your soil</strong></span></div><div class="journey-divider"></div><div class="journey-step"><span class="step-icon">${ico('sun')}</span><span class="step-copy"><small>STEP 02</small><strong>Add your climate</strong></span></div><div class="journey-divider"></div><div class="journey-step"><span class="step-icon">${ico('sprout')}</span><span class="step-copy"><small>STEP 03</small><strong>Explore your matches</strong></span></div></section>
 <div class="section-header" id="profile-start"><div><h2>Let’s get to know your field.</h2><p>A few details can help uncover a more suitable place to start.</p></div><button class="subtle-link" data-nav="method">How it works ${ico('arrow-up')}</button></div>
 <div class="content-grid"><section class="card form-card"><div class="form-card-head"><div><div class="mini-label">YOUR FIELD PROFILE</div><h3>Tell us about your growing conditions</h3><p>Enter what you know. You can update it anytime.</p></div><div class="example-holder"><button class="outline-btn" data-action="toggle-examples" aria-expanded="false" aria-controls="example-menu">${ico('sprout')} Try an example ${ico('chevron')}</button><div class="example-menu" id="example-menu" hidden>${state.examples.map(e=>`<button type="button" data-example="${esc(e.id)}"><strong>${esc(e.name)}</strong><span>${esc(e.region)}</span></button>`).join('')}</div></div></div>
 <form id="profile-form" class="form-body" novalidate>${profileSourceTag()}<div class="source-tag" id="profile-location-status" role="status"></div>
 <div class="form-section"><div class="form-section-title"><span class="number-badge">01</span><span><strong>Soil conditions</strong><small>A soil test offers the best starting point.</small></span></div><div class="field-grid">
 ${field('soil_type','Soil texture',{options:Object.entries(SOIL_LABELS),placeholder:'Choose your soil type'})}
 ${field('ph','Soil pH',{placeholder:'e.g. 6.5',min:0,max:14,step:'0.1',hint:'On a scale of 0–14.'})}
 </div><details class="nutrient-details"><summary>Available N, P &amp; K <span class="optional">(optional)</span>${ico('chevron')}</summary><div class="nutrient-content"><p class="nutrient-note">Record available nutrient values from a lab report. They are <strong>not scored</strong>: lab methods and availability vary. Do not enter mapped total N here.</p><div class="field-grid three">
 ${field('nitrogen','Nitrogen (N)',{placeholder:'e.g. 20',min:0,max:5000,unit:'mg/kg',optional:true})}${field('phosphorus','Phosphorus (P)',{placeholder:'e.g. 15',min:0,max:5000,unit:'mg/kg',optional:true})}${field('potassium','Potassium (K)',{placeholder:'e.g. 80',min:0,max:5000,unit:'mg/kg',optional:true})}</div></div></details></div>
 <div class="form-section"><div class="form-section-title"><span class="number-badge">02</span><span><strong>Climate &amp; season</strong><small>Use typical values for your growing season.</small></span></div>${weatherTag()}<div class="field-grid">
 ${field('rainfall','Annual rainfall',{placeholder:'e.g. 800',unit:'mm/yr',min:0,max:10000,hint:'Typical total precipitation per year; 0–10,000 mm.'})}
 ${field('temperature','Mean growing-season temperature',{placeholder:'e.g. 25',unit:'°C',min:-30,max:60,hint:'Supported range: −30 to 60 °C.'})}
 ${field('humidity','Mean relative humidity',{placeholder:'e.g. 65',unit:'%',min:0,max:100,optional:true,hint:'Supported range: 0–100%.'})}
 ${field('season','Growing season',{options:Object.entries(SEASON_LABELS),placeholder:'Choose a season',hint:'Broad labels; planting calendars vary.'})}
 </div></div><div class="form-bottom"><small>${ico('info')} Advisory only. Not a substitute for local agricultural expertise.</small><div class="button-row"><button type="button" class="plain-btn" data-action="reset-profile">Clear fields</button><button type="submit" class="primary-btn" id="recommend-button">Find my crops ${ico('arrow')}</button></div></div></form></section>
 <aside class="sidebar-cards"><div class="card glance-card"><div class="glance-head"><div><h3>Your field at a glance</h3><p>A little overview as you go.</p></div><span class="glance-icon">${ico('plant')}</span></div><div class="progress-copy"><span>Profile details complete</span><strong id="completion-text">0 of 5</strong></div><div class="progress-track"><div class="progress-fill" id="completion-bar" style="width:0%"></div></div><dl class="glance-list"><div class="glance-row"><dt>Soil texture</dt><dd id="glance-soil">—</dd></div><div class="glance-row"><dt>Soil pH</dt><dd id="glance-ph">—</dd></div><div class="glance-row"><dt>Annual rainfall</dt><dd id="glance-rain">—</dd></div><div class="glance-row"><dt>Temperature</dt><dd id="glance-temp">—</dd></div><div class="glance-row"><dt>Growing season</dt><dd id="glance-season">—</dd></div></dl></div>
 <div class="global-card"><div class="mini-label">A WORLD OF SOIL DATA</div><h3>Get to know the ground beneath you.</h3><p>Explore modelled soil estimates from locations around the world.</p><button class="subtle-link" data-nav="soil">Explore soil data ${ico('arrow')}</button></div>
 <div class="sources-card">${ico('info')}<span>Informed by ISRIC &amp; FAO data</span><button class="subtle-link" data-nav="method">Sources ${ico('arrow-up')}</button></div></aside></div>`;
 updateGlance();updateProfileLocationStatus();
}
function updateGlance(){
 if(!$('#completion-text'))return;
 const p=state.profile;const valid=(v,lo,hi)=>typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi;const done=[Object.hasOwn(SOIL_LABELS,p.soil_type),valid(p.ph,0,14),valid(p.rainfall,0,10000),valid(p.temperature,-30,60),Object.hasOwn(SEASON_LABELS,p.season)].filter(Boolean).length;
 $('#completion-text').textContent=`${done} of 5`;$('#completion-bar').style.width=`${done*20}%`;
 $('#glance-soil').textContent=SOIL_LABELS[p.soil_type]||'—';$('#glance-ph').textContent=p.ph===null?'—':fmt(p.ph);
 $('#glance-rain').textContent=p.rainfall===null?'—':`${fmt(p.rainfall)} mm/yr`;$('#glance-temp').textContent=p.temperature===null?'—':`${fmt(p.temperature)} °C`;$('#glance-season').textContent=SEASON_LABELS[p.season]||'—';
}
function setProfileFromInput(el){
 const key=el.name;if(!key||!(key in state.profile))return;
 const numeric=['ph','rainfall','temperature','humidity','nitrogen','phosphorus','potassium'];
 state.profile[key]=numeric.includes(key)?(el.value===''?null:Number(el.value)):el.value;
 // Keep conservative provenance flags after editing individual fields: other
 // fields may still come from the source. The user can explicitly mark current
 // weather checked, or clear the entire profile.
 el.classList.remove('invalid');const error=$(`#error-${key}`);if(error)error.textContent='';
 updateGlance();
}
function showFieldErrors(fields){
 $$('.field-error').forEach(e=>e.textContent='');$$('.field .invalid').forEach(e=>e.classList.remove('invalid'));
 let first=null;Object.entries(fields||{}).forEach(([k,v])=>{const target=$(`#error-${k}`), input=$(`#f-${k}`);if(target)target.textContent=v;if(input){input.classList.add('invalid');if(!first)first=input;}});
 if(first){const detail=first.closest('details');if(detail)detail.open=true;first.focus();first.scrollIntoView({block:'center',behavior:'smooth'});}
}
function validateClientProfile(){
 const p=state.profile, errors={};
 if(!Object.hasOwn(SOIL_LABELS,p.soil_type))errors.soil_type='Choose a soil texture.';
 if(!Object.hasOwn(SEASON_LABELS,p.season))errors.season='Choose a season or Not sure.';
 for(const [key,lo,hi,required,label] of [['ph',0,14,true,'Soil pH'],['rainfall',0,10000,true,'Annual rainfall'],['temperature',-30,60,true,'Growing-season temperature'],['humidity',0,100,false,'Humidity'],['nitrogen',0,5000,false,'Nitrogen'],['phosphorus',0,5000,false,'Phosphorus'],['potassium',0,5000,false,'Potassium']]){
   const v=p[key];if(v===null || v===''){if(required)errors[key]=`${label} is required.`;}
   else if(typeof v!=='number' || !Number.isFinite(v) || v<lo || v>hi)errors[key]=`${label} must be between ${lo} and ${hi}.`;
 }
 return errors;
}
async function recommend(form){
 const btn=$('#recommend-button');if(!btn || btn.disabled)return;
 const fields=validateClientProfile();if(Object.keys(fields).length){showFieldErrors(fields);toast('Please correct the highlighted fields.');return;}
 setBusy(btn,true,'Finding matches…');
 try { const result=await api('/api/recommendations',{method:'POST',body:{profile:state.profile}});state.result=result;state.resultField=reportField(result.profile);resetAdvisorContext();state.resultAt=new Date().toISOString();state.profile={...result.profile};state.reportId=null;state.showAll=false;state.compareA=result.rankings[0]?.id||'';state.compareB=result.rankings[1]?.id||'';navigate('results'); }
 catch(err){showFieldErrors(err.fields);toast(err.message);}finally{setBusy(btn,false);}
}
function renderRank(c,index){
 return `<article class="rank-item"><div class="rank-row"><span class="rank-number">${String(index+1).padStart(2,'0')}</span><span class="crop-icon tone-${index%4}">${ico('plant')}</span><div><div class="crop-title">${esc(c.name)}</div><button type="button" class="subtle-link no-print" data-linked-crop="${esc(c.id)}">View plant details</button><div class="crop-sub">${esc(c.category)}${c.capped?' · outside an absolute range':''}</div><div class="score-track"><div class="score-fill" style="width:${Math.max(0,Math.min(100,c.score))}%"></div></div></div><div class="rank-score">${c.score}<small> / 100</small></div></div><details class="rank-more"><summary>Why this score? ＋</summary><div class="factor-lines">${c.factors.map(f=>`<div class="factor-line">${esc(f.reason)} <span>(${esc(f.source)}; ${f.score}/100)</span></div>`).join('')}${c.missing_crop_data.length?'<div class="factor-line">No texture range was available for this crop; texture was excluded.</div>':''}${c.capped?'<div class="factor-line">Score capped at 50 because a factor is outside an ECOCROP absolute range.</div>':''}</div></details></article>`;
}
function compareHtml(){
 const rows=state.result.rankings;const a=rows.find(x=>x.id===state.compareA),b=rows.find(x=>x.id===state.compareB);
 if(!a||!b)return '';
 const choices=rows.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');
 const fact=(c,key)=>c.factors.find(f=>f.key===key);
 const cell=(c,key)=>{const f=fact(c,key);return f?`<strong>${esc(f.input)}</strong><span>Preferred: ${esc(f.optimal)} · ${f.score}/100</span>`:'<strong>Not scored</strong><span>Input or crop range unavailable</span>';};
 return `<div class="panel-heading"><div><div class="mini-label">SIDE BY SIDE</div><h2>Compare your options</h2><p>See how the same field matches two crops.</p></div>${ico('compare')}</div><div class="compare-selects no-print"><label><span class="sr-only">First crop</span><select id="compare-a">${choices}</select></label><label><span class="sr-only">Second crop</span><select id="compare-b">${choices}</select></label></div>${a.id===b.id?'<div class="notice warning">Choose two different crops to compare.</div>':`<table class="compare-table"><thead><tr><th>Factor</th><td><strong>${esc(a.name)}</strong><span>Index ${a.score}/100</span></td><td><strong>${esc(b.name)}</strong><span>Index ${b.score}/100</span></td></tr></thead><tbody>${[['ph','Soil pH'],['temperature','Temperature'],['rainfall','Rainfall'],['texture','Texture'],['humidity','Humidity'],['season','Season']].map(([key,label])=>`<tr><th>${label}</th><td>${cell(a,key)}</td><td>${cell(b,key)}</td></tr>`).join('')}</tbody></table><p class="compare-note">Preferred bands use ECOCROP where available. Humidity and season are illustrative prototype assumptions. Index ≠ probability.</p>`}`;
}
function renderResults(){
 const r=state.result,p=r.profile,best=r.rankings[0];
 const buttons=`<button class="secondary-btn" data-nav="advisor">Organic farming guide</button><button class="secondary-btn" data-nav="analysis">Edit profile</button><button class="secondary-btn" data-action="export-csv">Export CSV</button><button class="secondary-btn" data-action="print">${ico('print')} Print</button><button class="primary-btn" data-action="save-report" ${state.reportId?'disabled':''}>${ico(state.reportId?'check':'bookmark')} ${state.reportId?'Saved to reports':'Save report'}</button>`;
 const shown=state.showAll?r.rankings:r.rankings.slice(0,6);
 app.innerHTML=pageHeading('YOUR FIELD, CONSIDERED','Here are your crop matches.','A transparent starting point for comparing options—not a guarantee of suitability.',buttons)+
 `<p class="report-date">Report date: ${esc(formatDate(state.resultAt || new Date().toISOString()))} · Method ${esc(r.method_version)}${state.resultField?` · User-drawn field area ≈ ${fmt(state.resultField.area_m2/10000)} ha / ${fmt(state.resultField.area_m2/4046.8564224)} acres (not a survey)`:" · Field area unknown"}</p><section class="result-hero"><div class="best-info"><div class="mini-label">YOUR HIGHEST SCREENING INDEX</div><h2>${esc(best.name)}</h2><p>${esc(best.category)} based on the information you provided. Explore the factors below and check local conditions before deciding.</p><div class="input-chips">${p.latitude!==null&&p.longitude!==null?`<span class="input-chip">Field: ${esc(p.location||p.name||'Map location')} · ${Number(p.latitude).toFixed(5)}, ${Number(p.longitude).toFixed(5)}</span>`:''}<span class="input-chip">${esc(SOIL_LABELS[p.soil_type])} soil</span><span class="input-chip">pH ${fmt(p.ph)}</span><span class="input-chip">${fmt(p.rainfall)} mm/yr</span><span class="input-chip">${fmt(p.temperature)} °C</span>${p.humidity!==null?`<span class="input-chip">${fmt(p.humidity)}% humidity</span>`:''}<span class="input-chip">${esc(SEASON_LABELS[p.season])}</span>${['nitrogen','phosphorus','potassium'].map((k,i)=>p[k]!==null?`<span class="input-chip">${['N','P','K'][i]} ${fmt(p[k])} mg/kg (unscored)</span>`:'').join('')}</div></div><div class="score-circle"><strong>${best.score}</strong><span>INDEX / 100</span></div></section>
 <section class="card padded-card"><div class="mini-label">INPUT PROVENANCE</div><p>Soil: ${esc(p.source||'unknown')}${p.soil_depth?` · depth ${esc(p.soil_depth)}`:''}${p.soil_retrieved_at?` · retrieved ${esc(p.soil_retrieved_at)}`:''}. Weather: ${esc(p.weather_source||'unknown')}${p.weather_time?` · time ${esc(p.weather_time)}`:''}. Annual rainfall is entered by the user or from an illustrative example, not supplied by current weather. Provenance labels are self-reported and may not reflect later edits.</p>${state.resultField?`<p style="overflow-wrap:anywhere">Field outline: ${esc(state.resultField.source)}. Polygon coordinates (longitude, latitude): ${esc(JSON.stringify(state.resultField.geometry.coordinates[0]))}</p>`:'<p>Field outline and area: unknown.</p>'}</section>
 <div class="result-layout"><section class="card rank-card"><div class="panel-heading"><div><div class="mini-label">RANKED FOR YOUR PROFILE</div><h2>Your crop shortlist</h2><p>Scores are screening indices, not probabilities.</p></div><span class="category-pill">${r.rankings.length} crops screened</span></div><div class="result-list">${shown.map(renderRank).join('')}</div><button class="secondary-btn result-more no-print" data-action="toggle-all">${state.showAll?'Show fewer crops':`Show all ${r.rankings.length} crops`} ${ico('chevron')}</button></section>
 <section class="card compare-card" id="comparison">${compareHtml()}</section></div>
 <section class="card padded-card result-disclaimer"><div class="panel-heading"><div><div class="mini-label">IMPORTANT CONTEXT</div><h2>What this result can’t tell you</h2></div></div><div class="notice warning" style="margin-top:15px">${ico('info')}<span>${esc(r.advisory)}</span></div><div class="factor-lines" style="margin-top:9px">${r.missing_information.map(x=>`<div class="factor-line">${esc(x)}</div>`).join('')}<div class="factor-line">${esc(r.disclaimer)}</div></div><button class="subtle-link no-print" data-nav="method">Read the full methodology ${ico('arrow')}</button></section>`;
 const a=$('#compare-a'),b=$('#compare-b');if(a)a.value=state.compareA;if(b)b.value=state.compareB;
}
async function refreshReports(){
 if(!workspaceKey){state.reports=[];return;}
 try{const data=await api('/api/reports');state.reports=data.reports;state.reportsError='';$('#report-count').textContent=state.reports.length||'';}catch(err){state.reportsError=err.message;}
}
async function saveReport(button){
 if(!workspaceKey){toast('Browser storage is unavailable. Enable it to save reports.');return;}
 setBusy(button,true,'Saving…');
 try{const data=await api('/api/reports',{method:'POST',body:{profile:state.result.profile,field:state.resultField,title:state.result.profile.name||state.result.profile.location||'Field analysis'}});state.reportId=data.id;state.resultAt=data.created_at;state.result=data.result;state.resultField=data.field;await refreshReports();renderResults();toast('Report saved to this browser workspace.');}
 catch(err){toast(err.message);}finally{setBusy(button,false);}
}
function exportReportCSV(){
 const r=state.result,p=r.profile,f=state.resultField;if(!r)return;
 const rows=[['TerraField crop screening — not a probability or guarantee'],['Method',r.method_version],['Report date',state.resultAt||''],['Field',p.name||p.location||''],['Latitude',p.latitude],['Longitude',p.longitude],['Soil texture',p.soil_type],['Soil pH',p.ph],['Annual rainfall mm',p.rainfall],['Temperature °C',p.temperature],['Relative humidity %',p.humidity],['Season',p.season],['Nitrogen mg/kg (unscored)',p.nitrogen],['Phosphorus mg/kg (unscored)',p.phosphorus],['Potassium mg/kg (unscored)',p.potassium],['Soil data source',p.source],['Soil depth',p.soil_depth],['Soil retrieved at',p.soil_retrieved_at],['Weather source',p.weather_source],['Weather time',p.weather_time],['Field area square metres',f?.area_m2??'unknown'],['Field area hectares',f?f.area_m2/10000:'unknown'],['Field area acres',f?f.area_m2/4046.8564224:'unknown'],['Field geometry GeoJSON',f?JSON.stringify(f.geometry):'unknown'],['Field geometry source',f?.source||'unknown'],['Missing information',r.missing_information.join(' | ')],[],['Crop','Screening index / 100','Outside absolute range (capped)','Factor details and source'],...r.rankings.map(c=>[c.name,c.score,c.capped?'yes':'no',c.factors.map(x=>`${x.reason} (${x.source}; ${x.score}/100)`).join(' | ')])];
 const blob=new Blob([TerraCSV.serialize(rows)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='terrafield-report.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function formatDate(value){try{return new Date(value).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});}catch(_){return value;}}
function renderReports(){
 app.innerHTML=pageHeading('YOUR WORKSPACE','Your saved reports.','Come back to the fields and crop options you’ve already explored.',`<button class="primary-btn" data-nav="analysis">${ico('plus')} New analysis</button>`)+
 `<div class="notice" style="margin-bottom:16px">${ico('info')}<span>Reports are stored in the server’s SQLite database and linked to a secret in this browser. Clearing browser storage loses access; this is not an account or production-grade authentication.</span></div>`+
 (state.reportsError?`<section class="card empty-state"><h3>Couldn’t load saved reports.</h3><p>${esc(state.reportsError)}</p><button class="secondary-btn" data-action="retry-reports">Try again</button></section>`:state.reports.length?`<section class="card report-list">${state.reports.map((r,i)=>`<div class="report-row"><span class="crop-icon tone-${i%4}">${ico('plant')}</span><div class="report-copy"><strong>${esc(r.title)}</strong><span>${esc(formatDate(r.created_at))} · ${esc(r.top_crop||'No crop')} · index ${r.top_score}/100</span></div><div class="report-actions"><button data-report-open="${esc(r.id)}">Open</button><button data-report-rename="${esc(r.id)}">Rename</button><button class="delete" data-report-delete="${esc(r.id)}">Delete</button></div></div>`).join('')}</section>`:`<section class="card empty-state"><div class="empty-illustration">${ico('bookmark')}</div><h3>No saved reports yet.</h3><p>Once you’ve explored a field, save the results here to revisit or print later.</p><button class="primary-btn" data-nav="analysis">Start an analysis ${ico('arrow')}</button></section>`);
}
const PLANT_FILTERS=[['all','All useful plants'],['tree','Trees'],['food','Food & beverages'],['feed','Animal feed'],['materials','Materials & timber'],['fuel','Fuel'],['environment','Environmental uses'],['medicine','Medicinal uses'],['screened','Used in crop screening']];
const PURPOSE_LABELS={food:'Food',feed:'Animal feed',materials:'Materials',fuel:'Fuel',environment:'Environmental',medicine:'Medicinal',other:'Other uses'};
const foldSearch=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('en');
async function loadPlantLibrary(){
 if(state.plantLoading)return;
 state.plantLoading=true;state.plantError='';
 try{
  const data=await api('/api/plants');
  if(!data?.metadata||!Array.isArray(data.plants))throw new Error('Plant reference data could not be read.');
  state.plantLibrary=data;
  for(const p of data.plants)p.searchKey=foldSearch([p.name,p.scientific_name,...p.aliases,...p.synonyms,...p.categories,...p.life_forms,...p.uses.map(u=>`${u.use} ${u.detail}`)].join(' '));
 }catch(e){state.plantError=e.message;}
 finally{state.plantLoading=false;if(state.view==='crops')renderCrops();}
}
function plantCard(p,i){
 const kind=p.life_forms.includes('tree')?'Tree':p.life_forms[0]||'Plant';
 const uses=p.purposes.map(x=>PURPOSE_LABELS[x]||x).slice(0,3).join(' · ');
 return `<button type="button" class="card library-card" data-plant="${esc(p.id)}"><div class="library-card-top"><span class="crop-icon tone-${i%4}">${ico('plant')}</span><span class="category-pill">${esc(kind)}</span></div><h3>${esc(p.name)}</h3><i>${esc(p.scientific_name)}</i><p>${esc(uses)}</p><span class="plant-screening">${p.screened_crop_id?'Included in 21-crop screening':'Reference only · not scored'}</span>${p.source_weed_label?'<span class="plant-weed-flag">Source also labels this a weed</span>':''}<span class="subtle-link" style="margin-top:12px">View plant details ${ico('arrow')}</span></button>`;
}
function updateCropGrid(){
 const box=$('#library-results'),count=$('#library-count'),more=$('#plant-more');if(!box||!state.plantLibrary)return;
 const q=foldSearch(state.search.trim()),filter=state.plantFilter;
 const relevant=state.plantLibrary.plants.filter(p=>{
  const matchesFilter=filter==='all'||(filter==='tree'?p.life_forms.includes('tree'):filter==='screened'?!!p.screened_crop_id:p.purposes.includes(filter));
  return matchesFilter&&(!q||p.searchKey.includes(q));
 });
 const matches=relevant.filter(p=>!state.hideSourceWeeds||!p.source_weed_label),hidden=relevant.length-matches.length;
 const shown=matches.slice(0,state.plantLimit);
 box.innerHTML=shown.length?shown.map(plantCard).join(''):hidden?'<div class="notice">Matching useful plants are hidden because ECOCROP also labels them as weeds. To inspect them with warnings, uncheck “Hide source-labelled weeds”.</div>':'<div class="notice">No matching records in this reference subset. Try a different name or filter; some useful crops are absent.</div>';
 count.textContent=`Showing ${shown.length.toLocaleString()} of ${matches.length.toLocaleString()} records${hidden?` · ${hidden.toLocaleString()} source-weed-labelled hidden`:''}`;
 more.hidden=shown.length>=matches.length;
}
function renderCrops(){
 if(!state.plantLibrary){
  app.innerHTML=pageHeading('THE PLANT LIBRARY','A world of useful plants.','Browse a historical FAO ECOCROP reference subset, with the plant uses its source records.')+
   (state.plantError?`<section class="card empty-state"><h3>Plant library unavailable.</h3><p>${esc(state.plantError)}</p><button class="secondary-btn" data-action="retry-plants">Try again</button></section>`:`<div class="loading-screen"><span class="spinner"></span> Loading plant reference data…</div>`);
  if(!state.plantError)loadPlantLibrary();return;
 }
 const meta=state.plantLibrary.metadata;
 app.innerHTML=pageHeading('THE PLANT LIBRARY','A world of useful plants.',`Explore ${fmt(meta.count)} historical plant records, including ${fmt(meta.tree_count)} with a tree life-form. Uses and names are reference information, not planting or safety advice.`)+
 `<div class="notice warning plant-notice">${ico('info')}<span><strong>Reference library, not a recommendation list.</strong> Only ${fmt(state.crops.length)} separately profiled crops are scored. Plants without a documented use are excluded. ${fmt(meta.source_weed_with_use_count)} useful plants that the source also labels as weeds are hidden by default; some, like guava and basil, are food crops. Other plants may be invasive or toxic locally. Check identification, local rules and expert advice.</span></div>
 <div class="library-tools plant-tools"><div class="search-shell">${ico('search')}<input type="search" id="crop-search" class="search-input" placeholder="Search common or scientific names, uses…" value="${esc(state.search)}" aria-label="Search plant library"></div><div class="field plant-filter"><label class="visually-hidden" for="plant-filter">Filter plant library</label><select id="plant-filter">${PLANT_FILTERS.map(([v,l])=>`<option value="${v}" ${state.plantFilter===v?'selected':''}>${esc(l)}</option>`).join('')}</select></div><span class="category-pill" id="library-count" aria-live="polite"></span></div>
 <label class="plant-weed-toggle"><input type="checkbox" id="hide-source-weeds" ${state.hideSourceWeeds?'checked':''}><span>Hide source-labelled weeds <small>(default; also hides some useful crops)</small></span></label>
 <div class="library-grid" id="library-results"></div><div class="library-more"><button class="secondary-btn" data-action="more-plants" id="plant-more">Show more plants ${ico('arrow')}</button></div>
 <p class="plant-attribution">FAO ECOCROP (CC BY 4.0), adapted from <a href="https://github.com/OpenCLIM/ecocrop" target="_blank" rel="noopener noreferrer">OpenCLIM</a> and the <a href="https://github.com/supersistence/EcoCrop-ScrapeR" target="_blank" rel="noopener noreferrer">2017 EcoCrop-ScrapeR use table</a>. Names and uses may be outdated or incomplete; records may represent subspecies as well as species.</p>`;
 updateCropGrid();
}
function openPlant(id){
 const p=state.plantLibrary?.plants.find(x=>x.id===id);if(!p)return;
 const metric=(band,unit)=>band?`${fmt(band.optimal[0])}–${fmt(band.optimal[1])}${unit?' '+esc(unit):''}`:'—';
 const rows=p.uses.map(u=>`<li><strong>${esc(u.use)}</strong><span>${esc([u.detail,u.part?`part: ${u.part}`:''].filter(Boolean).join(' · ')||'Use recorded; details not specified')}</span></li>`).join('');
 const aliases=p.aliases.slice(0,12).join(', ');
 $('#modal-content').innerHTML=`<div class="modal-body plant-detail"><div class="modal-head"><div><div class="mini-label">ECOCROP ${fmt(p.ecocrop_id)} · ${esc(p.life_forms.join(' / ')||'plant')}</div><h2>${esc(p.name)}</h2><p><i>${esc(p.scientific_name)}</i>${p.lifespan?' · '+esc(p.lifespan):''}</p></div><button class="modal-close" data-action="close-modal" aria-label="Close">${ico('close')}</button></div>
 <div class="source-tag plant-detail-tag">${ico('info')}<span>${p.screened_crop_id?'This plant has a separate profile in the 21-crop screening set.':'Reference only: this plant is not included in the recommendation engine.'}</span></div>
 ${aliases?`<p class="plant-aliases"><strong>Recorded names:</strong> ${esc(aliases)}${p.aliases.length>12?', …':''}</p>`:''}
 <div class="modal-metrics"><div class="metric"><span>OPTIMAL SOIL pH</span><strong>${metric(p.ranges.ph,'')}</strong></div><div class="metric"><span>OPTIMAL TEMPERATURE</span><strong>${metric(p.ranges.temperature,'°C')}</strong></div><div class="metric"><span>OPTIMAL ANNUAL RAIN</span><strong>${metric(p.ranges.rainfall,'mm')}</strong></div></div>
 <p class="plant-small">Historical ECOCROP ecological ranges, when available. A dash means missing or inconsistent in the source. They do not establish local suitability.</p><h3>Uses recorded by ECOCROP</h3>${p.evidence==='crop_category'?'<p class="plant-small">This entry is included on its fruit/nut crop category; the separate use table did not provide details.</p>':''}<ul class="plant-use-list">${rows}</ul>
 <div class="notice warning">${ico('info')}<span>${p.source_weed_label?'ECOCROP also labels this useful plant a weed; weed and invasive status depends on the location. ':''}${p.poison_use_recorded?'The source also records a poison use. ':''}Recorded uses do not establish safety, efficacy or legal status. Some parts can be toxic; plants can be invasive in particular places. Verify species, use, laws and local growing conditions with an expert.</span></div>
 <a class="source-link" href="${esc(p.source_url)}" target="_blank" rel="noopener noreferrer">View this FAO ECOCROP data sheet ${ico('arrow-up')}</a></div>`;
 $('#modal').showModal();
}
function openCrop(id){
 const c=state.crops.find(x=>x.id===id);if(!c)return;
 $('#modal-content').innerHTML=`<div class="modal-body"><div class="modal-head"><div><div class="mini-label">${esc(c.category)} · ECOCROP ${c.ecocrop_id}</div><h2>${esc(c.name)}</h2><p><i>${esc(c.scientific_name)}</i></p></div><button class="modal-close" data-action="close-modal" aria-label="Close">${ico('close')}</button></div><div class="modal-metrics"><div class="metric"><span>OPTIMAL SOIL pH</span><strong>${fmt(c.ph.optimal[0])}–${fmt(c.ph.optimal[1])}</strong></div><div class="metric"><span>OPTIMAL TEMPERATURE</span><strong>${fmt(c.temperature.optimal[0])}–${fmt(c.temperature.optimal[1])} °C</strong></div><div class="metric"><span>OPTIMAL ANNUAL RAIN</span><strong>${fmt(c.rainfall.optimal[0])}–${fmt(c.rainfall.optimal[1])} mm</strong></div></div><p class="muted" style="font-size:11px">ECOCROP optimal texture: <strong>${esc(c.texture_optimal||'Not specified')}</strong>. ECOCROP range values are general ecological descriptors, not field-specific recommendations.</p><div class="notice warning">${ico('info')}<span>These ranges do not account for irrigation, variety, management, salinity or pests. Consult local expertise.</span></div><a class="source-link" href="${esc(c.source_url)}" target="_blank" rel="noopener noreferrer">View the FAO ECOCROP data sheet ${ico('arrow-up')}</a></div>`;
 $('#modal').showModal();
}
function broadTexture(v){if(v.clay==null||v.sand==null)return null;if(v.clay>=40)return 'clayey';if(v.sand>=70&&v.clay<20)return 'sandy';return 'loamy';}
function soilStats(v,intervals={}){
 return [['phh2o','Soil pH',''],['sand','Sand','%'],['silt','Silt','%'],['clay','Clay','%'],['soc','Organic carbon','g/kg'],['nitrogen','Total nitrogen','g/kg'],['cec','CEC','cmol(+)/kg'],['bdod','Bulk density','kg/dm³']].map(([key,label,unit])=>{
  const val=v?.[key],range=intervals?.[key];
  const bounds=range && range.lower!=null && range.upper!=null ? `<span class="stat-interval">90% interval: ${fmt(range.lower)}–${fmt(range.upper)} ${esc(unit)}</span>` : '';
  return `<div class="stat"><span>${esc(label)}</span><strong>${fmt(val)}</strong> <small>${esc(unit)}</small>${bounds}</div>`;
 }).join('');
}
function snapshotCard(r){const v=r.values;return `<article class="card snapshot"><div class="snapshot-top"><span class="continent">${esc(r.continent)}</span><span class="category-pill">0–5 cm</span></div><h3>${esc(r.region)}, ${esc(r.country)}</h3><div class="coords">${fmt(r.latitude)}°, ${fmt(r.longitude)}° · point estimate</div><div class="snapshot-fractions"><div><span>SAND</span><strong>${fmt(v.sand)}%</strong></div><div><span>SILT</span><strong>${fmt(v.silt)}%</strong></div><div><span>CLAY</span><strong>${fmt(v.clay)}%</strong></div></div><div class="snapshot-line"><span>Soil pH</span><strong>${fmt(v.phh2o)}</strong></div><div class="snapshot-line"><span>Organic carbon</span><strong>${fmt(v.soc)} g/kg</strong></div><div class="snapshot-line"><span>Total nitrogen (not available N)</span><strong>${fmt(v.nitrogen)} g/kg</strong></div><div class="snapshot-line"><span>CEC</span><strong>${fmt(v.cec)} cmol(+)/kg</strong></div><div class="snapshot-line"><span>Bulk density</span><strong>${fmt(v.bdod)} kg/dm³</strong></div><button class="subtle-link" data-use-region="${esc(r.id)}">Use this point in my profile ${ico('arrow')}</button><div class="snapshot-date">ISRIC SoilGrids · retrieved ${esc(formatDate(r.retrieved_at))}</div></article>`;}
function renderLocationResults(){
 const box=$('#location-results');if(!box)return;
 const l=state.lookup,coord=v=>Number.isFinite(Number(v))?Number(v).toFixed(6):'—';
 const note=l.searchNotice?`<p class="place-search-note">${esc(l.searchNotice)}</p>`:'';
 const results=l.results.length?`<div class="location-results">${l.results.map((x,i)=>{
  const parts=[x.kind,x.county,x.region,x.country].filter((value,index,arr)=>value&&value!==x.name&&arr.indexOf(value)===index);
  return `<button type="button" data-location-index="${i}"><span class="place-result-main"><strong>${esc(x.name)}</strong><span>${esc(parts.join(' · '))}</span><small>${esc(x.source||'Place search')}</small></span><small class="place-coords">${coord(x.latitude)}°, ${coord(x.longitude)}°</small></button>`;
 }).join('')}</div>`:'';
 box.innerHTML=note+results;
 const selection=$('#location-selection');
 if(selection)selection.innerHTML=l.selection?`<div class="notice" style="margin-top:10px">${ico('pin')}<span><strong>${esc(l.selection.name)}</strong> · ${esc(l.selection.kind||'place')} · ${esc(l.selection.source||'place search')}. This is a reference point, not soil for the entire city, region or country. Adjust the coordinates to your actual field.</span></div>`:'';
}
const intervalLabel=seconds=>!Number.isFinite(seconds)?'unknown interval':seconds%3600===0?`${seconds/3600} h`:seconds%60===0?`${seconds/60} min`:`${seconds} s`;
const coordinateLabel=n=>Number.isFinite(n)?n.toFixed(5):'—';
const ageLabel=seconds=>!Number.isFinite(seconds)?'':seconds<0?` · ${Math.ceil(-seconds/60)} min in the future`:` · model time ${Math.floor(seconds/60)} min ago`;
function aqiLabel(value){
 if(value==null)return 'Unavailable';
 return value<=50?'Good':value<=100?'Moderate':value<=150?'Unhealthy for sensitive groups':value<=200?'Unhealthy':value<=300?'Very unhealthy':'Hazardous';
}
function weatherStat(label,value,unit,sub=''){
 return `<div class="stat weather-stat"><span>${esc(label)}</span><strong>${fmt(value)}</strong>${value==null?'':` <small>${esc(unit)}</small>`}${sub?`<span class="weather-stat-sub">${esc(sub)}</span>`:''}</div>`;
}
function modelMeta(section,maxAge){
 if(!section || section.status==='unavailable')return '<p class="model-meta model-unavailable">This source is currently unavailable; no values are substituted.</p>';
 // Base age comes from the server; monotonic elapsed time keeps the label and
 // stale warning honest while this page remains open, without trusting the
 // browser's wall clock or silently polling the provider.
 const elapsed=state.lookup.weatherReceived?Math.max(0,Math.floor((performance.now()-state.lookup.weatherReceived)/1000)):0;
 const age=Number.isFinite(section.age_seconds)?section.age_seconds+elapsed:null;
 const status=age==null?section.freshness:age < -300?'future':age>maxAge?'stale':'recent';
 const fresh=status==='stale'?' · STALE — check a newer source':status==='future'?' · FUTURE model time — check local time':'';
 const grid=section.model_latitude==null?'grid point unavailable':`model grid ${coordinateLabel(section.model_latitude)}°, ${coordinateLabel(section.model_longitude)}°`;
 return `<p class="model-meta">Model time <strong>${esc(section.time)} ${esc(section.timezone)}</strong> · interval ${esc(intervalLabel(section.interval_seconds))}${esc(ageLabel(age))}${esc(fresh)}<br>Retrieved ${esc(section.retrieved_at)} · ${esc(grid)}</p>`;
}
function modelIssues(section){return section?.issues?.length?`<p class="model-issues">${esc(section.issues.join(' · '))}</p>`:'';}
function renderCurrentWeather(w){
 const weather=w.weather||{status:'unavailable',values:{}},air=w.air_quality||{status:'unavailable',values:{}};
 const v=weather.values||{},a=air.values||{};
 const applyTemp=Number.isFinite(v.temperature_2m)&&v.temperature_2m>=-30&&v.temperature_2m<=60;
 const applyHumidity=Number.isFinite(v.relative_humidity_2m);
 return `<section class="card padded-card soil-result weather-result"><div class="panel-heading"><div><div class="mini-label">OPEN-METEO · CURRENT MODEL ESTIMATES</div><h2>Weather & air quality</h2><p>Requested point ${coordinateLabel(w.latitude)}°, ${coordinateLabel(w.longitude)}° · ${w.cache==='cached'?'short-term cached response':'fresh provider request'}</p></div><button class="secondary-btn" data-action="use-weather" ${!applyTemp&&!applyHumidity?'disabled':''}>Use temperature / humidity ${ico('arrow')}</button></div>
 <div class="weather-section"><div class="weather-section-title"><div><h3>Weather</h3><span>Open-Meteo forecast · 2 m temperature / humidity; 10 m wind</span></div><span class="status-pill ${weather.status==='ok'?'':'status-partial'}">${weather.status==='ok'?'Available':weather.status==='partial'?'Partial':'Unavailable'}</span></div><div data-model-meta="weather">${modelMeta(weather,7200)}</div>
 <div class="stats-grid weather-grid">${weatherStat('Temperature',v.temperature_2m,'°C')}${weatherStat('Relative humidity',v.relative_humidity_2m,'%')}${weatherStat('Precipitation',v.precipitation,'mm',`Previous ${intervalLabel(weather.interval_seconds)}`)}${weatherStat('Wind speed',v.wind_speed_10m,'km/h')}${weatherStat('Wind direction',v.wind_direction_10m,'°','Direction wind comes from')}${weatherStat('Wind gust',v.wind_gusts_10m,'km/h')}</div>${modelIssues(weather)}</div>
 <div class="weather-section"><div class="weather-section-title"><div><h3>Air quality</h3><span>Open-Meteo / CAMS forecast · US AQI</span></div><span class="status-pill ${air.status==='ok'?'':'status-partial'}">${air.status==='ok'?'Available':air.status==='partial'?'Partial':'Unavailable'}</span></div><div data-model-meta="air">${modelMeta(air,21600)}</div>
 <div class="stats-grid air-grid">${weatherStat('US air quality index',a.us_aqi,'',aqiLabel(a.us_aqi))}${weatherStat('PM2.5',a.pm2_5,'μg/m³')}${weatherStat('PM10',a.pm10,'μg/m³')}</div>${modelIssues(air)}</div>
 <div class="notice warning" style="margin-top:14px">${ico('info')}<span>${esc(w.notice)} Air and weather can have different grid points, timestamps and update intervals. US AQI is a modeled index and can exceed 500; consult official local observations for health decisions. The button copies available temperature and humidity, clearing missing fields rather than retaining values from another point. It never fills annual rainfall from the short precipitation interval. Missing values are shown as —. Select Get weather &amp; air quality again to refresh; the age is for the model timestamp, not the forecast run.</span></div>
 <div class="weather-links"><a href="https://open-meteo.com/en/docs" target="_blank" rel="noopener noreferrer">Weather data & method ${ico('arrow-up')}</a><a href="https://open-meteo.com/en/docs/air-quality-api" target="_blank" rel="noopener noreferrer">Air quality data & method ${ico('arrow-up')}</a></div></section>`;
}
function renderLookupResult(){
 const el=$('#lookup-output');if(!el)return;
 const s=state.lookup.soil,w=state.lookup.weather;
 let html='';
 if(s){html+=`<section class="card padded-card soil-result"><div class="panel-heading"><div><div class="mini-label">${s.lookup_method==='wcs_fallback'?'OFFICIAL WCS FALLBACK':'LIVE SOILGRIDS ESTIMATE'} · ${esc(s.depth_cm||'0–5')} CM</div><h2>Your selected point</h2><p>${fmt(s.latitude)}°, ${fmt(s.longitude)}° · ${s.cache==='cached'?'cached response':'live response'}${s.retrieved_at?' · retrieved '+esc(formatDate(s.retrieved_at)):''}</p></div><button class="secondary-btn" data-action="use-live-soil">Use in profile ${ico('arrow')}</button></div><div class="stats-grid">${soilStats(s.values,s.intervals_90)}</div><div class="notice warning">${ico('info')}<span>${esc(s.notice)} Broad texture suggested by this app: <strong>${esc(SOIL_LABELS[s.texture_estimate]||'not available')}</strong> (a simple grouping, not a USDA classification). Missing values are shown as —. Where shown, the 90% prediction interval is a modelled uncertainty range, not a 90% or 99% accuracy guarantee; it is not used in crop scores.</span></div></section>`;}
 if(w)html+=renderCurrentWeather(w);
 else if(state.lookup.weatherError)html+=`<div class="notice warning weather-error" style="margin-top:16px" role="status">${ico('info')}<span><strong>Weather and air quality unavailable.</strong> ${esc(state.lookup.weatherError)} No values are substituted. Try the weather button again or use local observations.</span></div>`;
 el.innerHTML=html;
}
function renderSoil(){
 const l=state.lookup;
 app.innerHTML=pageHeading('EXPLORE THE WORLD BELOW','Global soil data.',`Look up a location or explore ${state.regions.length} attributed ISRIC SoilGrids point snapshots. Each estimate describes one modelled cell, not a whole region.`)+
 renderMapCard()+`<div class="data-intro"><section class="card lookup-card"><div class="mini-label">FIND A LOCATION</div><h2>Explore a place of your own.</h2><p>Search online for a place, or enter coordinates. The offline place-name index was omitted from this source export. Add a country or state to narrow online results.</p><div class="lookup-search"><div class="search-shell">${ico('search')}<input class="search-input" id="location-query" placeholder="City, town, region, country or coordinates" value="${esc(l.name)}" aria-label="Search worldwide places" maxlength="120"></div><button class="secondary-btn" data-action="search-location">Search</button></div><div id="location-results" aria-live="polite"></div><div id="location-selection"></div><p class="place-attribution">Places: <a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer">GeoNames</a> (CC BY 4.0), <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a> via Photon, and Open-Meteo. Online sources may be unavailable or incomplete.</p><div class="lookup-coords"><div class="field"><label for="lookup-lat">Latitude</label><input type="number" step="any" id="lookup-lat" placeholder="e.g. 17.68" value="${esc(l.lat)}"></div><div class="field"><label for="lookup-lon">Longitude</label><input type="number" step="any" id="lookup-lon" placeholder="e.g. 78.18" value="${esc(l.lon)}"></div></div><div class="field lookup-depth"><label for="lookup-depth">Soil depth</label><div class="input-wrap"><select id="lookup-depth">${SOIL_DEPTHS.map(d=>`<option value="${d}" ${d===l.depth?'selected':''}>${depthLabel(d)} cm${d==='0-5cm'?' · surface':''}</option>`).join('')}</select>${ico('chevron','icon trailing-icon')}</div></div><div class="lookup-actions"><button class="secondary-btn" data-action="locate-soil-coordinates">Show coordinates on map</button><button class="primary-btn" data-action="lookup-soil">${ico('globe')} Get soil estimate</button><button class="secondary-btn" data-action="lookup-weather">${ico('sun')} Get weather &amp; air quality</button></div><p class="field-hint lookup-message">Select a location, get a soil estimate, then choose “Use in profile.” Weather and air quality are separate Open-Meteo model estimates and may be unavailable independently. Live lookups need internet. ISRIC’s service may be paused or unavailable; an official WCS fallback can return limited data. Up to 5 provider requests/minute. Saved points work offline.</p></section>
 <aside class="soil-facts"><div class="mini-label">A NOTE ON YOUR DATA</div><h2>Useful insight, with room for uncertainty.</h2><p>SoilGrids models properties at approximately 250 m resolution for six soil depths. Predictions and their uncertainty are not a substitute for a laboratory test.</p><ul><li>${ico('check')} pH, texture and other properties, with 90% prediction intervals when available.</li><li>${ico('check')} Total nitrogen is not plant-available N.</li><li>${ico('check')} P and K are not provided by this source.</li></ul><a class="source-link" href="https://isric.org/explore/soilgrids" target="_blank" rel="noopener noreferrer">About SoilGrids ${ico('arrow-up')}</a></aside></div><div id="lookup-output"></div>
 <div class="snapshot-heading"><div class="mini-label">${state.regions.length} GLOBAL POINTS · STORED SNAPSHOTS</div><h2>A small window into our world.</h2><p>Each snapshot is one dated point from SoilGrids—not an average for its region. Select a point to add its available soil values to your profile.</p></div><div class="snapshot-grid">${state.regions.map(snapshotCard).join('')}</div><div class="notice" style="margin-top:15px">${ico('info')}<span>ISRIC SoilGrids 2.0 is CC BY 4.0. Poggio et al. (2021), SOIL 7, 217–240. Values are model predictions and may be missing, stale or spatially uncertain.</span></div>`;
 renderLocationResults();renderLookupResult();setTimeout(initializeFieldMap,0);
}
function readCoords(){const lat=$('#lookup-lat')?.value,lon=$('#lookup-lon')?.value;state.lookup.lat=lat;state.lookup.lon=lon;return {lat,lon};}
function invalidateLookup(kind){
 state.lookup.seq[kind]++;state.lookup[kind]=null;if(kind==='weather')state.lookup.weatherError='';
 const button=$(`[data-action="lookup-${kind}"]`);if(button?.disabled)setBusy(button,false);
}
async function searchLocation(button){
 const q=$('#location-query').value.trim();if(!q){toast('Enter a place name or coordinates.');return;}if(state.lookup.searchStatus==='searching'&&state.lookup.name===q)return;
 const seq=++state.lookup.searchSeq;state.lookup.name=q;state.lookup.results=[];state.lookup.searchStatus='searching';state.lookup.searchNotice='Searching worldwide places…';renderLocationResults();setBusy(button,true,'Searching…');
 const current=()=>state.lookup.searchSeq===seq && $('#location-query')?.value.trim()===q;
 try{
  const data=await api('/api/location/search?q='+encodeURIComponent(q));if(!current())return;
  const results=Array.isArray(data.results)?data.results.filter(x=>geoPoint({lat:x.latitude,lng:x.longitude})):[];state.lookup.results=results;state.lookup.searchStatus=data.search_status||'online';
  if(results.length&&data.search_status==='coordinates'){const x=results[0];setPoint({lat:x.latitude,lng:x.longitude},'manual','',14);state.lookup.results=[];state.lookup.searchNotice='Coordinates selected directly; verify the point before requesting soil.';state.lookup.searchStatus='idle';renderLocationResults();setBusy(button,false);return;}
  if(!results.length){
   state.lookup.searchNotice=state.lookup.searchStatus==='offline'?'Online place services could not be reached; the offline place index is not included in this source export. Enter field coordinates below or reconnect and search again.':'No verified match in the available place sources. Check the spelling or enter field coordinates below.';
  }else if(state.lookup.searchStatus==='offline')state.lookup.searchNotice='Showing offline GeoNames matches. More places may be available when online. Check each point.';
  else if(state.lookup.searchStatus==='partial')state.lookup.searchNotice='Some online place sources are unavailable. Showing matches from the available sources; check each point.';
  else state.lookup.searchNotice='Choose a match and check its location. Names can be similar in different places.';
  renderLocationResults();
 }catch(e){if(current()){state.lookup.results=[];state.lookup.searchStatus='error';state.lookup.searchNotice='Place search is temporarily unavailable. Enter field coordinates below.';renderLocationResults();}}
 finally{if(current())setBusy(button,false);}
}
async function lookup(kind,button){
 const {lat,lon}=readCoords(),depth=state.lookup.depth;
 // A sequence number also catches A → B → A changes while a request is in flight.
 state.lookup[kind]=null;if(kind==='weather')state.lookup.weatherError='';const seq=++state.lookup.seq[kind];renderLookupResult();
 if(lat===''||lon===''){toast('Enter both latitude and longitude first.');return;}setBusy(button,true,kind==='soil'?'Fetching soil…':'Fetching weather & air…');
 const current=()=>state.lookup.seq[kind]===seq && String(state.lookup.lat)===String(lat) && String(state.lookup.lon)===String(lon) && (kind!=='soil'||state.lookup.depth===depth);
 try{
  const params=new URLSearchParams({lat,lon});if(kind==='soil')params.set('depth',depth);
  const data=await api(`/api/${kind}?${params}`);
  if(!current())return;
  state.lookup[kind]=data;if(kind==='weather')state.lookup.weatherReceived=performance.now();renderLookupResult();$('#lookup-output')?.scrollIntoView({block:'start',behavior:'smooth'});
 }
 catch(e){
  if(current()){
   if(kind==='weather'){state.lookup.weatherError=e.message;renderLookupResult();}
   toast(kind==='soil'&&e.status===502?'Live SoilGrids is unavailable. Use a saved point below or enter soil values manually.':e.message);
  }
 }finally{if(current())setBusy(button,false);}
}
function useSoil(r,source){
 const values=r.values,texture=r.texture_estimate||broadTexture(values);
 if(values.phh2o==null && !texture){toast('This point has no pH or texture values to use.');return;}
 const old=state.profile,changed=old.latitude==null||old.longitude==null||Math.abs(old.latitude-r.latitude)>0.000001||Math.abs(old.longitude-r.longitude)>0.000001;
 if(changed){const cleared=old.weather_source==='open_meteo_current';if(cleared){old.temperature=null;old.humidity=null;old.weather_source='manual';old.weather_time='';old.weather_location='';}state.mapLocationWarning=cleared?'Soil location changed; prior modelled current weather was cleared. Verify remaining field inputs.':'Soil location changed; existing field name, climate and nutrients were retained. Verify they belong to this field.';}
 // Never silently reuse a prior field's pH or texture for a newly selected
 // point when the provider returned only a partial result.
 state.profile.ph=values.phh2o!=null?values.phh2o:null;
 state.profile.soil_type=texture||'';
 state.profile.latitude=r.latitude;state.profile.longitude=r.longitude;
 state.profile.location=r.region?`${r.region}, ${r.country}`:`Point ${fmt(r.latitude)}°, ${fmt(r.longitude)}°`;
 state.profile.soil_retrieved_at=r.retrieved_at||'';
 const depth=r.depth || `${String(r.depth_cm||'0–5').replace('–','-')}cm`;
 state.profile.soil_depth=SOIL_DEPTHS.includes(depth)?depth:'0-5cm';
 state.profile.soil_method=source==='soilgrids_snapshot'?'snapshot':r.lookup_method==='wcs_fallback'?'wcs_fallback':'rest';
 const range=r.intervals_90?.phh2o;
 state.profile.soil_ph_interval_90=range && range.lower!=null && range.upper!=null?{lower:range.lower,upper:range.upper}:null;
 state.profile.source=source;state.profile.name=state.profile.name||state.profile.location;alignMapToProfile(state.profile);fieldMapState.soilOnly=false;fieldMapState.analysisBackup=null;saveMapSelection();
 navigate('analysis');toast('Available soil values added. Check for missing fields and complete the climate.');
 setTimeout(()=>$('#profile-start')?.scrollIntoView({block:'start',behavior:'smooth'}),100);
}
function renderMethod(){
 app.innerHTML=pageHeading('OPEN BY DESIGN','A little clarity on the method.','A screening tool should explain what it knows, what it assumes, and what it leaves out.')+
 `<div class="notice warning" style="margin-bottom:16px">${ico('info')}<span>TerraField is a student prototype. It is <strong>not</strong> a scientifically validated agronomic model or a replacement for a local soil test and expert advice.</span></div><div class="method-grid">
 <section class="card method-card"><div class="mini-label">01 / THE INDEX</div><h3>How the ranking works</h3><p>For each crop, pH, temperature and annual rainfall are compared with ECOCROP optimal and absolute ranges. A factor gets 100 within the optimal range, declines linearly toward the absolute boundary, and is 0 outside it. The weighted average is rounded to a 0–100 index.</p><p>If any of those three factors falls outside its ECOCROP absolute range, the overall score is capped at 50. Ties are sorted alphabetically. This is our simplified rule engine—not the FAO ECOCROP model.</p><div class="weight-row"><span>Soil pH</span><div class="score-track"><div class="score-fill" style="width:100%"></div></div><strong>30</strong></div><div class="weight-row"><span>Temperature</span><div class="score-track"><div class="score-fill" style="width:83%"></div></div><strong>25</strong></div><div class="weight-row"><span>Annual rainfall</span><div class="score-track"><div class="score-fill" style="width:83%"></div></div><strong>25</strong></div><div class="weight-row"><span>Texture</span><div class="score-track"><div class="score-fill" style="width:33%"></div></div><strong>10</strong></div><div class="weight-row"><span>Humidity</span><div class="score-track"><div class="score-fill" style="width:17%"></div></div><strong>5</strong></div><div class="weight-row"><span>Season</span><div class="score-track"><div class="score-fill" style="width:17%"></div></div><strong>5</strong></div><p>Weights are illustrative. Missing humidity, unknown season and unavailable crop texture ranges are omitted; weights are renormalised. Therefore different crops can use different denominators.</p></section>
 <section class="card method-card"><div class="mini-label">02 / ASSUMPTIONS</div><h3>What’s included—and what isn’t</h3><ul><li>Our broad texture mapping groups sandy soils as light, loamy/silty as medium and clayey as heavy. Live fractions use a simple rule, not a USDA texture triangle.</li><li>Humidity bands and season tags are illustrative prototype heuristics, not FAO ranges. “Warm / wet” and similar categories do not replace a local planting calendar.</li><li>N, P and K lab entries are recorded, but <strong>not scored</strong>; soil-test methods and plant availability differ. No fertilizer doses are prescribed.</li><li>Annual rainfall is a rough climate descriptor—not crop-cycle water supply or irrigation demand. Current weather, if used, is not a growing-season average.</li><li>Effective rooting depth, salinity, drainage, irrigation, pests, prices, local cultivars, frost and many other factors are not scored.</li></ul><p>A 100 index means all included rules matched; it is not a 100% chance of success. No model evaluation against labelled crop outcomes has been performed.</p></section>
 <section class="card method-card wide"><div class="mini-label">03 / DATA SOURCES</div><h3>Grounded in public data, with attribution.</h3><p><strong>Crop ranges:</strong> FAO ECOCROP, selected crop environmental ranges; <a href="https://gaez.fao.org/pages/ecocrop" target="_blank" rel="noopener noreferrer">FAO ECOCROP</a> and <a href="https://data.apps.fao.org/catalog/dataset/ecocrop" target="_blank" rel="noopener noreferrer">dataset catalogue</a>. The included subset is adapted from the <a href="https://github.com/OpenCLIM/ecocrop" target="_blank" rel="noopener noreferrer">OpenCLIM ECOCROP mirror</a>. ECOCROP dataset catalogue: CC BY 4.0.</p><p><strong>Soil data:</strong> ISRIC SoilGrids 2.0, 250 m mean predictions for six depths (snapshots: 0–5 cm). Where available, Q0.05–Q0.95 is a modelled 90% prediction interval, not an accuracy guarantee; <a href="https://isric.org/explore/soilgrids" target="_blank" rel="noopener noreferrer">ISRIC SoilGrids</a>. Poggio et al., “SoilGrids 2.0: producing soil information for the globe with quantified spatial uncertainty,” SOIL 7, 217–240 (2021), <a href="https://doi.org/10.5194/soil-7-217-2021" target="_blank" rel="noopener noreferrer">doi:10.5194/soil-7-217-2021</a>. CC BY 4.0. The live REST service can be unavailable; the official WCS fallback provides limited properties and no intervals. Snapshot dates are shown on each card.</p><p><strong>Place search:</strong> the offline GeoNames index was omitted from this source export. Online Photon data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a> (ODbL) and <a href="https://open-meteo.com/en/docs/geocoding-api" target="_blank" rel="noopener noreferrer">Open-Meteo</a>. No source covers every place or spelling; coordinates can be approximate.</p><p><strong>Weather and air:</strong> <a href="https://open-meteo.com/en/docs" target="_blank" rel="noopener noreferrer">Open-Meteo weather</a> and <a href="https://open-meteo.com/en/docs/air-quality-api" target="_blank" rel="noopener noreferrer">Open-Meteo / CAMS air-quality</a> are modeled, not on-site measurements. Timestamps and grids differ, and current conditions are not seasonal averages. Short-interval precipitation is never used as annual rain. The free API is for non-commercial use.</p><p><strong>Plant library:</strong> a historical, incomplete FAO ECOCROP reference subset adapted from <a href="https://github.com/OpenCLIM/ecocrop" target="_blank" rel="noopener noreferrer">OpenCLIM</a> and <a href="https://github.com/supersistence/EcoCrop-ScrapeR" target="_blank" rel="noopener noreferrer">EcoCrop-ScrapeR</a> use records. Entries without documented use and source-labelled weeds without a direct use are excluded. Useful plants that the source also labels weeds are hidden by default and flagged if shown; some other plants may still be invasive or toxic. Only 21 separately profiled crops are scored. Verify identification, uses, laws and local suitability.</p><p><strong>Design assets:</strong> AI-generated field photograph. DM Sans and DM Serif Display fonts are used under the SIL Open Font License.</p></section></div>`;
}

// Event delegation keeps every view functional without a client-side framework.
document.addEventListener('click',async e=>{
 const nav=e.target.closest('[data-nav]');if(nav){e.preventDefault();if(nav.dataset.nav==='reports')await refreshReports();navigate(nav.dataset.nav);return;}
 const ex=e.target.closest('[data-example]');if(ex){const example=state.examples.find(x=>x.id===ex.dataset.example);if(example){discardMapSelection();state.mapLocationWarning='';state.profile={...emptyProfile(),...example.profile,illustrative:true};renderAnalysis();toast('Example loaded. These values are illustrative, not measurements.');}return;}
 const crop=e.target.closest('[data-crop]');if(crop){openCrop(crop.dataset.crop);return;}
 const plant=e.target.closest('[data-plant]');if(plant){showCataloguePlant(plant.dataset.plant);return;}
 const region=e.target.closest('[data-use-region]');if(region){const r=state.regions.find(x=>x.id===region.dataset.useRegion);if(r)useSoil(r,'soilgrids_snapshot');return;}
 const locationEl=e.target.closest('[data-location-index]');if(locationEl){const x=state.lookup.results[Number(locationEl.dataset.locationIndex)];if(x&&geoPoint({lat:x.latitude,lng:x.longitude})){const name=[x.name,x.county,x.region,x.country].filter((v,i,a)=>v&&a.indexOf(v)===i).join(', ');const zoom=x.kind==='country'?5:x.kind==='region'?7:x.kind==='district'?10:x.kind==='address / feature'?16:12;setPoint({lat:x.latitude,lng:x.longitude},'search',name,zoom);state.lookup.results=[];state.lookup.searchNotice='';state.lookup.searchStatus='idle';state.lookup.searchSeq++;renderLocationResults();toast('Reference point selected. Check the coordinates for your field.');}return;}
 const reportOpen=e.target.closest('[data-report-open]');if(reportOpen){try{const r=await api('/api/reports/'+reportOpen.dataset.reportOpen);state.result=r.result;state.resultField=r.field;resetAdvisorContext();state.resultAt=r.created_at;state.profile={...r.profile};setMapFromReport(state.profile,'report',r.field);state.mapLocationWarning='';state.reportId=r.id;state.compareA=r.result.rankings[0]?.id||'';state.compareB=r.result.rankings[1]?.id||'';state.showAll=false;navigate('results');}catch(err){toast(err.message);}return;}
 const reportRename=e.target.closest('[data-report-rename]');if(reportRename){const r=state.reports.find(x=>x.id===reportRename.dataset.reportRename);const title=prompt('Rename this report:',r?.title||'');if(title===null)return;try{await api('/api/reports/'+reportRename.dataset.reportRename,{method:'PATCH',body:{title}});await refreshReports();renderReports();toast('Report renamed.');}catch(err){toast(err.message);}return;}
 const reportDelete=e.target.closest('[data-report-delete]');if(reportDelete){if(!confirm('Delete this saved report? This cannot be undone.'))return;try{await api('/api/reports/'+reportDelete.dataset.reportDelete,{method:'DELETE'});await refreshReports();renderReports();toast('Report deleted.');}catch(err){toast(err.message);}return;}
 const action=e.target.closest('[data-action]');if(!action)return;
 switch(action.dataset.action){
  case 'scroll-form':$('#profile-start')?.scrollIntoView({block:'start',behavior:'smooth'});break;
  case 'reset-profile':if(confirm('Clear all field inputs? Saved reports will not be affected.')){discardMapSelection();state.mapLocationWarning='';state.profile=emptyProfile();renderAnalysis();toast('Field inputs cleared.');}break;
  case 'confirm-seasonal':state.profile.weather_source='manual';state.profile.weather_time='';state.profile.weather_location='';$('.weather-source-tag')?.remove();toast('Seasonal climate values marked as checked.');break;
  case 'toggle-examples':{const menu=$('#example-menu');menu.hidden=!menu.hidden;action.setAttribute('aria-expanded',String(!menu.hidden));break;}
  case 'toggle-all':state.showAll=!state.showAll;renderResults();break;
  case 'more-plants':state.plantLimit+=24;updateCropGrid();break;
  case 'retry-plants':state.plantError='';renderCrops();break;
  case 'retry-reports':await refreshReports();renderReports();break;
  case 'save-report':await saveReport(action);break;
  case 'export-csv':exportReportCSV();break;
  case 'print':{const previous=state.showAll;state.showAll=true;renderResults();const ds=$$('.rank-more');ds.forEach(d=>d.open=true);window.print();state.showAll=previous;renderResults();break;}
  case 'close-modal':$('#modal').close();break;
  case 'search-location':await searchLocation(action);break;
  case 'locate-soil-coordinates':{const {lat,lon}=readCoords();if(lat===''||lon===''||!geoPoint({lat:Number(lat),lng:Number(lon)})){toast('Enter latitude −90 to 90 and longitude −180 to 180.');break;}setPoint({lat:Number(lat),lng:Number(lon)},'manual','',14);document.getElementById('field-map')?.scrollIntoView({block:'center',behavior:'smooth'});break;}
  case 'lookup-soil':await lookup('soil',action);break;
  case 'lookup-weather':await lookup('weather',action);break;
  case 'use-live-soil':if(state.lookup.soil)useSoil(state.lookup.soil,'soilgrids_live');break;
  case 'use-weather':{
   const w=state.lookup.weather,s=w?.weather;if(!s||s.status==='unavailable')return;
   const t=s.values.temperature_2m,h=s.values.relative_humidity_2m;
   const validTemp=Number.isFinite(t)&&t>=-30&&t<=60,validHumidity=Number.isFinite(h)&&h>=0&&h<=100;
   if(!validTemp&&!validHumidity){toast('No temperature or humidity values are available for the profile.');return;}
   // Clear missing values rather than silently carrying over a different field's climate.
   state.profile.temperature=validTemp?t:null;state.profile.humidity=validHumidity?h:null;
   state.profile.weather_location=`Point ${fmt(w.latitude)}°, ${fmt(w.longitude)}°`;
   if(state.profile.latitude===null && state.profile.longitude===null){state.profile.latitude=w.latitude;state.profile.longitude=w.longitude;state.profile.location=state.profile.weather_location;}
   if(Math.abs(state.profile.latitude-w.latitude)>0.000001||Math.abs(state.profile.longitude-w.longitude)>0.000001)state.mapLocationWarning='The imported weather point differs from the selected field coordinates. Verify that the weather is appropriate for this field.';
   state.profile.weather_source='open_meteo_current';state.profile.weather_time=`${s.time} ${s.timezone}`;alignMapToProfile(state.profile);fieldMapState.soilOnly=false;fieldMapState.analysisBackup=null;saveMapSelection();
   navigate('analysis');toast('Available current weather added. Check growing-season averages and missing fields.');setTimeout(()=>$('#profile-start')?.scrollIntoView({block:'start',behavior:'smooth'}),100);break;
  }
 }
});
document.addEventListener('submit',e=>{if(e.target.id==='profile-form'){e.preventDefault();recommend(e.target);}});
document.addEventListener('input',e=>{
 if(e.target.closest('#profile-form'))setProfileFromInput(e.target);
 if(e.target.id==='crop-search'){state.search=e.target.value;state.plantLimit=24;updateCropGrid();}
 if(e.target.id==='location-query'){
  state.lookup.name=e.target.value;state.lookup.searchSeq++;state.lookup.results=[];state.lookup.searchStatus='idle';state.lookup.searchNotice='';
  const button=$('[data-action="search-location"]');if(button?.disabled)setBusy(button,false);renderLocationResults();
 }
 // A result belongs to its original coordinates, even before a new lookup.
 if(e.target.id==='lookup-lat'||e.target.id==='lookup-lon'){
  state.lookup.lat=$('#lookup-lat')?.value??'';state.lookup.lon=$('#lookup-lon')?.value??'';state.lookup.selection=null;renderLocationResults();
  invalidateLookup('soil');invalidateLookup('weather');renderLookupResult();
 }
});
document.addEventListener('change',e=>{
 if(e.target.id==='plant-filter'){state.plantFilter=e.target.value;state.plantLimit=24;updateCropGrid();}
 if(e.target.id==='hide-source-weeds'){state.hideSourceWeeds=e.target.checked;state.plantLimit=24;updateCropGrid();}
 if(e.target.id==='lookup-depth'){state.lookup.depth=e.target.value;invalidateLookup('soil');renderLookupResult();}
 if(e.target.id==='compare-a'||e.target.id==='compare-b'){if(e.target.id==='compare-a')state.compareA=e.target.value;else state.compareB=e.target.value;$('#comparison').innerHTML=compareHtml();$('#compare-a').value=state.compareA;$('#compare-b').value=state.compareB;}
});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='location-query'){e.preventDefault();searchLocation($('[data-action="search-location"]'));}if(e.key==='Escape'){$('#example-menu')?.setAttribute('hidden','');$('#sidebar').classList.remove('open');}});
$('#mobile-menu').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
window.addEventListener('hashchange',()=>{const view=location.hash.slice(1);if(['analysis','reports','crops','soil','method','results','advisor'].includes(view))navigate(view,false);});
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal'))$('#modal').close()});
// Update only age/provenance labels once a minute. Values refresh on request;
// leaving the page open must not freeze a "recent" label indefinitely.
setInterval(()=>{
 const w=state.lookup.weather;if(state.view!=='soil'||!w)return;
 const weather=$('[data-model-meta="weather"]'),air=$('[data-model-meta="air"]');
 if(weather)weather.innerHTML=modelMeta(w.weather,7200);
 if(air)air.innerHTML=modelMeta(w.air_quality,21600);
},60000);

async function boot(){
 try{const [c,e,r]=await Promise.all([api('/api/crops'),api('/api/examples'),api('/api/regions')]);state.crops=c.crops;state.examples=e.examples;state.regions=r.regions;await refreshReports();const view=location.hash.slice(1);navigate(['analysis','reports','crops','soil','method','advisor'].includes(view)?view:'analysis',false);}
 catch(err){app.innerHTML=`<section class="card empty-state"><div class="empty-illustration">${ico('info')}</div><h3>Couldn’t reach the workspace.</h3><p>${esc(err.message)} Make sure the backend is running, then refresh.</p><button class="primary-btn" id="retry-boot">Try again</button></section>`;$('#retry-boot').addEventListener('click',boot);}
}
boot();
