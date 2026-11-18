// MAP-08: dependency-free PMTiles v3 reader. Works over any byte source (HTTP range requests against
// the local server, or an in-memory buffer embedded in the offline file). It only reads; it never
// writes or contacts anything but the source it was given.

const HEADER_BYTES=127,INITIAL_BYTES=16384;
const MAX_DIRECTORY_DEPTH=4;

export function tileId(z,x,y) {
  if(!(z>=0&&z<=26)||!(x>=0&&x<2**z)||!(y>=0&&y<2**z))throw Error('Kafel poza piramidą.');
  const n=2**z;let d=0,s=n/2,acc=(4**z-1)/3;
  while(s>=1) {
    const rx=Math.floor(x/s)%2,ry=Math.floor(y/s)%2;
    d+=s*s*((3*rx)^ry);
    if(ry===0){if(rx===1){x=n-1-x;y=n-1-y;}[x,y]=[y,x];}
    s/=2;
  }
  return acc+d;
}

async function gunzip(bytes) {
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function readVarint(bytes,position) {
  let value=0,factor=1;
  for(;;) {
    if(position.at>=bytes.length)throw Error('Uszkodzony katalog pakietu mapy.');
    const byte=bytes[position.at++];
    value+=(byte&127)*factor;
    if(byte<128)return value;
    factor*=128;
  }
}

export function parseDirectory(bytes) {
  const position={at:0},count=readVarint(bytes,position);
  if(count>1e6)throw Error('Nieprawidłowy katalog pakietu mapy.');
  const entries=new Array(count);let last=0;
  for(let i=0;i<count;i++){last+=readVarint(bytes,position);entries[i]={tileId:last,offset:0,length:0,run:0};}
  for(let i=0;i<count;i++)entries[i].run=readVarint(bytes,position);
  for(let i=0;i<count;i++)entries[i].length=readVarint(bytes,position);
  for(let i=0;i<count;i++) {
    const value=readVarint(bytes,position);
    if(value===0&&i===0)throw Error('Nieprawidłowy katalog pakietu mapy.');
    entries[i].offset=value===0?entries[i-1].offset+entries[i-1].length:value-1;
  }
  return entries;
}

function findEntry(entries,id) {
  let low=0,high=entries.length-1;
  while(low<=high) {if(entries[(low+high)>>1].tileId<=id)low=((low+high)>>1)+1;else high=((low+high)>>1)-1;}
  const entry=entries[high];
  return entry&&(entry.run===0||id-entry.tileId<entry.run)?entry:null;
}

export function parseHeader(bytes) {
  if(bytes.length<HEADER_BYTES||String.fromCharCode(...bytes.slice(0,7))!=='PMTiles'||bytes[7]!==3)throw Error('To nie jest pakiet mapy PMTiles v3.');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),u64=at=>Number(view.getBigUint64(at,true));
  const header={rootOffset:u64(8),rootLength:u64(16),metadataOffset:u64(24),metadataLength:u64(32),leafOffset:u64(40),leafLength:u64(48),dataOffset:u64(56),dataLength:u64(64),
    internalCompression:bytes[97],tileCompression:bytes[98],tileType:bytes[99],minZoom:bytes[100],maxZoom:bytes[101],
    bounds:[view.getInt32(102,true)/1e7,view.getInt32(106,true)/1e7,view.getInt32(110,true)/1e7,view.getInt32(114,true)/1e7]};
  if(header.tileType!==1)throw Error('Pakiet mapy nie zawiera kafli wektorowych.');
  return header;
}

/** Source over an in-memory buffer (offline file, tests). */
export const memorySource=bytes=>({kind:'memory',getBytes:async(offset,length)=>bytes.subarray(offset,Math.min(bytes.length,offset+length))});

/** Source over HTTP range requests; falls back to slicing when the server ignores Range. */
export function httpSource(url,fetchImpl=fetch) {
  let whole=null;
  return {kind:'http',url,async getBytes(offset,length,signal) {
    if(whole)return whole.subarray(offset,offset+length);
    const response=await fetchImpl(url,{headers:{Range:`bytes=${offset}-${offset+length-1}`},signal});
    if(response.status===206)return new Uint8Array(await response.arrayBuffer());
    if(response.status===200){whole=new Uint8Array(await response.arrayBuffer());return whole.subarray(offset,offset+length);}
    throw Error(`Pakiet mapy: odpowiedź serwera ${response.status}.`);
  }};
}

export async function openPack(source) {
  const first=await source.getBytes(0,INITIAL_BYTES);
  const header=parseHeader(first);
  // A short answer means a truncated archive: fail now instead of at the first tile.
  const read=async(offset,length,signal)=>{const bytes=await source.getBytes(offset,length,signal);if(bytes.length!==length)throw Error('Pakiet mapy jest ucięty lub uszkodzony.');return bytes;};
  const slice=async(offset,length)=>offset+length<=first.length?first.subarray(offset,offset+length):read(offset,length);
  const decode=async(bytes,compression)=>compression===2?gunzip(bytes):bytes;
  const root=parseDirectory(await decode(await slice(header.rootOffset,header.rootLength),header.internalCompression));
  const leaves=new Map();
  const metadata=async()=>JSON.parse(new TextDecoder().decode(await decode(await slice(header.metadataOffset,header.metadataLength),header.internalCompression)));
  async function tile(z,x,y,signal) {
    if(z<header.minZoom||z>header.maxZoom)return null;
    const id=tileId(z,x,y);
    let entries=root;
    for(let depth=0;depth<MAX_DIRECTORY_DEPTH;depth++) {
      const entry=findEntry(entries,id);
      if(!entry)return null;
      if(entry.run>0) {
        const bytes=await read(header.dataOffset+entry.offset,entry.length,signal);
        return decode(bytes,header.tileCompression);
      }
      const key=entry.offset;
      if(!leaves.has(key))leaves.set(key,parseDirectory(await decode(await read(header.leafOffset+entry.offset,entry.length,signal),header.internalCompression)));
      entries=leaves.get(key);
    }
    throw Error('Zbyt głęboki katalog pakietu mapy.');
  }
  // The directory can be intact while the data sections are missing: probe the last byte each declared section must hold.
  if(header.leafLength>0)await read(header.leafOffset+header.leafLength-1,1);
  if(header.dataLength>0)await read(header.dataOffset+header.dataLength-1,1);
  const meta=await metadata();
  const layers=new Set(Array.isArray(meta.vector_layers)?meta.vector_layers.map(layer=>layer.id):[]);
  return {header,metadata,tile,source,layers};
}
