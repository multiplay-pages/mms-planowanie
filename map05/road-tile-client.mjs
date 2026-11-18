// MAP-06.1: main-thread side of road-tile generation. `tile(z,x,y,signal)` resolves to an
// ArrayBuffer with a Mapbox Vector Tile. The worker client keeps the heavy work off the main thread;
// the inline client is the fallback when workers are unavailable.
import {createRoadTileIndex,encodeRoadTile} from './road-tiles.mjs';

const abortError=()=>Object.assign(Error('Żądanie kafla anulowane.'),{name:'AbortError'});

/** Proxy to a road-tile worker; `source` is {kind:'url',url} or {kind:'embedded',text,encoding}. */
export function createWorkerRoadTiles(worker,source) {
  let nextId=1,closed=false,failure=null,resolveReady,rejectReady,resolveFailed;
  const pending=new Map();
  const rejectAll=error=>{for(const entry of pending.values())entry.reject(error);pending.clear();};
  const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
  // `failed` resolves once, whenever the worker dies (before or after `ready`), so the planner can hand over to the SVG map.
  const failed=new Promise(resolve=>{resolveFailed=resolve;});
  ready.catch(()=>{});
  // Terminal: the first failure is remembered; pending and later tile requests are rejected instead of waiting on a dead worker.
  const fail=error=>{if(failure||closed)return;failure=error;rejectReady(error);rejectAll(error);resolveFailed(error);};
  worker.onmessage=event=>{
    const message=event.data;
    if(message.type==='ready')resolveReady(message);
    else if(message.type==='error')fail(Error(message.message));
    else if(message.type==='tile') {
      const entry=pending.get(message.id);if(!entry)return; // answer to a cancelled request
      pending.delete(message.id);
      if(message.error)entry.reject(Error(message.error));else entry.resolve(message.data);
    }
  };
  worker.onerror=event=>fail(Error(event?.message||'Błąd wątku kafli dróg.'));
  worker.onmessageerror=()=>fail(Error('Nieczytelna odpowiedź wątku kafli dróg.'));
  worker.postMessage({type:'init',source});
  return {
    ready,failed,
    get pending(){return pending.size;},
    tile(z,x,y,signal) {
      if(closed)return Promise.reject(Error('Wątek kafli dróg został zamknięty.'));
      if(failure)return Promise.reject(failure);
      if(signal?.aborted)return Promise.reject(abortError());
      const id=nextId++;
      return new Promise((resolve,reject)=>{
        pending.set(id,{resolve,reject});
        signal?.addEventListener('abort',()=>{if(pending.delete(id)){worker.postMessage({type:'cancel',id});reject(abortError());}},{once:true});
        worker.postMessage({type:'tile',id,z,x,y});
      });
    },
    destroy(){closed=true;rejectAll(Error('Wątek kafli dróg został zamknięty.'));worker.terminate?.();},
  };
}

/** Same interface on the main thread (fallback when Worker is unavailable). */
export function createInlineRoadTiles(roadMap) {
  const index=createRoadTileIndex(roadMap);
  return {
    ready:Promise.resolve({type:'ready',roads:index.features.length}),
    failed:new Promise(()=>{}),
    pending:0,
    tile:async(z,x,y)=>encodeRoadTile(index,z,x,y).data.buffer,
    destroy(){},
  };
}
