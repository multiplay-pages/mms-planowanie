// Component integration tests, not browser automation or visual verification.
// Only trusted project source runs in Node; Window supplies an in-memory DOM.
// No navigation, network, file URLs, graphical renderer, or existing browser tab.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {Window} from 'happy-dom';
import * as modelApi from '../model.mjs';
import * as mapApi from '../map.mjs';

const [markup,source,fixture,mapData]=await Promise.all([
  readFile(new URL('../index.html',import.meta.url),'utf8'),
  readFile(new URL('../app.mjs',import.meta.url),'utf8'),
  readFile(new URL('../../map04/fixtures.json',import.meta.url),'utf8').then(JSON.parse),
  readFile(new URL('../basemap/data.json',import.meta.url),'utf8').then(JSON.parse),
]);

async function mount(t,options={}) {
  const window=new Window({settings:{
    enableJavaScriptEvaluation:false,
    disableJavaScriptFileLoading:true,
    enableCSSFileLoading:false,
    enableImageFileLoading:false,
    enableIframePageLoading:false,
    navigation:{disableMainFrameNavigation:true,disableChildFrameNavigation:true,disableChildPageNavigation:true,disableFallbackToSetURL:true},
  }});
  const networkCalls=[],errors=[];
  const denyNetwork=async url=>{networkCalls.push(String(url));throw new Error('Network is forbidden in component tests');};
  window.fetch=denyNetwork;
  window.document.write(markup.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,''));
  for(const [id,value] of [['map04-data',options.fixture??fixture],['basemap-data',Object.hasOwn(options,'basemap')?options.basemap:mapData]]) {
    const script=window.document.createElement('script');
    script.type='application/json';script.id=id;script.textContent=JSON.stringify(value);
    window.document.body.append(script);
  }
  window.addEventListener('error',event=>errors.push(event.error?.message??event.message));
  const context=vm.createContext({document:window.document,MouseEvent:window.MouseEvent,fetch:denyNetwork,Intl,console,...modelApi,...mapApi});
  vm.runInContext(source.replace(/^import[^\n]*\n/gm,''),context,{filename:'map05/app.mjs',timeout:10000});
  await Promise.resolve();
  const $=selector=>window.document.querySelector(selector);
  const all=selector=>[...window.document.querySelectorAll(selector)];
  const change=(selector,value)=>{const node=$(selector);node.value=value;node.dispatchEvent(new window.Event('change',{bubbles:true}));};
  const input=value=>{const node=$('#search');node.value=value;node.dispatchEvent(new window.Event('input',{bubbles:true}));};
  const click=selector=>{const node=$(selector);assert.ok(node,`Missing control: ${selector}`);node.dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true}));};
  const ids=()=>all('#job-list [data-job]').map(node=>node.dataset.job);
  const selected=()=>$('#details-title').textContent;
  t.after(async()=>{
    await window.happyDOM.abort();
    assert.deepEqual(networkCalls,[],'No network request may leave the component test');
    assert.deepEqual(errors,[],'Application event handlers must not throw');
  });
  return {window,$,all,change,input,click,ids,selected};
}

test('UI starts with nine OPO jobs, real background paths and a selected job',async t=>{
  const ui=await mount(t);
  assert.equal(ui.$('#application').hidden,false);
  assert.equal(ui.$('#failure').hidden,true);
  assert.equal(ui.ids().length,9);
  assert.equal(ui.all('#point-map .point').length,9);
  assert.equal(ui.all('.basemap-road path').length,2515);
  assert.ok(ui.all('.map-street-label').length>0);
  assert.equal(ui.$('#map-attribution').hidden,false);
  assert.equal(ui.selected(),'OPO-SYN-001');
  assert.deepEqual(ui.all('#summary .summary-item>strong').map(node=>node.textContent),['9','3','3','1']);
});

test('UI selection synchronizes list, SVG marker, coordinates and schedule; Enter/Space activate markers',async t=>{
  const ui=await mount(t);
  ui.click('#job-list [data-job="OPO-SYN-002"]');
  assert.equal(ui.selected(),'OPO-SYN-002');
  assert.equal(ui.$('#point-map [data-job="OPO-SYN-002"]').getAttribute('aria-pressed'),'true');
  assert.equal(ui.$('#schedule [data-job="OPO-SYN-002"]').getAttribute('aria-pressed'),'true');
  ui.click('#point-map [data-job="OPO-SYN-004"]');
  assert.equal(ui.selected(),'OPO-SYN-004');
  ui.click('#schedule [data-job="OPO-SYN-005"]');
  assert.equal(ui.selected(),'OPO-SYN-005');
  ui.click('[data-view="list"]');
  assert.equal(ui.$('#coordinate-view').hidden,false);
  assert.equal(ui.$('#point-view').hidden,true);
  ui.click('#coordinate-view [data-job="OPO-SYN-006"]');
  assert.equal(ui.selected(),'OPO-SYN-006');
  ui.click('[data-view="points"]');
  for(const [id,key] of [['OPO-SYN-007','Enter'],['OPO-SYN-008',' ']]) {
    ui.$(`#point-map [data-job="${id}"]`).dispatchEvent(new ui.window.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));
    assert.equal(ui.selected(),id);
    assert.equal(ui.window.document.activeElement.dataset.job,id);
  }
});

test('UI filters preserve true occupancy and expose the two-slot/qualification warnings',async t=>{
  const ui=await mount(t);
  ui.change('#type-filter','BSA');ui.change('#status-filter','QUEUE');
  assert.deepEqual(ui.ids(),['OPO-SYN-005','OPO-SYN-008']);
  assert.equal(ui.all('#point-map .point').length,2);
  assert.match(ui.$('#schedule').textContent,/Zajętość fixture: 1/);
  assert.match(ui.$('#schedule').textContent,/Wpisy poza filtrami: 1/);
  ui.click('#job-list [data-job="OPO-SYN-008"]');
  assert.match(ui.$('#details').textContent,/Dwa sloty — brak pełnej rezerwacji/);
  assert.match(ui.$('#details').textContent,/Wskazanie fixture bez kwalifikacji/);
  assert.match(ui.$('#details').textContent,/D−1 · ekipa nieprzydzielona/);
});

test('UI date 19 exposes missing location, unverified BSA, shared personnel and unavailable teams',async t=>{
  const ui=await mount(t);
  ui.change('#date-filter','2026-11-19');
  assert.deepEqual(ui.ids(),['OPO-SYN-010','OPO-SYN-011','OPO-SYN-012']);
  assert.equal(ui.all('#point-map .point').length,2);
  assert.equal(ui.$('#point-map [data-job="OPO-SYN-010"]'),null);
  assert.match(ui.$('#unlocated').textContent,/OPO-SYN-010/);
  assert.equal(ui.all('#schedule td').filter(node=>node.textContent.includes('Brak dostępności fixture')).length,9);
  ui.click('#job-list [data-job="OPO-SYN-011"]');
  assert.match(ui.$('#details').textContent,/Termin BSA niezweryfikowany/);
  ui.click('#job-list [data-job="OPO-SYN-012"]');
  assert.match(ui.$('#details').textContent,/Ryzyko wspólnego personelu/);
});

test('UI switches to the actual KNU background, retains TEST ONLY and excludes ambiguous location',async t=>{
  const ui=await mount(t);
  ui.click('[data-region="KNU"]');
  assert.equal(ui.ids().length,6);
  assert.equal(ui.all('.basemap-road path').length,82);
  assert.equal(ui.all('#team-tray .team-chip').length,2);
  assert.equal(ui.$('#region-notice').hidden,false);
  assert.match(ui.$('#region-notice').textContent,/TEST ONLY/);
  ui.change('#date-filter','2026-11-19');
  assert.deepEqual(ui.ids(),['KNU-SYN-007']);
  assert.equal(ui.all('#point-map .point').length,0);
  assert.match(ui.$('#unlocated').textContent,/KNU-SYN-007/);
  assert.match(ui.$('#details').textContent,/Niejednoznaczna lokalizacja/);
});

test('UI empty results clear selection and markers; reset recovers visible jobs',async t=>{
  const ui=await mount(t);
  ui.input('no-such-synthetic-job');
  assert.deepEqual(ui.ids(),[]);
  assert.equal(ui.all('#point-map .point').length,0);
  assert.equal(ui.selected(),'Brak wybranego zlecenia');
  assert.equal(ui.$('#open-review'),null);
  ui.click('[data-reset]');
  assert.equal(ui.ids().length,9);
  assert.equal(ui.selected(),'OPO-SYN-001');
  assert.equal(ui.window.document.activeElement.id,'search');
});

test('UI local note is escaped, never changes confirmation/warnings, and disappears in a fresh session',async t=>{
  const ui=await mount(t);
  ui.change('#date-filter','2026-11-19');ui.click('#job-list [data-job="OPO-SYN-011"]');
  const warningsBefore=ui.all('#details .warning-box').map(node=>node.textContent);
  ui.click('#open-review');
  assert.equal(ui.$('#review-dialog').open,true);
  assert.equal(ui.window.document.activeElement.id,'review-note');
  ui.$('#review-note').value='  ';ui.$('#review-form').dispatchEvent(new ui.window.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(ui.$('#review-dialog').open,true);
  assert.equal(ui.$('#details .detail-note'),null);
  ui.$('#review-note').value='<b>Sprawdź termin</b>';
  ui.$('#review-note').dispatchEvent(new ui.window.Event('input',{bubbles:true}));
  ui.$('#review-form').dispatchEvent(new ui.window.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(ui.$('#review-dialog').open,false);
  assert.equal(ui.window.document.activeElement.id,'open-review');
  assert.match(ui.$('#details .detail-note').textContent,/<b>Sprawdź termin<\/b>/);
  assert.equal(ui.$('#details .detail-note b'),null);
  assert.deepEqual(ui.all('#details .warning-box').map(node=>node.textContent),warningsBefore);
  assert.match(ui.$('#details').textContent,/Do umówienia/);
  const fresh=await mount(t);fresh.change('#date-filter','2026-11-19');fresh.click('#job-list [data-job="OPO-SYN-011"]');
  assert.equal(fresh.$('#details .detail-note'),null);
});

test('UI cancel closes the note dialog without saving a decision',async t=>{
  const ui=await mount(t);
  ui.click('#open-review');ui.$('#review-note').value='Nie zapisuj';ui.click('#cancel-review');
  assert.equal(ui.$('#review-dialog').open,false);
  assert.equal(ui.$('#details .detail-note'),null);
  assert.equal(ui.window.document.activeElement.id,'open-review');
});

test('UI missing background reports the fallback rather than implying a real map',async t=>{
  const ui=await mount(t,{basemap:null});
  assert.equal(ui.ids().length,9);
  assert.match(ui.$('#map-status').textContent,/Brak podkładu mapy/);
  assert.equal(ui.all('.basemap-road path').length,0);
  assert.equal(ui.$('#map-attribution').hidden,true);
});

test('UI rejects non-synthetic data with a visible error and no plausible fallback jobs',async t=>{
  const ui=await mount(t,{fixture:{...fixture,synthetic_only:false}});
  assert.equal(ui.$('#application').hidden,true);
  assert.equal(ui.$('#failure').hidden,false);
  assert.match(ui.$('#failure-message').textContent,/syntetycznego fixture/);
  assert.deepEqual(ui.ids(),[]);
});
