import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {mergeGeocoding,hasLocation,locationLabel,summarizeLocations,locationReasonText} from '../locations.mjs';
import {createScenario,createPlan,applyAction,restorePlan} from '../planner-model.mjs';

const dataset=JSON.parse(await readFile(new URL('../data/addresses.json',import.meta.url),'utf8'));
const layer=JSON.parse(await readFile(new URL('../data/geocoding.json',import.meta.url),'utf8'));
const uug=JSON.parse(await readFile(new URL('../data/uug-geocoding.json',import.meta.url),'utf8'));
const clone=value=>structuredClone(value);

test('validated layer adds exactly 46 building matches and keeps 63 candidates off the map',()=>{
  const addresses=mergeGeocoding(dataset,layer);
  assert.deepEqual(summarizeLocations(addresses),{total:109,matched:46,review:63,missing:0});
  assert.equal(addresses.filter(hasLocation).length,46);
  assert.equal(addresses[0].coordinates,null);
  assert.deepEqual(addresses[0].geocoding.candidate.coordinates,[17.7596062,50.6502427]);
  assert.match(locationLabel(addresses[0]),/weryfikacji/);
  assert.match(locationLabel(addresses[1]),/Dopasowany budynek/);
  assert.equal(dataset.addresses[1].coordinates,null,'catalog never mutated');
});

test('incomplete foreign duplicate or unknown layer identities fail closed',()=>{
  for(const change of [
    value=>{value.datasetId='other';},
    value=>{value.records.pop();},
    value=>{value.records[0]=clone(value.records[1]);},
    value=>{value.records[0].addressId='other';},
  ]) {
    const bad=clone(layer);change(bad);assert.throws(()=>mergeGeocoding(dataset,bad),/lokalizac|adres|zbior/);
  }
});

test('review coordinates, inconsistent status, nonfinite or low confidence matches are rejected',()=>{
  for(const change of [
    value=>{value.records[0].coordinates=[18,50];},
    value=>{value.records[1].coordinates=[0,0];},
    value=>{value.records[1].candidate.confidence.building=null;},
    value=>{value.records[1].reasons=['BUILDING_MISMATCH'];},
    value=>{value.records[1].candidate.coordinates=[18.1,50.1];},
  ]) {
    const bad=clone(layer);change(bad);assert.throws(()=>mergeGeocoding(dataset,bad),/lokalizac|współrzęd|dopasowa/);
  }
  assert.equal(hasLocation({coordinates:[NaN,50],locationStatus:'MATCHED_BUILDING'}),false);
  assert.equal(hasLocation({coordinates:[18,50],locationStatus:'REVIEW_REQUIRED'}),false);
});

test('geocoding enrichment preserves order IDs datasetId saved baskets and manual holds',()=>{
  const before=createScenario(dataset),after=createScenario(dataset,layer);
  assert.equal(after.datasetId,before.datasetId);
  assert.deepEqual(after.orders,before.orders);
  assert.equal(after.addresses.filter(hasLocation).length,46);
  let plan=applyAction(before,createPlan(before),{type:'GENERATE',date:'2026-11-18'});
  plan=applyAction(before,plan,{type:'REMOVE',orderId:plan.assignments[0].orderId});
  assert.deepEqual(restorePlan(after,JSON.stringify(plan)),plan);
});

test('GUGiK adds 96 exact points and 6 clearly identified postcode differences without changing source fields',()=>{
  const addresses=mergeGeocoding(dataset,uug);
  assert.deepEqual(summarizeLocations(addresses),{total:109,matched:102,review:7,missing:0});
  assert.equal(addresses.filter(a=>a.locationStatus==='MATCHED_BUILDING_POSTCODE_NOTE').length,6);
  assert.equal(addresses[0].geocoding.candidate.housenumber,'32a');
  assert.ok(hasLocation(addresses[0]));assert.match(locationLabel(addresses[0]),/GUGiK/);
  const noted=addresses.find(a=>a.locationStatus==='MATCHED_BUILDING_POSTCODE_NOTE');
  assert.notEqual(noted.postcode,noted.geocoding.candidate.postcode);
  assert.equal(noted.postcode,dataset.addresses.find(a=>a.id===noted.id).postcode);
  const before=createScenario(dataset,layer),after=createScenario(dataset,uug);
  const saved=applyAction(before,createPlan(before),{type:'GENERATE',date:'2026-11-18'});
  assert.deepEqual(restorePlan(after,JSON.stringify(saved)),saved);
});

test('GUGiK provider rules reject forged street numbers and ambiguous postal notes',()=>{
  for(const mutate of [
    value=>{value.records[0].candidate.housenumber='32';},
    value=>{value.records[0].candidate.city='Other';},
    value=>{value.records.find(r=>r.status==='MATCHED_BUILDING_POSTCODE_NOTE').matchEvidence.returnedCount=2;},
    value=>{value.source.srid=2180;},
  ]) {const bad=clone(uug);mutate(bad);assert.throws(()=>mergeGeocoding(dataset,bad),/lokalizac|dopasowa/);}
  const lowAggregate=clone(uug);lowAggregate.records[0].candidate.confidence.overall=.444;
  assert.ok(hasLocation(mergeGeocoding(dataset,lowAggregate)[0]),'UUG scores are not Geoapify scores');
});

const fallbackReasonText='Wymagana weryfikacja wyniku';

test('locationReasonText describes every reason code used by Geoapify and GUGiK',()=>{
  const codes=new Set([layer,uug].flatMap(({records})=>records.flatMap(({reasons})=>reasons)));
  assert.ok(codes.size>0,'geocoding layers must contain reason codes');
  for(const code of codes) {
    const text=locationReasonText(code);
    assert.match(text,/\S/,`expected a non-empty description for ${code}`);
    assert.notEqual(text,fallbackReasonText,`missing description for ${code}`);
  }
});

test('locationReasonText returns the fallback for unknown and missing codes',()=>{
  assert.equal(locationReasonText('UNKNOWN_CODE'),fallbackReasonText);
  assert.equal(locationReasonText(undefined),fallbackReasonText);
});

test('locationReasonText preserves the coordinator text for POSTCODE_DIFFERENCE',()=>{
  assert.equal(locationReasonText('POSTCODE_DIFFERENCE'),
    'Różny kod pocztowy usługi — zachowano kod źródłowy');
});
