import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const map=await import('../map.mjs').catch(()=>({}));
const fixture=JSON.parse(await readFile(new URL('../../map04/fixtures.json',import.meta.url),'utf8'));

test('basemap and markers share a non-distorted projection with north above south',()=>{
  assert.equal(typeof map.createMapFrame,'function');
  const frame=map.createMapFrame([[-1,-1],[1,1]],680,420);
  const p=map.projectMapPoint([0,0],frame);
  assert.ok(Math.abs(p[0]-340)<0.01);
  assert.ok(Math.abs(p[1]-210)<0.1);
  const north=map.projectMapPoint([0,1],frame),south=map.projectMapPoint([0,-1],frame);
  assert.ok(north[1]<south[1]);
  assert.equal(map.mapGeometryPath([[0,0],[0,1]],frame),'M340.0,210.0 L340.0,32.0');
});

test('all geolocated fixture jobs fit their own region while unknown points stay absent',()=>{
  assert.equal(typeof map.createMapFrame,'function');
  for(const region of Object.values(fixture.regions)){
    const points=region.jobs.filter(j=>j.coordinates).map(j=>j.coordinates);
    const frame=map.createMapFrame(points,680,420);
    for(const point of points){const [x,y]=map.projectMapPoint(point,frame);assert.ok(x>=24&&x<=656);assert.ok(y>=24&&y<=396);}
  }
  assert.equal(map.projectMapPoint(null,map.createMapFrame([[17.9,50.6]],680,420)),null);
});

test('both bundled backgrounds contain source-attributed road geometry rather than fixture connections',async()=>{
  const data=JSON.parse(await readFile(new URL('../basemap/data.json',import.meta.url),'utf8').catch(()=>'{}'));
  assert.equal(data.license,'ODbL-1.0');
  for(const region of ['OPO','KNU']){
    const roads=data.regions[region].features.filter(f=>f.kind==='road');
    assert.ok(roads.length>0);
    if(region==='OPO') assert.ok(roads.some(road=>road.name));
    assert.ok(data.regions[region].sources.every(url=>url.startsWith('https://api.openstreetmap.org/api/0.6/map?bbox=')));
    assert.ok(roads.every(road=>road.points.length>=2&&road.points.every(p=>p.length===2&&p.every(Number.isFinite))));
  }
});
