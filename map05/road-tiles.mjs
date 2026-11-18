// MAP-06: local vector tiles (Mapbox Vector Tile v2) generated in the browser from the
// already bundled OSM road snapshot. No tile server, no network request.
import {decodeRoadPolyline} from './routes.mjs';

const ROAD_TILE_EXTENT=4096,ROAD_TILE_BUFFER=64,ROAD_GRID=0.05;
// Decoded geometry is cached per road with a bounded FIFO so panning the whole region cannot
// keep all 322 452 roads decoded at once.
export const ROAD_DECODED_LIMIT=25000;
const roadTileRank=category=>({motorway:0,motorway_link:0,trunk:1,trunk_link:1,primary:2,primary_link:2,secondary:3,secondary_link:3,tertiary:4,tertiary_link:4,residential:5,unclassified:5,living_street:6,service:6,pedestrian:6,track:7})[category]??7;
// Road classes per zoom; detail grows as the user zooms in, like a regular web map.
export const roadTileMaxRank=z=>z<=8?2:z<=10?3:z<=11?4:z<=13?5:7;

export function createRoadTileIndex(map) {
  if(map?.encoding!=='polyline5-indexed'||!Array.isArray(map.features))throw Error('Nieobsługiwany format lokalnego podkładu.');
  const features=map.features.map(([id,category,name,encoded,bounds])=>{
    const cat=map.categories[category];
    return {id:Number(id)||0,category:cat,name:map.names[name]??'',encoded,bounds,rank:roadTileRank(cat),points:null};
  });
  const grid=new Map();
  features.forEach((feature,index)=>{
    const [w,s,e,n]=feature.bounds;
    for(let x=Math.floor(w/ROAD_GRID);x<=Math.floor(e/ROAD_GRID);x++)for(let y=Math.floor(s/ROAD_GRID);y<=Math.floor(n/ROAD_GRID);y++) {
      const key=`${x}/${y}`;let cell=grid.get(key);if(!cell){cell=[];grid.set(key,cell);}cell.push(index);
    }
  });
  return {features,grid,bounds:map.bounds??null,decoded:[],decodedLimit:ROAD_DECODED_LIMIT};
}

export function tileBounds(z,x,y) {
  const n=2**z,lon=v=>v/n*360-180,lat=v=>Math.atan(Math.sinh(Math.PI*(1-2*v/n)))*180/Math.PI;
  return [lon(x),lat(y+1),lon(x+1),lat(y)];
}

function roadTileCandidates(index,[w,s,e,n],maxRank) {
  const seen=new Set(),result=[];
  for(let x=Math.floor(w/ROAD_GRID);x<=Math.floor(e/ROAD_GRID);x++)for(let y=Math.floor(s/ROAD_GRID);y<=Math.floor(n/ROAD_GRID);y++) {
    for(const i of index.grid.get(`${x}/${y}`)??[]) {
      if(seen.has(i))continue;seen.add(i);
      const f=index.features[i];
      if(f.rank<=maxRank&&f.bounds[0]<=e&&f.bounds[2]>=w&&f.bounds[1]<=n&&f.bounds[3]>=s)result.push(f);
    }
  }
  return result;
}

// Liang-Barsky clip of one segment to the buffered tile square; returns null when outside.
function clipSegment(a,b,min,max) {
  let t0=0,t1=1;const dx=b[0]-a[0],dy=b[1]-a[1];
  for(const [p,q] of [[-dx,a[0]-min],[dx,max-a[0]],[-dy,a[1]-min],[dy,max-a[1]]]) {
    if(p===0){if(q<0)return null;continue;}
    const r=q/p;
    if(p<0){if(r>t1)return null;if(r>t0)t0=r;}else{if(r<t0)return null;if(r<t1)t1=r;}
  }
  return [[a[0]+t0*dx,a[1]+t0*dy],[a[0]+t1*dx,a[1]+t1*dy],t1<1];
}

export function clipTileLine(points,min,max) {
  const lines=[];let current=null;
  for(let i=1;i<points.length;i++) {
    const clipped=clipSegment(points[i-1],points[i],min,max);
    if(!clipped){current=null;continue;}
    const [a,b,leaves]=clipped;
    if(!current){current=[a];lines.push(current);}
    current.push(b);
    if(leaves)current=null;
  }
  return lines.map(line=>line.map(([x,y])=>[Math.round(x),Math.round(y)]).filter((p,i,arr)=>!i||p[0]!==arr[i-1][0]||p[1]!==arr[i-1][1])).filter(line=>line.length>=2);
}

class TileWriter {
  constructor(){this.bytes=[];}
  varint(value){value=Math.floor(value);while(value>127){this.bytes.push((value&127)|128);value=Math.floor(value/128);}this.bytes.push(value);}
  key(field,wire){this.varint(field*8+wire);}
  zigzag(value){return value<0?-2*value-1:2*value;}
  message(field,writer){this.key(field,2);this.varint(writer.bytes.length);for(const b of writer.bytes)this.bytes.push(b);}
  string(field,text){const data=new TextEncoder().encode(text);this.key(field,2);this.varint(data.length);for(const b of data)this.bytes.push(b);}
  packed(field,values){const inner=new TileWriter();for(const v of values)inner.varint(v);this.message(field,inner);}
}

export function encodeRoadTile(index,z,x,y) {
  const bounds=tileBounds(z,x,y),n=2**z,pad=(bounds[2]-bounds[0])*ROAD_TILE_BUFFER/ROAD_TILE_EXTENT;
  const candidates=roadTileCandidates(index,[bounds[0]-pad,bounds[1]-pad,bounds[2]+pad,bounds[3]+pad],roadTileMaxRank(z));
  const project=([lon,lat])=>{
    const px=(lon+180)/360*n,sin=Math.sin(lat*Math.PI/180),py=(0.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*n;
    return [(px-x)*ROAD_TILE_EXTENT,(py-y)*ROAD_TILE_EXTENT];
  };
  const keys=['class','name','rank'],values=[],valueIndex=new Map();
  const value=v=>{const key=typeof v+':'+v;if(!valueIndex.has(key)){valueIndex.set(key,values.length);values.push(v);}return valueIndex.get(key);};
  const layer=new TileWriter();
  layer.varint(15<<3);layer.varint(2);layer.string(1,'roads');
  let count=0;
  for(const feature of candidates) {
    if(!feature.points) {
      feature.points=decodeRoadPolyline(feature.encoded);index.decoded.push(feature);
      if(index.decoded.length>index.decodedLimit)index.decoded.splice(0,index.decoded.length-index.decodedLimit).forEach(old=>{old.points=null;});
    }
    const lines=clipTileLine(feature.points.map(project),-ROAD_TILE_BUFFER,ROAD_TILE_EXTENT+ROAD_TILE_BUFFER);
    if(!lines.length)continue;
    const geometry=[];let cx=0,cy=0;
    for(const line of lines) {
      geometry.push((1&7)|(1<<3),TileWriter.prototype.zigzag(line[0][0]-cx),TileWriter.prototype.zigzag(line[0][1]-cy));
      cx=line[0][0];cy=line[0][1];
      geometry.push((2&7)|((line.length-1)<<3));
      for(const [px,py] of line.slice(1)){geometry.push(TileWriter.prototype.zigzag(px-cx),TileWriter.prototype.zigzag(py-cy));cx=px;cy=py;}
    }
    const tags=[0,value(feature.category),2,value(feature.rank)];
    if(feature.name)tags.push(1,value(feature.name));
    const out=new TileWriter();out.key(1,0);out.varint(feature.id);out.packed(2,tags);out.key(3,0);out.varint(2);out.packed(4,geometry);
    layer.message(2,out);count++;
  }
  for(const key of keys)layer.string(3,key);
  for(const v of values){const val=new TileWriter();if(typeof v==='number'){val.key(4,0);val.varint(v);}else val.string(1,v);layer.message(4,val);}
  layer.key(5,0);layer.varint(ROAD_TILE_EXTENT);
  const tile=new TileWriter();if(count)tile.message(3,layer);
  return {data:new Uint8Array(tile.bytes),features:count};
}
