import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const fixture = JSON.parse(await readFile(new URL('../../map04/fixtures.json', import.meta.url), 'utf8'));
// Missing exports also fail as assertions, so the initial RED identifies absent behavior.
const api = await import('../model.mjs').catch(() => ({}));

test('uses all 19 synthetic jobs and derives both dates without assigning final teams', () => {
  assert.equal(typeof api.buildModel, 'function');
  const model = api.buildModel(fixture);
  assert.equal(model.jobs.length, 19);
  assert.equal(model.teams.length, 5);
  assert.deepEqual(model.dates, ['2026-11-18', '2026-11-19']);
  assert.equal(model.jobs.find(j => j.job_id === 'OPO-SYN-010').date, '2026-11-19');
  assert.equal(model.jobs[0].finalTeamId, null);
  assert.equal(model.jobs.find(j => j.job_id === 'KNU-SYN-004').fixtureTeamId, 'KNU-T2');
});

test('filters date, region, work and confirmation together; empty results clear selection', () => {
  assert.equal(typeof api.filterJobs, 'function');
  const model = api.buildModel(fixture);
  const jobs = api.filterJobs(model, {region:'OPO',date:'2026-11-18',type:'BSA',status:'CONFIRMED',query:''});
  assert.deepEqual(jobs.map(j=>j.job_id), ['OPO-SYN-002']);
  assert.equal(api.reconcileSelection(jobs, 'OPO-SYN-001'), 'OPO-SYN-002');
  assert.equal(api.reconcileSelection([], 'OPO-SYN-002'), null);
  assert.equal(api.filterJobs(model,{region:'KNU',date:'2026-11-19',type:'BSA',status:'ALL'}).length,0);
});

test('qualification candidates ignore fixture team hint and never claim free capacity', () => {
  assert.equal(typeof api.qualifiedTeams, 'function');
  const model=api.buildModel(fixture);
  const job=model.jobs.find(j=>j.job_id==='OPO-SYN-008');
  assert.deepEqual(api.qualifiedTeams(model,job).map(t=>t.team_id),['OPO-T3']);
  assert.equal(job.finalTeamId,null);
});

test('missing and ambiguous coordinates remain unplottable, never at zero or region anchor', () => {
  assert.equal(typeof api.hasCoordinates, 'function');
  const model=api.buildModel(fixture);
  for (const id of ['OPO-SYN-010','KNU-SYN-007']) {
    const job=model.jobs.find(j=>j.job_id===id);
    assert.equal(api.hasCoordinates(job),false);
    assert.equal(job.coordinates,null);
  }
  assert.equal(api.hasCoordinates({coordinates:[null,null]}),false);
  assert.equal(api.hasCoordinates({coordinates:[181,50]}),false);
  assert.equal(api.hasCoordinates({coordinates:[17.92,50.67],special_requirements:['LOCATION_AMBIGUOUS']}),false);
});

test('unverified BSA, missing availability, qualification mismatch and two-slot gaps warn independently', () => {
  assert.equal(typeof api.jobWarnings, 'function');
  const model=api.buildModel(fixture);
  const warnings=id=>api.jobWarnings(model,model.jobs.find(j=>j.job_id===id)).map(w=>w.code);
  assert.ok(warnings('OPO-SYN-011').includes('BSA_UNVERIFIED'));
  assert.ok(warnings('OPO-SYN-011').includes('AVAILABILITY_UNKNOWN'));
  assert.ok(warnings('OPO-SYN-008').includes('QUALIFICATION_MISMATCH'));
  assert.ok(warnings('OPO-SYN-008').includes('TWO_SLOTS_UNRESERVED'));
  assert.ok(warnings('OPO-SYN-012').includes('SHARED_PERSON'));
});

test('every routing metric remains unknown without converting synthetic service time into travel time', () => {
  assert.equal(typeof api.routeFacts, 'function');
  const facts=api.routeFacts();
  assert.deepEqual(facts,{distance:null,duration:null,geometry:null,status:'UNASSESSED'});
});

test('rejects non-synthetic or malformed input instead of showing plausible fallback data', () => {
  assert.equal(typeof api.buildModel, 'function');
  assert.throws(()=>api.buildModel({...fixture,synthetic_only:false}));
  assert.throws(()=>api.buildModel({synthetic_only:true,regions:{}}));
});

test('filtering never turns an occupied slot into an apparently empty slot', () => {
  assert.equal(typeof api.getSlotState, 'function');
  const model=api.buildModel(fixture);
  const team=model.teams.find(t=>t.team_id==='OPO-T2');
  const visible=api.filterJobs(model,{region:'OPO',date:'2026-11-18',type:'MPL',status:'ALL'});
  const slot=api.getSlotState(model,team,'2026-11-18',['08:00','11:00'],visible);
  assert.equal(slot.available,true);
  assert.equal(slot.occupiedCount,1);
  assert.equal(slot.hiddenEntriesCount,1);
  assert.equal(slot.entries.length,0);
  const unknown=api.getSlotState(model,team,'2026-11-19',['11:00','14:00'],[]);
  assert.equal(unknown.available,false);
  assert.equal(unknown.occupiedCount,0);
  assert.equal(unknown.hiddenEntriesCount,1);
});
