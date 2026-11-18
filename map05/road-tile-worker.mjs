// MAP-06.1: road tiles are generated in a dedicated Web Worker, so panning and zooming never
// wait for polyline decoding or MVT encoding on the main thread.
import {createRoadTileIndex,encodeRoadTile} from './road-tiles.mjs';
import {decodeEmbeddedText} from './embedded-data.mjs';

/**
 * Worker-side service. Messages in: init {source}, tile {id,z,x,y}, cancel {id}.
 * Messages out: ready, error {message}, tile {id,data} / tile {id,error}.
 * Newest requests are served first (they belong to the current view); a cancel removes the request from the queue
 * (a late cancel for an already answered tile is a no-op, nothing is remembered).
 */
export function createRoadTileService(post,{fetchText=async url=>{const response=await fetch(url);if(!response.ok)throw Error(`Brak pliku lokalnego: ${url} (${response.status}).`);return response.text();},schedule=fn=>setTimeout(fn,0)}={}) {
  let index=null,failure=null,scheduled=false;
  const queue=[];
  const failAll=()=>{while(queue.length){const {id}=queue.pop();post({type:'tile',id,error:failure.message});}};
  const step=()=>{
    scheduled=false;
    if(failure){failAll();return;}
    if(!index||!queue.length)return;
    const {id,z,x,y}=queue.pop();
    try {
      const {data}=encodeRoadTile(index,z,x,y);
      post({type:'tile',id,data:data.buffer},[data.buffer]);
    } catch(error) {post({type:'tile',id,error:error.message});}
    pump();
  };
  // One tile per task: cancel and newer tile messages are handled between tiles.
  const pump=()=>{if(scheduled||!queue.length||(!index&&!failure))return;scheduled=true;schedule(step);};
  const load=async source=>{
    const text=source.kind==='url'?await fetchText(source.url):await decodeEmbeddedText(source.text,source.encoding);
    const roads=JSON.parse(text)?.regions?.PLANNER;
    if(!roads)throw Error('Brak regionu PLANNER w lokalnym podkładzie.');
    index=createRoadTileIndex(roads);
  };
  return {
    handle(message) {
      if(message.type==='init') {
        load(message.source).then(()=>{post({type:'ready',roads:index.features.length});pump();},error=>{failure=error;post({type:'error',message:error.message});pump();});
      } else if(message.type==='tile') {queue.push(message);pump();}
      else if(message.type==='cancel') {const at=queue.findIndex(entry=>entry.id===message.id);if(at>=0)queue.splice(at,1);} // only still-queued work can be cancelled
    },
  };
}

// Only the worker bootstrap touches `self`; tests import the service directly.
if(typeof WorkerGlobalScope!=='undefined'&&self instanceof WorkerGlobalScope) {
  const service=createRoadTileService((message,transfer)=>self.postMessage(message,transfer??[]));
  self.onmessage=event=>service.handle(event.data);
}
