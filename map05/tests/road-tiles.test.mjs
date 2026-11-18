import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRoadTileIndex,encodeRoadTile,tileBounds,clipTileLine,roadTileMaxRank} from '../road-tiles.mjs';

// Independent minimal Mapbox Vector Tile reader, so the encoder is not checked against itself.
function readTile(bytes) {
  let pos=0;
  const varint=()=>{let result=0,shift=1,b;do{b=bytes[pos++];result+=(b&127)*shift;shift*=128;}while(b>=128);return result;};
  const message=(end,handlers)=>{while(pos<end){const key=varint(),field=Math.floor(key/8),wire=key%8;
    if(wire===2){const len=varint(),stop=pos+len;if(handlers[field])handlers[field](stop);pos=stop;}
    else if(wire===0){const v=varint();handlers[field]?.(v);} else throw Error('wire '+wire);}};
  const packed=end=>{const out=[];while(pos<end)out.push(varint());return out;};
  const text=end=>new TextDecoder().decode(bytes.slice(pos,end));
  const layers=[];
  message(bytes.length,{3:end=>{const layer={features:[],keys:[],values:[]};
    message(end,{1:e=>{layer.name=text(e);},15:v=>{layer.version=v;},5:v=>{layer.extent=v;},3:e=>{layer.keys.push(text(e));},
      4:e=>{const value={};message(e,{1:ee=>{value.v=text(ee);},4:v=>{value.v=v;}});layer.values.push(value.v);},
      2:e=>{const f={};message(e,{1:v=>{f.id=v;},3:v=>{f.type=v;},2:ee=>{f.tags=packed(ee);},4:ee=>{f.geometry=packed(ee);}});layer.features.push(f);}});
    layers.push(layer);}});
  for(const layer of layers)for(const f of layer.features) {
    f.properties={};for(let i=0;i<f.tags.length;i+=2)f.properties[layer.keys[f.tags[i]]]=layer.values[f.tags[i+1]];
    const lines=[];let x=0,y=0,i=0,current;const zz=n=>(n>>>1)^-(n&1);
    while(i<f.geometry.length){const cmd=f.geometry[i]&7,count=f.geometry[i]>>3;i++;
      for(let k=0;k<count;k++){x+=zz(f.geometry[i++]);y+=zz(f.geometry[i++]);if(cmd===1){current=[[x,y]];lines.push(current);}else current.push([x,y]);}}
    f.lines=lines;
  }
  return layers;
}

const encodePolyline=points=>{
  let out='',plat=0,plon=0;
  const enc=v=>{v=v<0?~(v<<1):v<<1;let s='';while(v>=32){s+=String.fromCharCode((32|(v&31))+63);v>>=5;}return s+String.fromCharCode(v+63);};
  for(const [lon,lat] of points){const la=Math.round(lat*1e5),lo=Math.round(lon*1e5);out+=enc(la-plat)+enc(lo-plon);plat=la;plon=lo;}
  return out;
};
const lonToTile=(lon,z)=>(lon+180)/360*2**z,latToTile=(lat,z)=>{const s=Math.sin(lat*Math.PI/180);return (0.5-Math.log((1+s)/(1-s))/(4*Math.PI))*2**z;};

function syntheticMap() {
  const primary=[[18.60,50.20],[18.70,50.22]],local=[[18.640,50.210],[18.642,50.211]];
  return {encoding:'polyline5-indexed',categories:['primary','residential'],names:['','ulica Władysława Łokietka'],bounds:[18.5,50.1,18.8,50.3],
    features:[['101',0,0,encodePolyline(primary),[18.60,50.20,18.70,50.22]],['202',1,1,encodePolyline(local),[18.640,50.210,18.642,50.211]]]};
}

test('tile bounds follow the Web Mercator XYZ scheme',()=>{
  const [w,s,e,n]=tileBounds(0,0,0);assert.equal(w,-180);assert.equal(e,180);assert.ok(Math.abs(n-85.0511)<1e-3&&Math.abs(s+85.0511)<1e-3);
  const [w1,,e1,n1]=tileBounds(1,1,0);assert.equal(w1,0);assert.equal(e1,180);assert.ok(Math.abs(n1-85.0511)<1e-3);
});

test('clipping keeps separate pieces separate and never invents a connecting segment',()=>{
  // Leaves the box on the right, then re-enters: two lines, not one joined line.
  const lines=clipTileLine([[10,10],[200,10],[200,90],[10,90]],0,100);
  assert.equal(lines.length,2);
  assert.deepEqual(lines[0],[[10,10],[100,10]]);
  assert.deepEqual(lines[1],[[100,90],[10,90]]);
  assert.deepEqual(clipTileLine([[200,200],[300,300]],0,100),[]);
});

test('road classes appear by zoom, with names and geometry inside the tile',()=>{
  const index=createRoadTileIndex(syntheticMap());
  const tileAt=(z,lon,lat)=>[z,Math.floor(lonToTile(lon,z)),Math.floor(latToTile(lat,z))];
  const [z10,x10,y10]=tileAt(10,18.641,50.2105);
  const low=readTile(encodeRoadTile(index,z10,x10,y10).data);
  assert.deepEqual(low[0].features.map(f=>f.properties.class),['primary'],'residential is hidden at z10');
  assert.equal(low[0].name,'roads');assert.equal(low[0].version,2);assert.equal(low[0].extent,4096);
  const [z15,x15,y15]=tileAt(15,18.641,50.2105);
  const high=readTile(encodeRoadTile(index,z15,x15,y15).data);
  const local=high[0].features.find(f=>f.properties.class==='residential');
  assert.ok(local,'residential street visible at street zoom');
  assert.equal(local.properties.name,'ulica Władysława Łokietka');
  assert.equal(local.id,202);assert.equal(local.type,2);assert.equal(local.properties.rank,5);
  // First vertex lands where the projection says it should (±1 unit of rounding).
  const expectedX=(lonToTile(18.640,z15)-x15)*4096,expectedY=(latToTile(50.210,z15)-y15)*4096;
  assert.ok(Math.abs(local.lines[0][0][0]-expectedX)<=1&&Math.abs(local.lines[0][0][1]-expectedY)<=1);
  for(const f of high[0].features)for(const line of f.lines)for(const [x,y] of line)assert.ok(x>=-64&&x<=4160&&y>=-64&&y<=4160);
  assert.equal(encodeRoadTile(index,15,0,0).data.length,0,'tile far away is empty');
  assert.deepEqual([8,10,11,13,14].map(roadTileMaxRank),[2,3,4,5,7]);
});

test('decoded road cache is bounded while tiles stay correct',()=>{
  const index=createRoadTileIndex(syntheticMap());index.decodedLimit=1;
  const z=15,x=Math.floor(lonToTile(18.641,z)),y=Math.floor(latToTile(50.2105,z));
  const first=readTile(encodeRoadTile(index,z,x,y).data);
  assert.ok(index.decoded.length<=1);
  const second=readTile(encodeRoadTile(index,z,x,y).data);
  assert.deepEqual(second,first,'re-decoding an evicted road gives the same tile');
});

test('real regional snapshot: a street tile in Knurów has named local streets and no network',async()=>{
  const map=JSON.parse(await readFile(new URL('../basemap/planner-compact.json',import.meta.url),'utf8')).regions.PLANNER;
  const index=createRoadTileIndex(map),z=14,x=Math.floor(lonToTile(18.66,z)),y=Math.floor(latToTile(50.22,z));
  const layers=readTile(encodeRoadTile(index,z,x,y).data);
  assert.ok(layers[0].features.length>20);
  assert.ok(layers[0].features.some(f=>/[ąćęłńóśźż]/i.test(f.properties.name??'')),'Polish street names survive encoding');
});
