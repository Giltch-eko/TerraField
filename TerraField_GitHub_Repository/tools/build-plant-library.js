'use strict';
// Build the offline, informational ECOCROP catalogue with no dependencies.
// Sources, licensing, exclusion criteria and checksums: docs/DATA_SOURCES.md.
// node tools/build-plant-library.js [--check]
const fs=require('node:fs');
const path=require('node:path');
const zlib=require('node:zlib');
const crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..');
const data=path.join(ROOT,'server','data');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function readSource(file,expected) {
  const bytes=zlib.gunzipSync(fs.readFileSync(path.join(data,'source',file)));
  if(sha(bytes)!==expected) throw new Error(`Checksum mismatch in ${file}`);
  return bytes;
}
// RFC 4180-style parser supporting quoted commas, CRLF, embedded newlines and
// doubled quotes. Reject broken/mismatched rows rather than shifting fields.
function csv(text) {
  const rows=[];let fields=[],field='',quoted=false,closed=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(quoted) {
      if(c==='"' && text[i+1]==='"'){field+='"';i++;}
      else if(c==='"'){quoted=false;closed=true;}
      else field+=c;
    } else if(c==='"' && field==='' && !closed) quoted=true;
    else if(c===',' || c==='\n' || c==='\r') {
      fields.push(field);field='';closed=false;
      if(c!==',') {
        if(c==='\r'&&text[i+1]==='\n')i++;
        if(fields.length>1 || fields[0]!=='') rows.push(fields);
        fields=[];
      }
    } else {
      if(closed) throw new Error('Unexpected content after quoted CSV field');
      field+=c;
    }
  }
  if(quoted) throw new Error('Unclosed CSV quote');
  if(field!==''||fields.length){fields.push(field);rows.push(fields);}
  const header=rows.shift().map(x=>x.replace(/^\ufeff/,''));
  return rows.map((row,i)=>{
    if(row.length!==header.length) throw new Error(`CSV row ${i+2}: ${row.length} fields, expected ${header.length}`);
    return Object.fromEntries(header.map((h,j)=>[h,row[j]]));
  });
}
const specs={
  'food & beverage':['food','Food & beverage'],
  'food additive':['food','Food additive'],
  'animal food (feed)':['feed','Animal feed'],
  material:['materials','Materials'],
  fuels:['fuel','Fuel'],
  environmental:['environment','Environmental'],
  medicinal:['medicine','Medicinal'],
  'non-vertebrate food':['other','Non-vertebrate food'],
  social:['other','Cultural / social']
};
const clean=s=>String(s??'').replace(/\s+/g,' ').trim();
const list=s=>[...new Set(clean(s).split(/\s*,\s*/).map(clean).filter(x=>x&&x!=='NA'))];
function band(row,cols,min,max) {
  const numbers=cols.map(k=>{
    const value=clean(row[k]);
    return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)?Number(value):null;
  });
  if(numbers.some(n=>n===null||!Number.isFinite(n)||n<min||n>max)) return null;
  const [absMin,optMin,optMax,absMax]=numbers;
  if(!(absMin<=optMin&&optMin<=optMax&&optMax<=absMax)) return null;
  return {optimal:[optMin,optMax],absolute:[absMin,absMax]};
}
const crops=csv(new TextDecoder('windows-1252').decode(readSource('ecocrop-openclim.csv.gz','4187e8846336e185c4583165211c5981855e95adfbefd897bd2bd481de48d106')));
const uses=csv(new TextDecoder('utf-8',{fatal:true}).decode(readSource('ecocrop-uses-2017.csv.gz','03afa068e7ce3bf559a2e1f716678580b9ad76d217fd8552ef3c000967e1e256')));
const scored=JSON.parse(fs.readFileSync(path.join(data,'crops.json'),'utf8'));
const scoredByEco=new Map(scored.map(x=>[String(x.ecocrop_id),x]));
const useByEco=new Map();
for(const row of uses) {
  const id=clean(row.crop_code),main=clean(row['Main use']);
  if(!/^\d+$/.test(id)||(!Object.hasOwn(specs,main)&&main!=='poison')) continue;
  if(!useByEco.has(id)) useByEco.set(id,[]);
  useByEco.get(id).push(row);
}
const plants=[];let excludedWeedOnly=0,excludedNoUse=0,excludedPoisonOnly=0,categoryFallback=0;
const allIds=new Set();
for(const row of crops) {
  const id=clean(row.EcoPortCode),scientific=clean(row.ScientificName);
  if(!/^\d+$/.test(id)||!scientific||allIds.has(id)) throw new Error(`Invalid/duplicate ECOCROP ID ${id}`);
  allIds.add(id);
  const categories=list(row.CAT), found=useByEco.get(id)||[];
  // Weed status is context-dependent. Keep source-flagged species only if
  // the source also records a direct food, feed, material, fuel or medicinal
  // purpose. Such records are marked and hidden by default in the UI, because
  // some are invasive locally. Weed-labelled environmental-only entries are
  // excluded. This avoids silently omitting useful crops such as guava/basil.
  const sourceWeedLabel=categories.some(x=>x.toLowerCase()==='weed');
  let documented=found.filter(x=>Object.hasOwn(specs,clean(x['Main use'])));
  let evidence='use_table';
  // The source has one plant (Passiflora edulis) whose explicit use rows are
  // absent but whose crop category documents fruit/nut and ornamental use.
  if(!documented.length&&categories.some(c=>c.toLowerCase()==='fruits & nuts')) {
    documented=[{'Main use':'food & beverage','Detailed use':'fruit or nut crop category','Used part':''}];
    evidence='crop_category';categoryFallback++;
  }
  if(!documented.length) {
    if(found.some(x=>clean(x['Main use'])==='poison'))excludedPoisonOnly++;
    else excludedNoUse++;
    continue;
  }
  const directUses=new Set(['food & beverage','food additive','animal food (feed)','material','fuels','medicinal']);
  if(sourceWeedLabel&&!documented.some(x=>directUses.has(clean(x['Main use'])))){excludedWeedOnly++;continue;}
  const details=[],seen=new Set(),purposes=new Set();
  for(const u of documented) {
    const [purpose,label]=specs[clean(u['Main use'])];
    purposes.add(purpose);
    const detail=clean(u['Detailed use']),part=clean(u['Used part']);
    const key=[label,detail,part].join('\0');
    if(!seen.has(key)){details.push({use:label,detail,part});seen.add(key);}
  }
  // The source's nutmeg common-name field starts with an HTML-marked heading,
  // not a plant name. Omit markup-bearing alias fragments rather than display
  // the heading or guess a replacement; the next source alias is "nutmeg".
  const aliases=list(row.COMNAME).filter(x=>!/[<>]/.test(x)), recommended=scoredByEco.get(id);
  const ranges={
    ph:band(row,['PHMIN','PHOPMN','PHOPMX','PHMAX'],0,14),
    temperature:band(row,['TMIN','TOPMN','TOPMX','TMAX'],-100,70),
    rainfall:band(row,['RMIN','ROPMN','ROPMX','RMAX'],0,20000)
  };
  plants.push({
    id:'ecocrop-'+id,ecocrop_id:Number(id),
    name:recommended?.name||aliases[0]||scientific,scientific_name:scientific,
    aliases,synonyms:list(row.SYNO),life_forms:list(row.LIFO),lifespan:clean(row.LISPA).replace(/^NA$/,''),
    categories,purposes:[...purposes],uses:details,evidence,source_weed_label:sourceWeedLabel,
    poison_use_recorded:found.some(x=>clean(x['Main use'])==='poison'),
    ranges,screened_crop_id:recommended?.id||null,
    source_url:`https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=${id}`
  });
}
// Unicode code-point order is deterministic across platforms and ICU builds.
plants.sort((a,b)=>{const x=a.name.toLowerCase(),y=b.name.toLowerCase();return x<y?-1:x>y?1:a.ecocrop_id-b.ecocrop_id;});
if(scored.some(c=>!plants.some(p=>p.screened_crop_id===c.id))) throw new Error('A screened crop is missing from the informational library');
const document={
  metadata:{
    title:'TerraField useful plant reference library',retrieved_on:'2026-10-29',
    count:plants.length,scored_count:scored.length,
    default_count:plants.filter(p=>!p.source_weed_label).length,
    source_weed_with_use_count:plants.filter(p=>p.source_weed_label).length,
    tree_count:plants.filter(p=>p.life_forms.some(x=>x.toLowerCase()==='tree')).length,
    default_tree_count:plants.filter(p=>!p.source_weed_label&&p.life_forms.some(x=>x.toLowerCase()==='tree')).length,
    exclusions:{source_records:crops.length,weed_environment_only:excludedWeedOnly,no_documented_use:excludedNoUse,poison_only:excludedPoisonOnly,category_only:categoryFallback},
    source:'FAO ECOCROP, adapted from OpenCLIM and EcoCrop-ScrapeR mirrors',
    source_url:'https://data.apps.fao.org/catalog/dataset/ecocrop',license:'CC BY 4.0 (FAO catalogue)',
    notice:'Historical, incomplete reference records—not a safety, invasiveness, suitability or medical assessment. Only the separate 21-crop subset is scored.'
  },plants
};
const output=JSON.stringify(document)+'\n';
const target=path.join(data,'plant-library.json');
if(process.argv.includes('--check')) {
  if(fs.readFileSync(target,'utf8')!==output) throw new Error('Plant library is not reproducible from the pinned sources');
  console.log(`Verified ${plants.length} records from pinned ECOCROP sources.`);
} else {
  fs.writeFileSync(target,output,'utf8');
  console.log(JSON.stringify(document.metadata,null,2));
}
