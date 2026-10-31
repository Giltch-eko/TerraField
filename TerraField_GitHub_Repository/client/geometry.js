/* Shared WGS84 field geometry; small local polygons only, not a land survey. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.TerraGeometry=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';const MAP_LIMIT=85.05112878;
 function geoPoint(p){return !!p&&typeof p.lat==='number'&&typeof p.lng==='number'&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180;}
 function mapArea(points){const R=6371008.8,r=Math.PI/180;let sum=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];sum+=(b.lng-a.lng)*r*(2+Math.sin(a.lat*r)+Math.sin(b.lat*r));}return Math.abs(sum*R*R/2);}
 function isSimpleRing(p){
  if(!Array.isArray(p)||p.length<3||p.length>100||!p.every(geoPoint)||p.some(x=>Math.abs(x.lat)>MAP_LIMIT))return false;
  if(Math.max(...p.map(x=>x.lng))-Math.min(...p.map(x=>x.lng))>1||Math.max(...p.map(x=>x.lat))-Math.min(...p.map(x=>x.lat))>1)return false;
  const orient=(a,b,c)=>(b.lng-a.lng)*(c.lat-a.lat)-(b.lat-a.lat)*(c.lng-a.lng);
  const on=(a,b,c)=>Math.abs(orient(a,b,c))<1e-14&&c.lng>=Math.min(a.lng,b.lng)-1e-12&&c.lng<=Math.max(a.lng,b.lng)+1e-12&&c.lat>=Math.min(a.lat,b.lat)-1e-12&&c.lat<=Math.max(a.lat,b.lat)+1e-12;
  for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];if(Math.abs(a.lat-b.lat)<1e-12&&Math.abs(a.lng-b.lng)<1e-12)return false;
   for(let j=i+1;j<p.length;j++){if(j===(i+1)%p.length||i===(j+1)%p.length)continue;const c=p[j],d=p[(j+1)%p.length],o1=orient(a,b,c),o2=orient(a,b,d),o3=orient(c,d,a),o4=orient(c,d,b);if((o1*o2<0&&o3*o4<0)||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b))return false;}}
  return mapArea(p)>1;
 }
 function polygonCentroid(p){const r=Math.PI/180,lat0=p.reduce((n,x)=>n+x.lat,0)/p.length,lon0=p[0].lng,c=Math.cos(lat0*r),q=p.map(x=>({x:(x.lng-lon0)*r*c,y:(x.lat-lat0)*r}));let crossSum=0,xSum=0,ySum=0;for(let i=0;i<q.length;i++){const a=q[i],b=q[(i+1)%q.length],cross=a.x*b.y-b.x*a.y;crossSum+=cross;xSum+=(a.x+b.x)*cross;ySum+=(a.y+b.y)*cross;}if(Math.abs(crossSum)<1e-20)return null;return {lat:lat0+ySum/(3*crossSum)/r,lng:lon0+xSum/(3*crossSum)/(r*c)};}
 function pointInside(p,ring){if(!geoPoint(p)||!Array.isArray(ring))return false;let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[j],b=ring[i],cross=(p.lng-a.lng)*(b.lat-a.lat)-(p.lat-a.lat)*(b.lng-a.lng);if(Math.abs(cross)<1e-15&&p.lng>=Math.min(a.lng,b.lng)-1e-12&&p.lng<=Math.max(a.lng,b.lng)+1e-12&&p.lat>=Math.min(a.lat,b.lat)-1e-12&&p.lat<=Math.max(a.lat,b.lat)+1e-12)return false;if((a.lat>p.lat)!==(b.lat>p.lat)&&p.lng<(b.lng-a.lng)*(p.lat-a.lat)/(b.lat-a.lat)+a.lng)inside=!inside;}return inside;}
 function representativePoint(p){if(!isSimpleRing(p))return null;const rounded=x=>({lat:Number(x.lat.toFixed(6)),lng:Number(x.lng.toFixed(6))});const centroid=polygonCentroid(p);if(centroid){const c=rounded(centroid);if(pointInside(c,p))return {...c,method:'centroid'};}
  // Scan each horizontal band between vertex latitudes; midpoint of an
  // interior interval is strictly inside a simple ring, including concave rings.
  const ys=[...new Set(p.map(x=>x.lat))].sort((a,b)=>a-b);let best=null;for(let i=0;i<ys.length-1;i++){const y=(ys[i]+ys[i+1])/2,intersections=[];for(let j=0;j<p.length;j++){const a=p[j],b=p[(j+1)%p.length];if((a.lat>y)!==(b.lat>y))intersections.push(a.lng+(y-a.lat)*(b.lng-a.lng)/(b.lat-a.lat));}intersections.sort((a,b)=>a-b);for(let k=0;k+1<intersections.length;k+=2){const cand=rounded({lat:y,lng:(intersections[k]+intersections[k+1])/2}),width=intersections[k+1]-intersections[k];if(pointInside(cand,p)&&(!best||width>best.width))best={...cand,method:'interior',width};}}if(!best)return null;delete best.width;return best;
 }
 function fromGeoJSON(g){if(!g||g.type!=='Polygon'||!Array.isArray(g.coordinates)||g.coordinates.length!==1)return null;const ring=g.coordinates[0];if(!Array.isArray(ring)||ring.length<4||ring.length>101||ring.some(c=>!Array.isArray(c)||c.length!==2||typeof c[0]!=='number'||typeof c[1]!=='number'))return null;const first=ring[0],last=ring[ring.length-1];if(first[0]!==last[0]||first[1]!==last[1])return null;const pts=ring.slice(0,-1).map(([lng,lat])=>({lat,lng}));return isSimpleRing(pts)&&representativePoint(pts)?pts:null;}
 function toGeoJSON(points){const coords=points.map(p=>[p.lng,p.lat]);return {type:'Polygon',coordinates:[[...coords,coords[0]]]};}
 return {MAP_LIMIT,geoPoint,mapArea,isSimpleRing,polygonCentroid,pointInside,representativePoint,fromGeoJSON,toGeoJSON};
});
