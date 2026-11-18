import test from 'node:test';
import assert from 'node:assert/strict';
import {baseLayers,opsLayers,BASE_LAYER_IDS,OPS_LAYER_IDS,MAP_VARIANTS,DEFAULT_VARIANT} from '../map-style.mjs';
import {OP_LAYER_GROUPS,OP_DEFAULT_FLAGS} from '../maplibre-view.mjs';

const SOURCES=new Set(['roads','towns','routes','unassigned','visits']);
const PACK_LAYERS=new Set(['roads','places','building','landuse','water','waterway','rail']);

// Walks a MapLibre expression/value tree: every number must be finite (an array multiplied by a number silently becomes NaN).
function assertSane(value,where) {
  if(typeof value==='number')assert.ok(Number.isFinite(value),`non-finite number in ${where}`);
  else if(Array.isArray(value))value.forEach(item=>assertSane(item,where));
  else if(value&&typeof value==='object')Object.entries(value).forEach(([key,item])=>assertSane(item,`${where}.${key}`));
}

for(const variant of Object.keys(MAP_VARIANTS)) for(const rich of [false,true]) {
  test(`style ${variant}/${rich?'pack':'roads-only'}: unique ids, known sources, finite numbers`,()=>{
    const layers=[...baseLayers({variant,rich}),...opsLayers({variant})];
    const ids=layers.map(layer=>layer.id);
    assert.equal(new Set(ids).size,ids.length,'layer ids are unique');
    assert.equal(layers[0].id,'background');
    for(const layer of layers) {
      if(layer.source)assert.ok(SOURCES.has(layer.source),`${layer.id} uses unknown source ${layer.source}`);
      if(layer['source-layer'])assert.ok(PACK_LAYERS.has(layer['source-layer']),`${layer.id} uses unknown source-layer`);
      assertSane(layer.paint,`${layer.id}.paint`);assertSane(layer.layout,`${layer.id}.layout`);assertSane(layer.filter,`${layer.id}.filter`);
    }
    assert.deepEqual(baseLayers({variant,rich}).map(layer=>layer.id).filter(id=>!BASE_LAYER_IDS.includes(id)),[],'every base layer is registered for visibility switching');
    assert.deepEqual(opsLayers({variant}).map(layer=>layer.id).sort(),[...OPS_LAYER_IDS].sort(),'ops layers match their registry');
    if(!rich)assert.ok(!ids.includes('building')&&!ids.includes('water'),'roads-only fallback draws no pack layers');
    if(rich)for(const id of ['building','water','landuse-forest','place-labels','rail'])assert.ok(ids.includes(id),`${id} present with the pack`);
  });
}

test('every layer-switch group references existing layers and has a default',()=>{
  const all=new Set([...BASE_LAYER_IDS,...OPS_LAYER_IDS]);
  for(const [group,ids] of Object.entries(OP_LAYER_GROUPS)) {
    assert.ok(group in OP_DEFAULT_FLAGS,`${group} has a default`);
    for(const id of ids)assert.ok(all.has(id),`${group}: ${id} is not a registered layer`);
  }
});

test('the two variants are really different designs, not one palette',()=>{
  const color=(variant,id,key)=>JSON.stringify(baseLayers({variant,rich:true}).find(layer=>layer.id===id).paint[key]);
  assert.notEqual(color('light','roads-fill','line-color'),color('nav','roads-fill','line-color'));
  assert.notEqual(color('light','water','fill-color'),color('nav','water','fill-color'));
  assert.notEqual(color('light','roads-fill','line-width'),color('nav','roads-fill','line-width'));
  const width=variant=>opsLayers({variant}).find(layer=>layer.id==='routes').paint['line-width'];
  assert.ok(width('nav')[width('nav').length-1]>width('light')[width('light').length-1],'navigation variant draws routes thicker');
  assert.equal(DEFAULT_VARIANT,'light');
});

test('routes, arrows and leg labels only show active routes; dimmed routes stay as context',()=>{
  const ops=opsLayers({variant:'light'});
  const get=id=>ops.find(layer=>layer.id===id);
  for(const id of ['routes','routes-arrows','routes-leg-labels'])assert.deepEqual(get(id).filter.slice(0,3).flat(2).includes('active'),true,`${id} filters on active`);
  assert.deepEqual(get('routes-dim').filter,['==',['get','active'],false]);
});

test('cluster layers never draw as individual numbered markers',()=>{
  const ops=opsLayers({variant:'light'});
  for(const id of ['visits-icon','visits-label','unassigned','unassigned-measurement']) {
    const filter=JSON.stringify(ops.find(layer=>layer.id===id).filter);
    assert.ok(filter.includes('point_count'),`${id} excludes clusters`);
  }
  for(const id of ['visits-cluster','unassigned-cluster'])assert.deepEqual(ops.find(layer=>layer.id===id).filter,['has','point_count']);
});
