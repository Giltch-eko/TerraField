'use strict';
// TerraField's transparent screening rules, ported to JavaScript from the
// original Python implementation. This is not the FAO ECOCROP model.
const fs = require('node:fs');
const path = require('node:path');
const dataDir = path.join(__dirname, '..', 'server', 'data');
const load = name => JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf8'));
const CROPS = load('crops.json');
const EXAMPLES = load('examples.json');
const REGIONS = load('regions.json');

const SOIL_GROUPS = Object.freeze({
  sandy: ['Sandy', 'light'], sandy_loam: ['Sandy loam', 'light'],
  loamy: ['Loamy', 'medium'], silty: ['Silty', 'medium'],
  clay_loam: ['Clay loam', 'medium'], clayey: ['Clayey', 'heavy']
});
const SEASONS = Object.freeze({wet: 'Warm / wet', cool: 'Cool / dry', dry: 'Warm / dry', unknown: 'Not sure'});
const SOURCE_TYPES = new Set(['manual', 'example', 'soilgrids_live', 'soilgrids_snapshot']);
const SOIL_DEPTHS = Object.freeze(['0-5cm','5-15cm','15-30cm','30-60cm','60-100cm','100-200cm']);
const soilDepthLabel = depth => (depth || '0-5cm').replace('cm','').replace('-','–');
const NUMERIC = {
  ph: [0, 14, true, 'Soil pH'], rainfall: [0, 10000, true, 'Annual rainfall'],
  temperature: [-30, 60, true, 'Growing-season temperature'], humidity: [0, 100, false, 'Relative humidity'],
  nitrogen: [0, 5000, false, 'Available nitrogen'], phosphorus: [0, 5000, false, 'Available phosphorus'],
  potassium: [0, 5000, false, 'Available potassium']
};
const WEIGHTS = {ph: 30, temperature: 25, rainfall: 25, texture: 10, humidity: 5, season: 5};
const ADVISORY = 'Advisory only: these are screening scores, not yield predictions or guaranteed suitability. ' +
  'Results depend on the quality of inputs, local varieties, irrigation, soil depth, salinity, ' +
  'pests and other conditions not evaluated. Consult a local agricultural expert before high-impact decisions.';

class ValidationError extends Error {
  constructor(fields) { super('Please correct the highlighted fields.'); this.fields = fields; }
}

// Round an IEEE-754 value to nearest with ties to even, matching Python's
// round() including decimal rounding of the actual binary representation.
function pyRound(value, digits = 0) {
  if (!Number.isFinite(value) || value === 0) return value;
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, Math.abs(value), false);
  const bits = view.getBigUint64(0, false);
  const exp = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & ((1n << 52n) - 1n);
  const sig = exp === 0 ? fraction : (1n << 52n) | fraction;
  const exponent = exp === 0 ? -1074 : exp - 1023 - 52;
  let scaled = sig * (10n ** BigInt(digits));
  let q;
  if (exponent >= 0) {
    q = scaled << BigInt(exponent);
  } else {
    const divisor = 1n << BigInt(-exponent);
    q = scaled / divisor;
    const twice = (scaled % divisor) * 2n;
    if (twice > divisor || (twice === divisor && q % 2n !== 0n)) q += 1n;
  }
  const result = Number(q) / (10 ** digits);
  return value < 0 ? -result : result;
}
function displayNumber(value) {
  if (Number.isInteger(value)) return String(value);
  const rounded = pyRound(value, 1);
  return Number.isInteger(rounded) ? `${rounded}.0` : String(rounded);
}
function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const s = value.trim();
  // Decimal notation, including scientific notation, not hexadecimal/booleans.
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function has(obj, key) { return typeof key === 'string' && Object.hasOwn(obj, key); }

function validateProfile(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ValidationError({profile: 'A profile object is required.'});
  }
  const errors = {}, clean = {};
  let name = payload.name ?? '';
  if (typeof name !== 'string' || [...name.trim()].length > 80) errors.name = 'Use a name of at most 80 characters.';
  else clean.name = name.trim();
  if (!has(SOIL_GROUPS, payload.soil_type)) errors.soil_type = 'Choose a soil texture.';
  else clean.soil_type = payload.soil_type;
  if (!has(SEASONS, payload.season)) errors.season = 'Choose a season or Not sure.';
  else clean.season = payload.season;
  const source = payload.source === undefined ? 'manual' : payload.source;
  clean.source = SOURCE_TYPES.has(source) ? source : 'manual';
  clean.illustrative = payload.illustrative === true || source === 'example';
  const depth=payload.soil_depth;
  // Older SoilGrids reports predate this field and always used the 0–5 cm layer.
  if(depth===undefined || depth===null || depth==='') clean.soil_depth=clean.source.startsWith('soilgrids')?'0-5cm':'';
  else if(SOIL_DEPTHS.includes(depth)) clean.soil_depth=depth;
  else errors.soil_depth='Choose a supported SoilGrids depth.';
  const method=payload.soil_method;
  if(method===undefined || method===null || method==='') clean.soil_method=clean.source==='soilgrids_snapshot'?'snapshot':clean.source==='soilgrids_live'?'rest':'';
  else if(['rest','wcs_fallback','snapshot'].includes(method)) clean.soil_method=method;
  else errors.soil_method='Invalid SoilGrids lookup method.';
  const interval=payload.soil_ph_interval_90;
  clean.soil_ph_interval_90=null;
  if(interval!==undefined && interval!==null) {
    const lo=toNumber(interval?.lower),hi=toNumber(interval?.upper);
    if(!interval || typeof interval!=='object' || Array.isArray(interval) || lo===null || hi===null || lo<0 || hi>14 || lo>hi) errors.soil_ph_interval_90='Invalid SoilGrids pH prediction interval.';
    else clean.soil_ph_interval_90={lower:pyRound(lo,2),upper:pyRound(hi,2)};
  }
  for (const [key, [lo, hi, required, label]] of Object.entries(NUMERIC)) {
    const val = payload[key];
    if (val === null || val === undefined || val === '') {
      if (required) errors[key] = `${label} is required.`;
      clean[key] = null;
      continue;
    }
    const n = toNumber(val);
    if (n === null || n < lo || n > hi) errors[key] = `${label} must be a number from ${lo} to ${hi}.`;
    else clean[key] = pyRound(n, 3);
  }
  for (const [key, lo, hi] of [['latitude', -90, 90], ['longitude', -180, 180]]) {
    const val = payload[key];
    if (val === null || val === undefined || val === '') { clean[key] = null; continue; }
    const n = toNumber(val);
    if (n === null || n < lo || n > hi) errors[key] = `${key[0].toUpperCase() + key.slice(1)} must be between ${lo} and ${hi}.`;
    else clean[key] = pyRound(n, 6);
  }
  if ((clean.latitude == null) !== (clean.longitude == null)) errors.latitude = 'Enter both latitude and longitude, or leave both blank.';
  let location = payload.location ?? '';
  if (typeof location !== 'string' || [...location.trim()].length > 120) errors.location = 'Use a location under 120 characters.';
  else clean.location = location.trim();
  const weatherSource = payload.weather_source === undefined ? 'manual' : payload.weather_source;
  clean.weather_source = ['manual', 'open_meteo_current'].includes(weatherSource) ? weatherSource : 'manual';
  for (const [key, max] of [['weather_time',60], ['weather_location',120], ['soil_retrieved_at',60]]) {
    clean[key] = typeof payload[key] === 'string' ? [...payload[key]].slice(0,max).join('') : '';
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return clean;
}
function rangeScore(value, band) {
  const [optMin,optMax] = band.optimal, [absMin,absMax] = band.absolute;
  if ([optMin,optMax,absMin,absMax].some(x => x == null)) return [null, false];
  if (value < absMin || value > absMax) return [0, true];
  if (optMin <= value && value <= optMax) return [1, false];
  if (value < optMin) return [optMin > absMin ? Math.max(0, Math.min(1, (value-absMin)/(optMin-absMin))) : 0, false];
  return [absMax > optMax ? Math.max(0, Math.min(1, (absMax-value)/(absMax-optMax))) : 0, false];
}
function niceRange(values, suffix = '') { return `${displayNumber(values[0])}–${displayNumber(values[1])}${suffix}`; }
function factorForRange(key, label, value, crop, unit) {
  const band = crop[key], [score,out] = rangeScore(value,band);
  if (score === null) return null;
  const opt = niceRange(band.optimal,unit), abs = niceRange(band.absolute,unit), input = `${displayNumber(value)}${unit}`;
  let status,reason;
  if (out) { status = 'Outside absolute range'; reason = `${input} is outside the ECOCROP absolute range of ${abs}.`; }
  else if (score >= .999) { status = 'Within preferred range'; reason = `${input} is within the ECOCROP optimum of ${opt}.`; }
  else { status = 'Outside optimum'; reason = `${input} is outside the ECOCROP optimum of ${opt}, but within its absolute range of ${abs}.`; }
  return {key,label,input,optimal:opt,absolute:abs,score:pyRound(score*100),weight:WEIGHTS[key],status,reason,outside_absolute:out,source:'FAO ECOCROP'};
}
function calculate(profile) {
  const p = validateProfile(profile);
  const rankings = [];
  for (const crop of CROPS) {
    const factors = [];
    for (const [key,label,unit] of [['ph','Soil pH',''], ['temperature','Temperature',' °C'], ['rainfall','Annual rainfall',' mm/yr']]) {
      const f = factorForRange(key,label,p[key],crop,unit);
      if (f) factors.push(f);
    }
    const [textureName,group] = SOIL_GROUPS[p.soil_type];
    const optimal = crop.texture_optimal.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
    const absolute = crop.texture_absolute.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
    if (optimal.length) {
      let s,status,reason;
      if (optimal.includes(group) || optimal.includes('wide')) {
        s=1; status='Preferred texture'; reason=`${textureName} is mapped to ${group} texture, listed as optimal.`;
      } else if (absolute.includes(group) || absolute.includes('wide')) {
        s=.55; status='Tolerated texture'; reason=`${textureName} is mapped to ${group} texture, listed as tolerated but not optimal.`;
      } else {
        s=.2; status='Not listed as preferred'; reason=`${group[0].toUpperCase()+group.slice(1)} texture is not listed as optimal or tolerated in this subset.`;
      }
      factors.push({key:'texture',label:'Soil texture',input:textureName,optimal:crop.texture_optimal,
        absolute:crop.texture_absolute || 'Not specified',score:pyRound(s*100),weight:WEIGHTS.texture,status,reason,
        outside_absolute:false,source:'ECOCROP + prototype texture mapping'});
    }
    if (p.humidity !== null) {
      const [lo,hi]=crop.humidity_heuristic, value=p.humidity, diff=Math.max(lo-value,0,value-hi), s=Math.max(0,1-diff/25);
      factors.push({key:'humidity',label:'Relative humidity',input:`${displayNumber(value)}%`,optimal:`${lo}–${hi}%`,
        absolute:'Not specified',score:pyRound(s*100),weight:WEIGHTS.humidity,
        status:diff===0?'Within prototype band':'Outside prototype band',
        reason:`${displayNumber(value)}% is ${diff===0?'within':'outside'} the illustrative ${lo}–${hi}% humidity band.`,
        outside_absolute:false,source:'Prototype heuristic; not ECOCROP'});
    }
    if (p.season !== 'unknown') {
      const match = crop.season_heuristic.includes(p.season) || crop.season_heuristic.includes('any');
      factors.push({key:'season',label:'Season',input:SEASONS[p.season],
        optimal:crop.season_heuristic.map(x=>SEASONS[x] || 'Varies / perennial').join(', '),absolute:'Location-dependent',
        score:pyRound((match?1:.4)*100),weight:WEIGHTS.season,
        status:match?'Prototype season match':'Check local planting calendar',
        reason:'Season tags are broad prototype assumptions; confirm planting dates locally.',
        outside_absolute:false,source:'Prototype heuristic; not ECOCROP'});
    }
    const denom = factors.reduce((sum,x)=>sum+x.weight,0);
    const raw = denom ? factors.reduce((sum,x)=>sum+x.score*x.weight,0)/denom : 0;
    const capped = factors.some(x=>x.outside_absolute);
    const score = pyRound(capped?Math.min(raw,50):raw);
    const category = score>=80?'Strong match':score>=60?'Possible match':'Needs review';
    const limiting = [...factors].sort((a,b)=>a.score-b.score || b.weight-a.weight).slice(0,2);
    rankings.push({id:crop.id,name:crop.name,scientific_name:crop.scientific_name,icon:crop.icon,crop_category:crop.category,
      score,category,capped,factors,limiting_factors:limiting.filter(x=>x.score<100).map(x=>x.label),source_url:crop.source_url,
      weighted_factors_used:denom,missing_crop_data:optimal.length?[]:['texture']});
  }
  rankings.sort((a,b)=>b.score-a.score || (a.name<b.name?-1:a.name>b.name?1:0));
  const missing = [];
  if (p.humidity === null) missing.push('Humidity was not supplied and was excluded from scoring.');
  if (p.season === 'unknown') missing.push('Season was marked unknown and was excluded from scoring.');
  missing.push('N, P and K are recorded but not scored: soil-test methods and nutrient availability vary.');
  missing.push('Effective rooting depth, salinity, drainage, irrigation, pests, market conditions and local varieties are not scored.');
  if (p.illustrative) missing.push('This profile includes illustrative example inputs and is not a verified field measurement.');
  if (p.source.startsWith('soilgrids')) {
    const point=p.location?` at ${p.location}`:'', when=p.soil_retrieved_at?` (retrieved ${p.soil_retrieved_at})`:'';
    missing.push(`SoilGrids${point}${when} is a ${soilDepthLabel(p.soil_depth)} cm, approximately 250 m modelled estimate, not a laboratory soil test; inputs may have been edited.`);
    if(p.soil_method==='wcs_fallback') missing.push('The soil source was the limited official WCS fallback; other properties and prediction intervals were not available from this fallback.');
    if(p.soil_ph_interval_90) missing.push(`The original SoilGrids pH 90% prediction interval was ${p.soil_ph_interval_90.lower}–${p.soil_ph_interval_90.upper}; this is model uncertainty, not an accuracy guarantee, and the input may have been edited.`);
    missing.push('SoilGrids uncertainty intervals are not used in the screening scores. Verify the pH and texture for the relevant root zone with local field measurements.');
  }
  if (p.weather_source === 'open_meteo_current') {
    const point=p.weather_location?` at ${p.weather_location}`:'';
    missing.push(`Current Open-Meteo conditions${point} were used for climate inputs; one or both may have been edited. Current conditions are not growing-season averages; verify representativeness.`);
  }
  return {profile:p,rankings,missing_information:missing,advisory:ADVISORY,method_version:'1.0',disclaimer:'Rule-based screening index, not a probability or validated agronomic model.'};
}
function broadTexture(values) {
  const {clay,sand}=values;
  if (clay == null || sand == null) return null;
  if (clay>=40) return 'clayey';
  if (sand>=70 && clay<20) return 'sandy';
  return 'loamy';
}
module.exports = {CROPS,EXAMPLES,REGIONS,SOIL_DEPTHS,soilDepthLabel,ValidationError,validateProfile,calculate,rangeScore,broadTexture,pyRound,toNumber};
