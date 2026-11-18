// MAP-08: pure builders for the two visual variants of the operational map.
// A: "Operational Light"  - quiet light base, strongly emphasised visits and routes.
// B: "Professional Navigation" - richer road hierarchy, dimmed surroundings, route-first look.
// Nothing here touches plan state; it only describes how already computed layers are drawn.

export const MAP_VARIANTS={
  light:{id:'light',label:'Operational Light',note:'Jasny podkład, dyskretne budynki, mocno wyróżnione wizyty i trasy.'},
  nav:{id:'nav',label:'Professional Navigation',note:'Wyrazista hierarchia dróg, ściszone otoczenie, nacisk na trasy ekip.'},
};
export const DEFAULT_VARIANT='light';

const PALETTES={
  light:{
    background:'#f3f4ef',water:'#c3dcec',forest:'#dce8d0',park:'#e2edd5',residential:'#ecebe4',industrial:'#e9e6ee',cemetery:'#dde6da',
    building:'#e3dfd5',buildingLine:'#cdc8bb',rail:'#b9bcb7',railDash:'#f3f4ef',
    roadCasing:{0:'#d9a46a',1:'#dcb374',2:'#dec27f',3:'#d4cfbe',4:'#d4cfbe',default:'#d8d5ca'},
    roadFill:{0:'#f4b777',1:'#f7cb84',2:'#f9da98',3:'#fdeeb9',4:'#ffffff',default:'#ffffff'},
    track:'#bdb497',label:'#44504a',labelHalo:'#ffffff',place:'#26332c',placeMinor:'#55605a',water_label:'#4f7fa0',
    routeCasing:'#ffffff',routeCasingWidth:[8.5,13],routeWidth:[4.5,7.5],dim:0.28,markerScale:1.3,roadBoost:0.9,
  },
  nav:{
    background:'#f0ece3',water:'#9fd0f7',forest:'#bfe0b2',park:'#c9e8b6',residential:'#e9e3d5',industrial:'#e3dae8',cemetery:'#c9ddc4',
    building:'#dcd3c6',buildingLine:'#c3b8a8',rail:'#8d9097',railDash:'#ffffff',
    roadCasing:{0:'#b8542a',1:'#c98a24',2:'#cfa43d',3:'#bdb7a6',4:'#bdb7a6',default:'#c7c2b4'},
    roadFill:{0:'#f08a5d',1:'#f9b94b',2:'#fcd770',3:'#fff6cf',4:'#ffffff',default:'#ffffff'},
    track:'#a89c7e',label:'#2e3a44',labelHalo:'#ffffff',place:'#1c2630',placeMinor:'#44505c',water_label:'#2f6ea0',
    routeCasing:'#ffffff',routeCasingWidth:[10,16],routeWidth:[6,9.5],dim:0.22,markerScale:1.4,roadBoost:1.22,
  },
};

const byRank=(map,fallback)=>['match',['get','rank'],0,map[0],1,map[1],2,map[2],3,map[3],4,map[4],fallback??map.default];
// Road widths grow exponentially with zoom; majors are drawn earlier and wider.
const roadWidth=(minor,major,boost=1)=>['interpolate',['exponential',1.55],['zoom'],
  6,['case',['<=',['get','rank'],2],major*0.18*boost,0],
  9,['case',['<=',['get','rank'],2],major*0.4*boost,['<=',['get','rank'],3],minor*0.4*boost,0],
  12,['case',['<=',['get','rank'],2],major*boost,['<=',['get','rank'],4],major*0.75*boost,minor*0.7*boost],
  15,['case',['<=',['get','rank'],2],major*2.4*boost,['<=',['get','rank'],4],major*2*boost,minor*1.7*boost],
  18,['case',['<=',['get','rank'],4],major*7*boost,minor*6*boost]];

export const BASE_LAYER_IDS=['background','landuse-forest','landuse-park','landuse-residential','landuse-industrial','landuse-cemetery','water','waterway','rail-casing','rail',
  'building','building-line','roads-casing','roads-fill','roads-track','road-labels','place-labels-minor','place-labels','town-labels'];
export const OPS_LAYER_IDS=['routes-casing','routes-dim','routes','routes-active-casing','routes-arrows','routes-leg-labels','unassigned-cluster','unassigned-cluster-count','unassigned','unassigned-measurement',
  'selected-ring','selected-ring-queue','visits-cluster','visits-cluster-count','visits-icon','visits-label'];

/** Layers drawn from the rich pack (landuse, water, rail, buildings, places); omitted for the roads-only fallback. */
function packLayers(p,v) {
  const landuse=(id,cls,color,minzoom)=>({id:`landuse-${id}`,type:'fill',source:'roads','source-layer':'landuse',minzoom,filter:['==',['get','class'],cls],paint:{'fill-color':color,'fill-antialias':false}});
  return [
    landuse('forest','forest',p.forest,9),landuse('park','park',p.park,12),landuse('residential','residential',p.residential,11),landuse('industrial','industrial',p.industrial,11),landuse('cemetery','cemetery',p.cemetery,13),
    {id:'water',type:'fill',source:'roads','source-layer':'water',minzoom:8,paint:{'fill-color':p.water}},
    {id:'waterway',type:'line',source:'roads','source-layer':'waterway',minzoom:9,layout:{'line-cap':'round'},paint:{'line-color':p.water,'line-width':['interpolate',['linear'],['zoom'],9,0.8,14,3,18,9]}},
    {id:'rail-casing',type:'line',source:'roads','source-layer':'rail',minzoom:10,paint:{'line-color':p.rail,'line-width':['interpolate',['linear'],['zoom'],10,1,16,3.4]}},
    {id:'rail',type:'line',source:'roads','source-layer':'rail',minzoom:12,paint:{'line-color':p.railDash,'line-width':['interpolate',['linear'],['zoom'],12,0.6,16,1.8],'line-dasharray':[3,3]}},
    {id:'building',type:'fill',source:'roads','source-layer':'building',minzoom:14,paint:{'fill-color':p.building,'fill-opacity':['interpolate',['linear'],['zoom'],14,0,15,0.9]}},
    {id:'building-line',type:'line',source:'roads','source-layer':'building',minzoom:15,paint:{'line-color':p.buildingLine,'line-width':0.6}},
  ];
}

function roadLayers(p,v,rich) {
  const minor=v==='nav'?3.2:2.6,major=v==='nav'?5:4.2,boost=p.roadBoost??1;
  return [
    {id:'roads-casing',type:'line',source:'roads','source-layer':'roads',filter:['<',['get','rank'],7],layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':byRank(p.roadCasing),'line-width':roadWidth(minor+1.4,major+1.8,boost)}},
    {id:'roads-fill',type:'line',source:'roads','source-layer':'roads',filter:['<',['get','rank'],7],layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':byRank(p.roadFill),'line-width':roadWidth(minor,major,boost)}},
    {id:'roads-track',type:'line',source:'roads','source-layer':'roads',minzoom:13,filter:['==',['get','rank'],7],paint:{'line-color':p.track,'line-width':1,'line-dasharray':[2,2]}},
    {id:'road-labels',type:'symbol',source:'roads','source-layer':'roads',minzoom:rich?12.5:12,filter:['all',['has','name'],['<',['get','rank'],7]],
      layout:{'symbol-placement':'line','text-field':['get','name'],'text-font':['sans-serif'],'text-size':['interpolate',['linear'],['zoom'],12,10,17,v==='nav'?15:14],'text-max-angle':35,'symbol-spacing':v==='nav'?260:320,'text-padding':2},
      paint:{'text-color':p.label,'text-halo-color':p.labelHalo,'text-halo-width':1.8}},
  ];
}

function placeLayers(p,v,rich,townsSource) {
  if(!rich)return [{id:'town-labels',type:'symbol',source:townsSource,maxzoom:14.5,layout:{'text-field':['get','name'],'text-font':['sans-serif'],'text-size':['interpolate',['linear'],['zoom'],7,11,12,15],'text-offset':[0,-1.4],'text-variable-anchor':['bottom','top','left','right']},paint:{'text-color':p.place,'text-halo-color':p.labelHalo,'text-halo-width':1.8}}];
  const size=(a,b,c)=>['interpolate',['linear'],['zoom'],6,a,10,b,15,c];
  return [
    {id:'place-labels-minor',type:'symbol',source:'roads','source-layer':'places',minzoom:12,filter:['in',['get','class'],['literal',['hamlet','quarter','neighbourhood','suburb']]],
      layout:{'text-field':['get','name'],'text-font':['sans-serif'],'text-size':size(10,11,13),'text-variable-anchor':['center','top','bottom'],'text-radial-offset':0.4,'text-padding':3},paint:{'text-color':p.placeMinor,'text-halo-color':p.labelHalo,'text-halo-width':1.6}},
    {id:'place-labels',type:'symbol',source:'roads','source-layer':'places',filter:['in',['get','class'],['literal',['city','town','village']]],
      layout:{'text-field':['case',['==',['get','class'],'city'],['upcase',['get','name']],['get','name']],'text-font':['sans-serif'],
        'text-size':['interpolate',['linear'],['zoom'],5,['match',['get','class'],'city',12,10],10,['match',['get','class'],'city',17,'town',14,12],15,['match',['get','class'],'city',20,'town',17,14]],
        'symbol-sort-key':['match',['get','class'],'city',0,'town',1,2],'text-variable-anchor':['center','top','bottom'],'text-radial-offset':0.5,'text-padding':4,'text-letter-spacing':0.04},
      paint:{'text-color':p.place,'text-halo-color':p.labelHalo,'text-halo-width':2}},
  ];
}

/** Base cartography for a variant. `rich` is true when the PMTiles pack is the road source. */
export function baseLayers({variant=DEFAULT_VARIANT,rich=false,townsSource='towns'}={}) {
  const p=PALETTES[variant]??PALETTES[DEFAULT_VARIANT];
  return [{id:'background',type:'background',paint:{'background-color':p.background}},...(rich?packLayers(p,variant):[]),...roadLayers(p,variant,rich),...placeLayers(p,variant,rich,townsSource)];
}

/** Operational layers (routes, visits, queue). Shapes: MPL circle, BSA square, POMIAR diamond. */
export function opsLayers({variant=DEFAULT_VARIANT}={}) {
  const p=PALETTES[variant]??PALETTES[DEFAULT_VARIANT],s=p.markerScale;
  const zoomWidth=([a,b],boost=1)=>['interpolate',['linear'],['zoom'],8,a*0.5*boost,12,a*boost,16,b*boost];
  const activeFilter=['==',['get','active'],true],dimFilter=['==',['get','active'],false];
  const iconName=['concat','op-',['get','shape'],'-',['get','teamId'],['case',['get','confirmed'],'-c','']];
  const clusterPaint=color=>({'circle-color':color,'circle-radius':['step',['get','point_count'],14,5,17,15,21],'circle-stroke-color':'#ffffff','circle-stroke-width':2.5,'circle-opacity':0.95});
  return [
    {id:'routes-casing',type:'line',source:'routes',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':p.routeCasing,'line-width':zoomWidth(p.routeCasingWidth),'line-opacity':['case',dimFilter,0.35,0.95]}},
    {id:'routes-dim',type:'line',source:'routes',filter:dimFilter,layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':['get','color'],'line-width':zoomWidth(p.routeWidth),'line-opacity':p.dim}},
    {id:'routes',type:'line',source:'routes',filter:activeFilter,layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':['get','color'],'line-width':zoomWidth(p.routeWidth)}},
    {id:'routes-active-casing',type:'line',source:'routes',filter:['all',activeFilter,['==',['get','focused'],true]],layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#111827','line-width':1.2,'line-gap-width':zoomWidth(p.routeWidth,1.25),'line-opacity':0.55}},
    {id:'routes-arrows',type:'symbol',source:'routes',minzoom:11,filter:activeFilter,layout:{'symbol-placement':'line','symbol-spacing':90,'text-field':'▶','text-size':['interpolate',['linear'],['zoom'],11,9,16,15],'text-font':['sans-serif'],'text-keep-upright':false,'text-allow-overlap':true,'text-ignore-placement':true},paint:{'text-color':'#ffffff','text-halo-color':['get','color'],'text-halo-width':1.4}},
    {id:'routes-leg-labels',type:'symbol',source:'routes',minzoom:10.5,filter:activeFilter,layout:{'symbol-placement':'line-center','text-field':['get','distanceLabel'],'text-font':['sans-serif'],'text-size':['interpolate',['linear'],['zoom'],10.5,10,16,13],'text-offset':[0,-1.1],'text-padding':4,'text-allow-overlap':false},paint:{'text-color':'#111827','text-halo-color':'#ffffff','text-halo-width':2.2}},
    {id:'unassigned-cluster',type:'circle',source:'unassigned',filter:['has','point_count'],paint:clusterPaint('#7b857e')},
    {id:'unassigned-cluster-count',type:'symbol',source:'unassigned',filter:['has','point_count'],layout:{'text-field':['get','point_count_abbreviated'],'text-font':['sans-serif'],'text-size':12,'text-allow-overlap':true},paint:{'text-color':'#ffffff'}},
    {id:'unassigned',type:'circle',source:'unassigned',filter:['all',['!',['has','point_count']],['==',['get','kind'],'installation']],paint:{'circle-radius':['interpolate',['linear'],['zoom'],7,3.5*s,14,6.5*s],'circle-color':'#9aa19a','circle-stroke-color':'#ffffff','circle-stroke-width':1.6}},
    {id:'unassigned-measurement',type:'symbol',source:'unassigned',filter:['all',['!',['has','point_count']],['==',['get','kind'],'measurement']],layout:{'icon-image':'op-diamond-queue','icon-size':['interpolate',['linear'],['zoom'],7,0.35*s,14,0.6*s],'icon-allow-overlap':true}},
    {id:'selected-ring',type:'circle',source:'visits',filter:['all',['!',['has','point_count']],['==',['get','selected'],true]],paint:{'circle-radius':20*s,'circle-color':'rgba(0,0,0,0)','circle-stroke-color':'#111827','circle-stroke-width':3}},
    {id:'selected-ring-queue',type:'circle',source:'unassigned',filter:['all',['!',['has','point_count']],['==',['get','selected'],true]],paint:{'circle-radius':12,'circle-color':'rgba(0,0,0,0)','circle-stroke-color':'#111827','circle-stroke-width':3}},
    {id:'visits-cluster',type:'circle',source:'visits',filter:['has','point_count'],paint:clusterPaint('#24332c')},
    {id:'visits-cluster-count',type:'symbol',source:'visits',filter:['has','point_count'],layout:{'text-field':['get','point_count_abbreviated'],'text-font':['sans-serif'],'text-size':13,'text-allow-overlap':true},paint:{'text-color':'#ffffff'}},
    {id:'visits-icon',type:'symbol',source:'visits',filter:['!',['has','point_count']],layout:{'icon-image':iconName,'icon-size':['interpolate',['linear'],['zoom'],8,0.7*s,14,1*s],'icon-allow-overlap':true,'icon-ignore-placement':true,'symbol-sort-key':['get','seq']}},
    {id:'visits-label',type:'symbol',source:'visits',filter:['!',['has','point_count']],layout:{'text-field':['get','label'],'text-font':['sans-serif'],'text-size':['interpolate',['linear'],['zoom'],8,11,14,14],'text-allow-overlap':true,'text-ignore-placement':true,'symbol-sort-key':['get','seq']},paint:{'text-color':'#ffffff','text-halo-color':'rgba(0,0,0,0.45)','text-halo-width':1}},
  ];
}

export const SHAPES={MPL:'circle',BSA:'square',POMIAR:'diamond'};

/** Canvas drawing for marker shapes; `confirmed` adds a thick dark ring. Returns ImageData. */
export function markerImage(shape,color,{confirmed=false,size=36}={}) {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
  const g=canvas.getContext('2d'),m=size/2,r=size/2-4;
  g.beginPath();
  if(shape==='circle')g.arc(m,m,r,0,Math.PI*2);
  else if(shape==='square'){const a=r*0.9,k=5;g.moveTo(m-a+k,m-a);g.arcTo(m+a,m-a,m+a,m+a,k);g.arcTo(m+a,m+a,m-a,m+a,k);g.arcTo(m-a,m+a,m-a,m-a,k);g.arcTo(m-a,m-a,m+a,m-a,k);g.closePath();}
  else{const d=r*1.12;g.moveTo(m,m-d);g.lineTo(m+d,m);g.lineTo(m,m+d);g.lineTo(m-d,m);g.closePath();}
  g.fillStyle=color;g.fill();
  if(confirmed){g.lineWidth=6;g.strokeStyle='#111827';g.stroke();g.lineWidth=2;g.strokeStyle='#ffffff';g.stroke();}
  else{g.lineWidth=3;g.strokeStyle='#ffffff';g.stroke();}
  return g.getImageData(0,0,size,size);
}
