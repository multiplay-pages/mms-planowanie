import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createMapFrame,projectMapPoint,mapGeometryPath} from '../map.mjs';
import {prepareMapFeatures,visibleMapFeatures,mapFeaturePath} from '../planner-map.mjs';

test('regional street detail keeps nearby vertices distinct when zoomed in',()=>{
  const frame=createMapFrame([[17.2,49.9],[19,51.5]],680,380);
  const points=[[18,50.1],[18.00001,50.1]];
  const path=mapGeometryPath(points,frame,4).split(' ');
  assert.notEqual(path[0].slice(1),path[1].slice(1),'a one-metre segment must not collapse at regional scale');
});

test('viewport detail shows local streets around a selected point beyond the old Opole extract',()=>{
  const frame=createMapFrame([[17.2,49.9],[19,51.5]],680,380);
  const map={features:[{id:'r',kind:'road',category:'residential',name:'Local street',points:[[18.6,50.1],[18.61,50.1]]},{id:'o',kind:'road',category:'primary',name:'Opole',points:[[17.9,50.67],[17.91,50.67]]}]};
  const prepared=prepareMapFeatures(map,frame),point=projectMapPoint([18.605,50.1],frame);
  const visible=visibleMapFeatures(prepared,[point[0]-2,point[1]-2,4,4]);
  assert.deepEqual(visible.map(item=>item.feature.id),['r']);
  assert.match(mapFeaturePath(visible[0],frame),/^M.* L/);
  assert.ok(visible.every(item=>item.feature.name!=='Opole'));
});

test('wide-view detail is bounded and does not substitute local streets for major roads',()=>{
  const frame=createMapFrame([[17.2,49.9],[19,51.5]],680,380);
  const features=Array.from({length:4000},(_,index)=>({id:String(index),kind:'road',category:index%2?'residential':'primary',name:'',points:[[18+index*.000001,50.1],[18.1,50.2]]}));
  const visible=visibleMapFeatures(prepareMapFeatures({features},frame),[0,0,680,380],300);
  assert.ok(visible.length>0&&visible.length<=300);
  assert.ok(visible.every(item=>item.feature.category==='primary'));
});

test('over-limit regional view keeps legible long roads instead of sub-pixel fragments',()=>{
  const frame=createMapFrame([[17.2,49.9],[19,51.5]],680,380);
  // 400 one-metre motorway pieces would render as specks; 50 long primary roads form the visible network.
  const specks=Array.from({length:400},(_,index)=>({id:`s${index}`,kind:'road',category:'motorway',name:'',points:[[17.3+index*.003,50.2],[17.30001+index*.003,50.2]]}));
  const roads=Array.from({length:50},(_,index)=>({id:`r${index}`,kind:'road',category:'primary',name:'',points:[[17.3,50.3+index*.02],[18.9,50.3+index*.02]]}));
  const visible=visibleMapFeatures(prepareMapFeatures({features:[...specks,...roads]},frame),[0,0,680,380],300);
  const ids=new Set(visible.map(item=>item.feature.id));
  assert.ok(visible.length<=300);
  assert.ok(roads.every(road=>ids.has(road.id)),'every long road must be drawn');
  assert.ok(visible.every(item=>!item.feature.id.startsWith('s')),'sub-pixel fragments are not drawn when detail is limited');
});

test('label and scale halos keep a constant screen width at street zoom',async()=>{
  const css=await readFile(new URL('../planner.css',import.meta.url),'utf8');
  const rule=selector=>{const match=css.match(new RegExp(`(?:^|})\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\s*\\{([^}]*)\\}`));assert.ok(match,selector);return match[1];};
  // A 3px halo without non-scaling-stroke grows with the viewBox zoom and covers the streets.
  for(const selector of ['.map-road-label','.map-town-label','.map-selected-label','.map-scale text','.map-scale line'])assert.match(rule(selector),/vector-effect:\s*non-scaling-stroke/,selector);
  assert.match(rule('.basket-head button'),/min-height:\s*(2[4-9]|[3-9]\d)px/,'basket map button meets a 24px target');
});

test('compact regional map decodes the same public road without duplicating all points upfront',()=>{
  const frame=createMapFrame([[-130,35],[-110,50]],680,380);
  const map={encoding:'polyline5-indexed',categories:['primary'],names:['Reference Road'],features:[['123',0,0,'_p~iF~ps|U_ulLnnqC_mqNvxq`@',[-126.453,38.5,-120.2,43.252]]]};
  const prepared=prepareMapFeatures(map,frame);
  assert.equal(prepared.length,1);assert.equal(prepared[0].feature.name,'Reference Road');
  assert.match(mapFeaturePath(prepared[0],frame),/^M.* L/);
  assert.deepEqual(prepared[0].feature.points[0],[-120.2,38.5]);
  assert.deepEqual(prepared[0].feature.points.at(-1),[-126.453,43.252]);
});
