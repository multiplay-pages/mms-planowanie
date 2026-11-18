// MAP-06: MapLibre GL adapter. It renders layers produced by operational-map.mjs and never
// changes the plan itself; edits are delegated back to the planner through callbacks.

const OP_EMPTY={type:'FeatureCollection',features:[]};
const OP_ROAD_LAYERS=['roads-casing','roads-fill','roads-track'];
const OP_LABEL_LAYERS=['road-labels'];
let opRoadTiles=null,opProtocolRegistered=false;
const opEscape=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/** Hides API keys/tokens in URLs before a message is shown or logged. */
export const maskSecrets=text=>String(text).replace(/([?&](?:key|apikey|api_key|token|access_token|signature)=)[^&\s"']+/gi,'$1***').replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/?#"'@]*@/gi,'$1***@');

export const SATELLITE_PRESETS={
  'gugik-orto':{label:'GUGiK — Ortofotomapa (WMS, bezpłatna)',url:'https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolution?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=Raster&STYLES=&FORMAT=image/jpeg&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}',attribution:'Ortofotomapa © GUGiK'},
};

/** Validates a satellite provider configuration without contacting it. */
export function validateSatelliteConfig(config,allowedOrigins=[]) {
  if(!config||typeof config.url!=='string')return {ok:false,reason:'Nie skonfigurowano dostawcy zdjęć.'};
  if(config.consent!==true)return {ok:false,reason:'Brak potwierdzenia, że widoczny obszar mapy będzie wysyłany do dostawcy.'};
  let url;try{url=new URL(config.url.replaceAll('{','%7B').replaceAll('}','%7D'));}catch{return {ok:false,reason:'Nieprawidłowy adres dostawcy.'};}
  if(url.username||url.password)return {ok:false,reason:'Adres dostawcy nie może zawierać nazwy użytkownika ani hasła.'};
  const loopback=url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname);
  if(url.protocol!=='https:'&&!loopback)return {ok:false,reason:'Dostawca musi używać HTTPS.'};
  if(!/\{(z|bbox-epsg-3857)\}/.test(config.url))return {ok:false,reason:'Adres musi zawierać {z}/{x}/{y} albo {bbox-epsg-3857}.'};
  if(!String(config.attribution??'').trim())return {ok:false,reason:'Podaj atrybucję wymaganą przez dostawcę.'};
  if(!allowedOrigins.includes(url.origin))return {ok:false,reason:`Ten widok blokuje połączenia z ${url.origin}. Uruchom serwer z: python -X utf8 map05/serve.py --allow-tile-origin ${url.origin}. Plik offline nie pobiera zdjęć satelitarnych.`};
  return {ok:true,origin:url.origin};
}

function opDiamond(color,size=28) {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
  const g=canvas.getContext('2d'),m=size/2,r=size/2-3;
  g.beginPath();g.moveTo(m,m-r);g.lineTo(m+r,m);g.lineTo(m,m+r);g.lineTo(m-r,m);g.closePath();
  g.fillStyle=color;g.fill();g.lineWidth=2.5;g.strokeStyle='#ffffff';g.stroke();
  return g.getImageData(0,0,size,size);
}

export function createOperationalMapView({maplibregl,container,roadTiles,towns,regionBounds,teams,callbacks}) {
  // Road tiles come from a client (Web Worker or inline); the protocol handler only forwards the request.
  opRoadTiles=roadTiles??null;
  if(!opProtocolRegistered) {
    opProtocolRegistered=true;
    maplibregl.addProtocol('mmsroads',async(params,abortController)=>{
      const match=/mmsroads:\/\/(\d+)\/(\d+)\/(\d+)/.exec(params.url);
      if(!match)throw Error('Nieprawidłowy adres kafla lokalnego.');
      if(!opRoadTiles)throw Error('Lokalne kafle dróg nie są dostępne.');
      return {data:await opRoadTiles.tile(Number(match[1]),Number(match[2]),Number(match[3]),abortController?.signal)};
    });
  }
  const width=(minor,major)=>['interpolate',['exponential',1.6],['zoom'],8,['case',['<=',['get','rank'],2],major*0.35,minor*0.15],13,['case',['<=',['get','rank'],2],major,['<=',['get','rank'],4],major*0.8,minor],18,['case',['<=',['get','rank'],4],major*4,minor*5]];
  const style={version:8,
    sources:{
      roads:{type:'vector',tiles:['mmsroads://{z}/{x}/{y}'],minzoom:5,maxzoom:14,bounds:regionBounds??undefined,attribution:'© OpenStreetMap contributors (ODbL), lokalny podkład'},
      towns:{type:'geojson',data:towns},
      routes:{type:'geojson',data:OP_EMPTY},unassigned:{type:'geojson',data:OP_EMPTY},visits:{type:'geojson',data:OP_EMPTY},
    },
    layers:[
      {id:'background',type:'background',paint:{'background-color':'#f1f2ec'}},
      {id:'roads-casing',type:'line',source:'roads','source-layer':'roads',filter:['<',['get','rank'],7],layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#cfcabb','line-width':width(3,5.5)}},
      {id:'roads-fill',type:'line',source:'roads','source-layer':'roads',filter:['<',['get','rank'],7],layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':['match',['get','rank'],0,'#f2a65a',1,'#f6c26b',2,'#f8d77f',3,'#fbe8a6','#ffffff'],'line-width':width(2,4)}},
      {id:'roads-track',type:'line',source:'roads','source-layer':'roads',filter:['==',['get','rank'],7],paint:{'line-color':'#b9ad8f','line-width':1,'line-dasharray':[2,2]}},
      {id:'road-labels',type:'symbol',source:'roads','source-layer':'roads',minzoom:12,filter:['all',['has','name'],['<',['get','rank'],7]],layout:{'symbol-placement':'line','text-field':['get','name'],'text-font':['sans-serif'],'text-size':['interpolate',['linear'],['zoom'],12,10,17,14],'text-max-angle':35,'symbol-spacing':320},paint:{'text-color':'#3d4741','text-halo-color':'#ffffff','text-halo-width':1.6}},
      {id:'town-labels',type:'symbol',source:'towns',maxzoom:14.5,layout:{'text-field':['get','name'],'text-font':['sans-serif'],'text-size':['interpolate',['linear'],['zoom'],7,11,12,15],'text-offset':[0,-1.4],'text-variable-anchor':['bottom','top','left','right']},paint:{'text-color':'#24332c','text-halo-color':'#ffffff','text-halo-width':1.8}},
      {id:'routes-casing',type:'line',source:'routes',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#ffffff','line-width':['interpolate',['linear'],['zoom'],8,4,15,9],'line-opacity':0.9}},
      {id:'routes',type:'line',source:'routes',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':['get','color'],'line-width':['interpolate',['linear'],['zoom'],8,2.5,15,6]}},
      {id:'unassigned',type:'circle',source:'unassigned',filter:['==',['get','kind'],'installation'],paint:{'circle-radius':['interpolate',['linear'],['zoom'],7,3.5,14,6],'circle-color':'#9aa19a','circle-stroke-color':'#ffffff','circle-stroke-width':1.5}},
      {id:'unassigned-measurement',type:'symbol',source:'unassigned',filter:['==',['get','kind'],'measurement'],layout:{'icon-image':'op-diamond-queue','icon-size':['interpolate',['linear'],['zoom'],7,0.35,14,0.55],'icon-allow-overlap':true}},
      {id:'selected-ring',type:'circle',source:'visits',filter:['==',['get','selected'],true],paint:{'circle-radius':17,'circle-color':'rgba(0,0,0,0)','circle-stroke-color':'#1f2937','circle-stroke-width':3}},
      {id:'selected-ring-queue',type:'circle',source:'unassigned',filter:['==',['get','selected'],true],paint:{'circle-radius':11,'circle-color':'rgba(0,0,0,0)','circle-stroke-color':'#1f2937','circle-stroke-width':3}},
      {id:'visits-installation',type:'circle',source:'visits',filter:['==',['get','kind'],'installation'],paint:{'circle-radius':11,'circle-color':['get','color'],'circle-stroke-color':['case',['get','confirmed'],'#111827','#ffffff'],'circle-stroke-width':['case',['get','confirmed'],3.5,2]}},
      {id:'visits-measurement',type:'symbol',source:'visits',filter:['==',['get','kind'],'measurement'],layout:{'icon-image':['concat','op-diamond-',['get','teamId']],'icon-size':0.95,'icon-allow-overlap':true,'icon-ignore-placement':true}},
      {id:'visits-label',type:'symbol',source:'visits',layout:{'text-field':['get','label'],'text-font':['sans-serif'],'text-size':12,'text-allow-overlap':true,'text-ignore-placement':true},paint:{'text-color':'#ffffff','text-halo-color':'rgba(0,0,0,0.35)','text-halo-width':0.8}},
    ]};
  const map=new maplibregl.Map({container,style,bounds:regionBounds??undefined,fitBoundsOptions:{padding:24},attributionControl:{compact:true},maxZoom:19,minZoom:5,dragRotate:true,pitchWithRotate:false,cooperativeGestures:false});
  map.addControl(new maplibregl.NavigationControl({visualizePitch:false}),'top-right');
  map.addControl(new maplibregl.FullscreenControl({container:container.closest('.op-map-shell')??container}),'top-right');
  map.addControl(new maplibregl.ScaleControl({unit:'metric'}),'bottom-left');
  map.getCanvas().setAttribute('aria-label','Interaktywna mapa operacyjna. Strzałki przesuwają, plus i minus zmieniają skalę. Lista wizyt obok mapy jest dostępna z klawiatury.');
  let satelliteKey=null,basemap='road',roadsVisible=true,lastLayers=null,popup=null,popupOrder=null,popupSig='';
  // `ready` rejects when the map fails before its first load (e.g. the worker cannot start), so the planner falls back to the SVG map.
  let loaded=false;
  const ready=new Promise((resolve,reject)=>{
    map.once('load',()=>{
      loaded=true;
      for(const team of teams)map.addImage(`op-diamond-${team.teamId}`,opDiamond(team.color),{pixelRatio:2});
      map.addImage('op-diamond-queue',opDiamond('#9aa19a'),{pixelRatio:2});
      resolve();
    });
    map.on('error',event=>{if(!loaded&&!event.sourceId&&!event.tile)reject(Error(maskSecrets(event.error?.message??String(event.error??event))));});
  });
  ready.catch(()=>{}); // callers that await `ready` still see the rejection
  const visibility=(ids,on)=>ids.forEach(id=>map.getLayer(id)&&map.setLayoutProperty(id,'visibility',on?'visible':'none'));
  const applyBasemap=()=>{
    const satellite=basemap!=='road'&&satelliteKey&&map.getLayer('satellite');
    if(map.getLayer('satellite'))visibility(['satellite'],Boolean(satellite));
    visibility(['background'],!satellite);
    visibility(OP_ROAD_LAYERS,roadsVisible&&basemap!=='satellite');
    visibility(OP_LABEL_LAYERS,basemap!=='satellite');
    map.setPaintProperty('roads-fill','line-opacity',basemap==='hybrid'?0.55:1);
    map.setPaintProperty('roads-casing','line-opacity',basemap==='hybrid'?0.25:1);
  };
  const featureAt=event=>map.queryRenderedFeatures(event.point,{layers:['visits-installation','visits-measurement','visits-label','unassigned','unassigned-measurement']})[0];
  // Popup content is derived from the current feature, so it can be rebuilt when the plan changes under an open popup.
  // `selected` only reflects the planner highlight, so it is not part of what the popup shows.
  const popupSignature=p=>JSON.stringify({...p,selected:undefined});
  const popupNode=p=>{
    const node=document.createElement('div');node.className='op-popup';
    const title=document.createElement('strong');title.textContent=`${p.orderId} · ${p.type}`;node.append(title);
    const lines=p.teamId?[`Koszyk ${p.teamId} · wizyta nr ${p.seq} · ${p.window}`,p.confirmed?'Okno potwierdzone (test)':p.origin==='MANUAL'?'Ręczna propozycja':'Automatyczna propozycja',p.address]:['Nieprzydzielone (kolejka)',p.ready?'Gotowe — parametr testowy':'Brak gotowości — parametr testowy',p.address];
    for(const text of lines){const line=document.createElement('span');line.textContent=text;node.append(line);}
    const edit=document.createElement('button');edit.type='button';edit.className='primary';edit.textContent='Edytuj w planerze';
    edit.addEventListener('click',()=>{popup?.remove();callbacks.onEdit(p.orderId);});node.append(edit);
    node.addEventListener('keydown',keyEvent=>{if(keyEvent.key==='Escape'){popup?.remove();callbacks.onPopupClosed?.(p.orderId);}});
    return node;
  };
  map.on('click',event=>{
    const feature=featureAt(event);if(!feature)return;
    const p=feature.properties;
    popup?.remove();popupOrder=p.orderId;popupSig=popupSignature(p);
    popup=new maplibregl.Popup({closeButton:true,maxWidth:'300px',focusAfterOpen:true}).setLngLat(feature.geometry.coordinates).setDOMContent(popupNode(p)).addTo(map);
    popup.on('close',()=>{if(popupOrder===p.orderId)popupOrder=null;});
    callbacks.onSelect?.(p.orderId);
  });
  for(const id of ['visits-installation','visits-measurement','unassigned','unassigned-measurement']) {
    map.on('mouseenter',id,()=>{map.getCanvas().style.cursor='pointer';});
    map.on('mouseleave',id,()=>{map.getCanvas().style.cursor='';});
  }
  map.on('error',event=>callbacks.onError?.(maskSecrets(event.error?.message??String(event.error??event))));
  // A lost GPU context must not leave the coordinator without a map: the planner falls back to SVG.
  map.getCanvas().addEventListener('webglcontextlost',()=>callbacks.onFatal?.('Utracono kontekst WebGL.'),{once:true});
  return {
    map,ready,
    async update(layers) {
      await ready;lastLayers=layers;
      map.getSource('visits').setData(layers.visits);map.getSource('routes').setData(layers.routes);map.getSource('unassigned').setData(layers.unassigned);
      // An open popup follows its order: refreshed from the new feature, closed when the order left this day's map.
      if(popupOrder) {
        const feature=[...layers.visits.features,...layers.unassigned.features].find(f=>f.properties.orderId===popupOrder);
        if(!feature){popup?.remove();popupOrder=null;}
        else if(popupSignature(feature.properties)!==popupSig) {
          // Rebuilding the content makes MapLibre focus its first control; keep focus where the user has it unless it was inside the popup.
          const active=document.activeElement,inside=active&&popup.getElement()?.contains(active);
          popupSig=popupSignature(feature.properties);
          popup.setLngLat(feature.geometry.coordinates).setDOMContent(popupNode(feature.properties));
          if(active&&!inside&&active!==document.body&&active.isConnected)active.focus({preventScroll:true});
        }
      }
    },
    async fit(bounds,options={}) {
      await ready;if(!bounds)return;
      const [w,s,e,n]=bounds,pad=0.002;
      map.fitBounds([[w-pad,s-pad],[e+pad,n+pad]],{padding:56,maxZoom:options.maxZoom??15,duration:options.duration??600});
    },
    async flyTo(coordinates,zoom=16){await ready;map.flyTo({center:coordinates,zoom:Math.max(map.getZoom(),zoom),duration:700});},
    async setRoadsVisible(on){await ready;roadsVisible=on;applyBasemap();},
    async setBasemap(mode,config){
      await ready;
      const removeSatellite=()=>{if(map.getLayer('satellite'))map.removeLayer('satellite');if(map.getSource('satellite'))map.removeSource('satellite');satelliteKey=null;};
      // Back to the local road map: drop the raster source so no further tile request is made.
      if(mode==='road')removeSatellite();
      else {
        const key=JSON.stringify([config.url,config.attribution]);
        if(satelliteKey!==key) {
          removeSatellite();
          map.addSource('satellite',{type:'raster',tiles:[config.url],tileSize:256,attribution:opEscape(config.attribution),maxzoom:19});
          map.addLayer({id:'satellite',type:'raster',source:'satellite'},'roads-casing');
          satelliteKey=key;
        }
      }
      basemap=mode;applyBasemap();
    },
    get basemap(){return basemap;},
    get layers(){return lastLayers;},
    resize(){map.resize();},
    destroy(){popup?.remove();map.remove();},
  };
}
