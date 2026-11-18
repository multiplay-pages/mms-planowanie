// In-memory DOM integration only: no navigation, network or graphical browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import vm from 'node:vm';
import {Window} from 'happy-dom';
import * as modelApi from '../planner-model.mjs';
import * as optimizerApi from '../optimizer.mjs';
import * as mapApi from '../map.mjs';
import * as locationApi from '../locations.mjs';
import * as roadApi from '../routes.mjs';
import * as plannerMapApi from '../planner-map.mjs';
import * as operationalApi from '../operational-map.mjs';
import * as embeddedApi from '../embedded-data.mjs';
import * as tileClientApi from '../road-tile-client.mjs';
import {validateSatelliteConfig,SATELLITE_PRESETS} from '../maplibre-view.mjs';
import {roadFixture} from './road-fixture.mjs';
const realRoutes=await readFile(new URL('../data/local-routes.json',import.meta.url),'utf8').then(JSON.parse);
const [markup,source,dataset,basemap,geocoding,uug]=await Promise.all([
  readFile(new URL('../planner.html',import.meta.url),'utf8'),
  readFile(new URL('../planner.mjs',import.meta.url),'utf8'),
  readFile(new URL('../data/addresses.json',import.meta.url),'utf8').then(JSON.parse),
  readFile(new URL('../basemap/data.json',import.meta.url),'utf8').then(JSON.parse),
  readFile(new URL('../data/geocoding.json',import.meta.url),'utf8').then(JSON.parse),
  readFile(new URL('../data/uug-geocoding.json',import.meta.url),'utf8').then(JSON.parse),
]);
async function mount(t,options={}) {
  const window=new Window({settings:{enableJavaScriptEvaluation:false,disableJavaScriptFileLoading:true,enableCSSFileLoading:false,enableImageFileLoading:false,enableIframePageLoading:false,navigation:{disableMainFrameNavigation:true,disableChildFrameNavigation:true,disableChildPageNavigation:true,disableFallbackToSetURL:true}}});
  const requests=[],errors=[];const deny=async url=>{requests.push(String(url));throw Error('No network');};window.fetch=deny;
  window.document.write(markup.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,''));
  for(const [id,value] of [['address-data',dataset],['basemap-data',options.basemap??basemap],['geocoding-data',options.geocoding??null],['routing-data',options.routing??null]]) {const node=window.document.createElement('script');node.id=id;node.type='application/json';node.textContent=JSON.stringify(value);if(options.compress&&(id==='basemap-data'||id==='routing-data')){node.type='text/plain';node.dataset.encoding='gzip-base64';node.textContent=gzipSync(Buffer.from(JSON.stringify(value))).toString('base64');}window.document.body.append(node);}
  const saved=options.saved??new Map();
  const storage={getItem:key=>saved.get(key)??null,setItem:(key,value)=>{if(options.denyStorage)throw Error('Storage disabled');saved.set(key,value);}};
  window.addEventListener('error',event=>errors.push(event.error?.message??event.message));
  // WebGL is absent in Happy DOM, so the SVG fallback is used unless a test injects a fake map adapter.
  if(options.Worker)window.happyDOM.setURL('http://localhost/map05/planner.html');
  if(options.createOperationalMapView)window.HTMLCanvasElement.prototype.getContext=function(type){return /webgl/.test(type)?{}:null;};
  const mapAdapter=options.createOperationalMapView??(()=>{throw Error('MapLibre is not available in DOM tests');});
  vm.runInContext(source.replace(/^import[^\n]*\n/gm,''),vm.createContext({document:window.document,fetch:deny,setTimeout,performance,localStorage:storage,URL,Blob,Intl,console,...modelApi,...optimizerApi,...mapApi,...locationApi,...roadApi,...plannerMapApi,...operationalApi,...embeddedApi,...tileClientApi,atob,Response,DecompressionStream,Uint8Array,Worker:options.Worker,createOperationalMapView:mapAdapter,validateSatelliteConfig,SATELLITE_PRESETS,maplibregl:options.createOperationalMapView?{setWorkerUrl(){}}:undefined}),{timeout:10000});
  await new Promise(resolve=>setImmediate(resolve));
  const $=s=>window.document.querySelector(s),all=s=>[...window.document.querySelectorAll(s)];
  const click=s=>{assert.ok($(s),s);$(s).dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true}));};
  const change=(s,value)=>{const node=$(s);if(node.type==='checkbox')node.checked=value;else node.value=value;node.dispatchEvent(new window.Event('change',{bubbles:true}));};
  const submit=()=>$('#assignment-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  const ids=()=>all('#queue-list [data-order]').map(n=>n.dataset.order);
  t.after(async()=>{await window.happyDOM.abort();assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);});
  return {window,$,all,click,change,submit,ids,saved};
}
test('planner shows 109 addresses, independent queue and honest map status',async t=>{
  const ui=await mount(t);assert.equal(ui.$('#planner').hidden,false);assert.equal(ui.ids().length,109);
  assert.match(ui.$('#dataset-summary').textContent,/109/);assert.match(ui.$('#located-count').textContent,/0 \/ 109/);
  assert.equal(ui.all('#planner-map .map-marker').length,0);assert.ok(ui.all('#planner-map .basemap-road path').length>0);
  ui.change('#planning-date','2026-12-01');assert.equal(ui.ids().length,109);
  assert.match(ui.$('#metrics').textContent,/0/);
});
test('generate, manual move, remove and undo form a consistent flow',async t=>{
  const ui=await mount(t);ui.click('#generate');const remaining=ui.ids().length;assert.ok(remaining<109);
  const first=ui.$('#baskets [data-order]');const id=first.dataset.order;ui.click(`#baskets [data-order="${id}"]`);
  assert.match(ui.$('#order-title').textContent,new RegExp(id));
  ui.click('#remove-order');assert.equal(ui.ids().length,remaining+1);
  ui.change('#assignment-team','TEST-02');ui.change('#assignment-date','2026-11-20');ui.change('#assignment-slot','0');ui.submit();
  assert.equal(ui.ids().length,remaining);assert.match(ui.$('#order-details').textContent,/Ręczna propozycja/);
  ui.click('#undo');assert.equal(ui.ids().length,remaining+1);
});
test('availability controls affect capacity and reject removing occupied slots',async t=>{
  const ui=await mount(t);ui.change('[data-availability="TEST-01"][data-slot="0"]',false);
  assert.equal(ui.$('[data-availability="TEST-01"][data-slot="0"]').checked,false);
  ui.click('#generate');const assigned=ui.$('#baskets [data-order]');
  const team=assigned.dataset.team,start=assigned.dataset.start;
  ui.change(`[data-availability="${team}"][data-slot="${start}"]`,false);
  assert.match(ui.$('#message').textContent,/Nie można wyłączyć okna .* zajmuje je TEST-/);
  assert.equal(ui.$(`[data-availability="${team}"][data-slot="${start}"]`).checked,true);
});
test('confirmed visit cannot be moved or removed and regeneration keeps it',async t=>{
  const ui=await mount(t);ui.click('#generate');const id=ui.$('#baskets [data-order]').dataset.order;
  ui.click(`#baskets [data-order="${id}"]`);ui.click('#confirm-order');
  assert.equal(ui.$('#remove-order').disabled,true);assert.equal(ui.$('#assign-order').disabled,true);
  ui.click('#generate');ui.click(`#baskets [data-order="${id}"]`);assert.match(ui.$('#order-details').textContent,/Okno potwierdzone/);
  ui.click('#release-order');assert.match(ui.$('#message').textContent,/powód/);
  ui.$('#release-reason').value='Korekta testowa';ui.click('#release-order');assert.equal(ui.$('#remove-order').disabled,false);
});
test('filter scopes generation and unready orders have a visible reason',async t=>{
  const ui=await mount(t);ui.change('#kind-filter','BSA');ui.click('#generate');
  assert.ok(ui.all('#baskets [data-order]').every(n=>n.textContent.includes('BSA')));
  ui.change('#kind-filter','ALL');ui.click('#queue-list [data-order="TEST-001"]');
  assert.match(ui.$('#order-details').textContent,/Brak gotowości/);assert.equal(ui.$('#assign-order').disabled,true);
});
test('local persistence restores and invalid stored plan is reported',async t=>{
  const ui=await mount(t);ui.click('#generate');const ids=ui.ids();
  const fresh=await mount(t,{saved:ui.saved});assert.deepEqual(fresh.ids(),ids);
  const saved=new Map([[[...ui.saved.keys()][0],'{}']]);const bad=await mount(t,{saved});
  assert.equal(bad.ids().length,109);assert.match(bad.$('#message').textContent,/Nie wczytano/);
  const denied=await mount(t,{denyStorage:true});denied.click('#generate');
  assert.ok(denied.ids().length<109);assert.match(denied.$('#storage-status').textContent,/Zapisz plan JSON/);
});
test('map zoom, arrows, keyboard and fit change viewport without fake markers',async t=>{
  const ui=await mount(t);const start=ui.$('#planner-map').getAttribute('viewBox');
  ui.click('[data-map="in"]');assert.notEqual(ui.$('#planner-map').getAttribute('viewBox'),start);
  const zoom=ui.$('#planner-map').getAttribute('viewBox');ui.click('[data-map="left"]');assert.notEqual(ui.$('#planner-map').getAttribute('viewBox'),zoom);
  ui.$('#planner-map').dispatchEvent(new ui.window.KeyboardEvent('keydown',{key:'Home',bubbles:true,cancelable:true}));
  assert.equal(ui.$('#planner-map').getAttribute('viewBox'),start);assert.equal(ui.all('#planner-map .map-marker').length,0);
});
test('reset is reviewable, reversible and never alters source addresses',async t=>{
  const ui=await mount(t);ui.click('#generate');const remaining=ui.ids().length;
  ui.click('#reset-plan');assert.equal(ui.$('#reset-dialog').open,true);assert.equal(ui.ids().length,remaining);
  ui.click('#cancel-reset');assert.equal(ui.ids().length,remaining);
  ui.click('#reset-plan');ui.click('#accept-reset');assert.equal(ui.ids().length,109);
  ui.click('#undo');assert.equal(ui.ids().length,remaining);
});

test('selection preserves keyboard focus in queue and baskets',async t=>{
  const ui=await mount(t);const node=ui.$('#queue-list [data-order="TEST-002"]');node.focus();
  ui.click('#queue-list [data-order="TEST-002"]');
  assert.equal(ui.window.document.activeElement.dataset.order,'TEST-002');
  ui.click('#generate');const id=ui.$('#baskets [data-order]').dataset.order;
  ui.$(`#baskets [data-order="${id}"]`).focus();ui.click(`#baskets [data-order="${id}"]`);
  assert.equal(ui.window.document.activeElement.dataset.order,id);
});

test('manual return to queue survives regeneration and can be explicitly released',async t=>{
  const ui=await mount(t);ui.click('#generate');const id=ui.$('#baskets [data-order]').dataset.order;
  ui.click(`#baskets [data-order="${id}"]`);ui.click('#remove-order');
  assert.ok(ui.ids().includes(id));assert.ok(ui.$('#include-auto'));
  ui.click('#generate');assert.ok(ui.ids().includes(id));
  ui.click('#include-auto');ui.click('#generate');assert.ok(!ui.ids().includes(id));
});

test('file import replaces only a valid matching plan and can be undone',async t=>{
  const ui=await mount(t);ui.click('#generate');const remaining=ui.ids().length;
  const scenario=modelApi.createScenario(dataset),empty=modelApi.createPlan(scenario);
  const input=ui.$('#load-plan');
  const setFile=text=>Object.defineProperty(input,'files',{value:[{size:text.length,text:async()=>text}],configurable:true});
  const importFile=async text=>{setFile(text);input.dispatchEvent(new ui.window.Event('change',{bubbles:true}));await Promise.resolve();await Promise.resolve();};
  await importFile('{"schemaVersion":999}');assert.equal(ui.ids().length,remaining);assert.match(ui.$('#message').textContent,/Nie wczytano/);
  await importFile(JSON.stringify(empty));assert.equal(ui.ids().length,109);
  ui.click('#undo');assert.equal(ui.ids().length,remaining);
});

test('geocoded planner plots 46 matches and exposes 63 review candidates without false markers',async t=>{
  const ui=await mount(t,{geocoding});
  assert.equal(ui.$('#planner').hidden,false);
  assert.match(ui.$('#located-count').textContent,/46 \/ 109/);
  assert.equal(ui.all('#planner-map .map-marker').length,46);
  assert.equal(ui.$('#planner-map [data-order="TEST-001"]'),null);
  assert.equal(ui.all('#location-review [data-order]').length,63);
  ui.click('#location-review [data-order="TEST-001"]');
  assert.match(ui.$('#order-details').textContent,/Leśna 32A/);
  assert.match(ui.$('#order-details').textContent,/Leśna 32,/);
  assert.match(ui.$('#order-details').textContent,/różny numer budynku/);
});

test('map markers follow filters, synchronize selection and fit a basket without drawing routes',async t=>{
  const ui=await mount(t,{geocoding});ui.change('#city-filter','Wąsice');
  assert.equal(ui.all('#planner-map .map-marker').length,1);
  ui.click('#planner-map [data-order="TEST-002"]');
  assert.match(ui.$('#order-title').textContent,/TEST-002/);
  assert.equal(ui.$('#queue-list [data-order="TEST-002"]').getAttribute('aria-pressed'),'true');
  ui.click('[data-map="selected"]');assert.notEqual(ui.$('#planner-map').getAttribute('viewBox'),'0 0 680 380');
  ui.change('#city-filter','ALL');ui.change('#assignment-team','TEST-02');ui.change('#assignment-slot','0');ui.submit();ui.click('#generate');
  ui.$('[data-basket-map="TEST-02"]').focus();ui.click('[data-basket-map="TEST-02"]');
  assert.equal(ui.window.document.activeElement.dataset.basketMap,'TEST-02');
  const basketIds=new Set(ui.all('#baskets [data-team="TEST-02"]').map(n=>n.dataset.order));
  assert.ok(ui.all('#planner-map .map-marker').length>0);
  assert.ok(ui.$('#planner-map [data-order="TEST-002"]'));
  assert.ok(ui.all('#planner-map .map-marker').every(n=>basketIds.has(n.dataset.order)));
  assert.match(ui.$('#map-note').textContent,/TEST-02/);
  assert.equal(ui.all('#planner-map .route').length,0);
  ui.click('[data-map="all"]');assert.equal(ui.all('#planner-map .map-marker').length,46);
  const marker=ui.all('#planner-map .map-marker').find(n=>n.dataset.order!=='TEST-002'),id=marker.dataset.order;
  marker.focus();marker.dispatchEvent(new ui.window.KeyboardEvent('keydown',{key:' ',bubbles:true,cancelable:true}));
  assert.match(ui.$('#order-title').textContent,new RegExp(id));
  assert.equal(ui.window.document.activeElement.dataset.order,id);
});

test('existing local baskets load unchanged after adding the coordinate layer',async t=>{
  const old=await mount(t);old.click('#generate');const remaining=old.ids();
  const enriched=await mount(t,{saved:old.saved,geocoding});
  assert.deepEqual(enriched.ids(),remaining);
  assert.equal(enriched.all('#planner-map .map-marker').length,46);
});

test('foreign coordinate layer is rejected while the saved resource plan remains usable',async t=>{
  const ui=await mount(t,{geocoding:{...geocoding,datasetId:'foreign'}});
  assert.equal(ui.$('#planner').hidden,false);
  assert.equal(ui.all('#planner-map .map-marker').length,0);
  assert.match(ui.$('#message').textContent,/Pominięto/);
  ui.click('#generate');assert.ok(ui.ids().length<109);
});

test('external formatted address is displayed as text without markup execution',async t=>{
  const external=structuredClone(geocoding);external.records[0].candidate.formatted='<img src=x onerror=alert(1)>';
  const ui=await mount(t,{geocoding:external});ui.click('#location-review [data-order="TEST-001"]');
  assert.match(ui.$('#order-details').textContent,/<img src=x onerror=alert\(1\)>/);
  assert.equal(ui.$('#order-details img'),null);
});

test('GUGiK map distinguishes 6 postal notes from 96 exact points and 7 unresolved replies',async t=>{
  const ui=await mount(t,{geocoding:uug});
  assert.equal(ui.all('#planner-map .map-marker').length,102);
  assert.equal(ui.all('#planner-map .postcode-note').length,6);
  assert.equal(ui.all('#location-review [data-order]').length,13);
  assert.match(ui.$('#map-note').textContent,/7.*poza mapą/);
  assert.match(ui.$('#map-note').textContent,/6.*kod/);
  assert.match(ui.$('#geocoder-source').textContent,/GUGiK/);
  assert.match(ui.$('#map-desc').textContent,/GUGiK/);
  ui.click('#planner-map [data-order="TEST-001"]');
  assert.match(ui.$('#order-details').textContent,/Leśna 32a/);
  const note=ui.$('#planner-map .postcode-note');
  assert.match(note.getAttribute('aria-label'),/kod pocztowy/);
  ui.click(`#planner-map [data-order="${note.dataset.order}"]`);
  assert.match(ui.$('#order-details').textContent,/kod źródłowy/);
  const address=dataset.addresses.find(a=>a.id===modelApi.createScenario(dataset).orders.find(o=>o.id===note.dataset.order).addressId);
  assert.match(ui.$('#order-details').textContent,new RegExp(address.postcode));
  const unresolved=ui.all('#location-review [data-order]').find(n=>n.textContent.includes('Błąd odpowiedzi'));
  assert.ok(unresolved);ui.click(`#location-review [data-order="${unresolved.dataset.order}"]`);
  assert.match(ui.$('#order-details').textContent,/nie oznacza błędu adresu/);
  assert.equal(ui.$(`#planner-map [data-order="${unresolved.dataset.order}"]`),null);
});

test('switching Geoapify to GUGiK keeps saved assignments and manual exclusions unchanged',async t=>{
  const old=await mount(t,{geocoding});old.click('#generate');
  const id=old.$('#baskets [data-order]').dataset.order;
  old.click(`#baskets [data-order="${id}"]`);old.click('#remove-order');
  const before=[...old.saved.entries()];
  const current=await mount(t,{saved:old.saved,geocoding:uug});
  assert.deepEqual(current.ids(),old.ids());assert.deepEqual([...current.saved.entries()],before);
  assert.equal(current.all('#planner-map .map-marker').length,102);
  current.click('#generate');assert.ok(current.ids().includes(id));
});

test('local road assessment is visible on baskets and their map with no external request',async t=>{
  const scenario=modelApi.createScenario(dataset,uug),routing=roadFixture(scenario);
  const ui=await mount(t,{geocoding:uug,routing});ui.click('#generate');
  assert.match(ui.$('#routing-status').textContent,/lokaln/i);
  assert.ok(ui.all('#baskets .road-checks').length>0);
  assert.match(ui.$('#baskets').textContent,/30 km/);
  const basket=ui.all('#baskets section').find(node=>new Set([...node.querySelectorAll('[data-order]')].map(n=>n.dataset.order)).size>=2);
  assert.ok(basket);const button=basket.querySelector('[data-basket-map]');ui.click(`[data-basket-map="${button.dataset.basketMap}"]`);
  assert.ok(ui.all('#planner-map .basket-route').length>0);
  assert.match(ui.$('#route-summary').textContent,/km/);
  assert.match(ui.$('#route-summary').textContent,/szacun|Szacun/);
  ui.click('[data-map="all"]');assert.equal(ui.all('#planner-map .basket-route').length,0);
});

test('regional map fits a single address at street scale and updates local detail',async t=>{
  const address=modelApi.createScenario(dataset,uug).addresses.find(a=>a.city==='Rybnik'&&a.coordinates),[lon,lat]=address.coordinates;
  const regional={regions:{PLANNER:{bounds:[17.2,49.9,19,51.5],features:[{id:'local',kind:'road',category:'residential',name:'Testowa ulica',points:[[lon-.001,lat],[lon+.001,lat]]}]}}};
  const ui=await mount(t,{geocoding:uug,basemap:regional});
  const order=scenarioOrder(address.id);ui.click(`#queue-list [data-order="${order.id}"]`);ui.click('[data-map="selected"]');
  assert.ok(Number(ui.$('#planner-map').getAttribute('viewBox').split(' ')[2])<5);
  assert.ok(ui.$('#planner-map [data-feature="local"]'));
  assert.match(ui.$('#planner-map').textContent,/Testowa ulica/);
  assert.doesNotMatch(ui.$('#map-note').textContent,/wyłącznie wycinek Opola/);
});
const scenarioOrder=addressId=>modelApi.createScenario(dataset,uug).orders.find(o=>o.addressId===addressId);

test('keyboard focus stays in order details after confirm, release and return to queue',async t=>{
  const ui=await mount(t,{geocoding:uug});
  ui.click('#queue-list [data-order="TEST-002"]');ui.change('#assignment-team','TEST-02');ui.change('#assignment-slot','0');ui.submit();
  for(const selector of ['#confirm-order','#release-order','#remove-order']) {
    if(selector==='#release-order')ui.$('#release-reason').value='Korekta testowa';
    ui.$(selector).focus();ui.click(selector);
    const active=ui.window.document.activeElement;
    assert.notEqual(active.tagName,'BODY',`${selector} must not drop focus to the page`);
    assert.ok(ui.$('#order-details').contains(active),`${selector} keeps focus in the order details`);
  }
  assert.equal(ui.window.document.activeElement.id,'assign-order');
});

test('changing the day in basket map mode fits the basket of the new day',async t=>{
  const scenario=modelApi.createScenario(dataset,uug),located=o=>o.ready&&o.type==='MPL'&&o.slotsRequired===1&&scenario.addresses.find(a=>a.id===o.addressId).coordinates;
  const candidates=scenario.orders.filter(located),cityOf=o=>scenario.addresses.find(a=>a.id===o.addressId).city;
  const first=candidates[0],second=candidates.find(o=>cityOf(o)!==cityOf(first)&&Math.abs(scenario.addresses.find(a=>a.id===o.addressId).coordinates[1]-scenario.addresses.find(a=>a.id===first.addressId).coordinates[1])>.3);
  let plan=modelApi.createPlan(scenario);
  plan=modelApi.applyAction(scenario,plan,{type:'ASSIGN',orderId:first.id,teamId:'TEST-02',date:'2026-11-18',start:0});
  plan=modelApi.applyAction(scenario,plan,{type:'ASSIGN',orderId:second.id,teamId:'TEST-02',date:'2026-11-19',start:0});
  const ui=await mount(t,{geocoding:uug,saved:new Map([[`mms-map05-plan-v1-${scenario.datasetId}`,JSON.stringify(plan)]])});
  ui.click('[data-basket-map="TEST-02"]');const before=ui.$('#planner-map').getAttribute('viewBox');
  ui.change('#planning-date','2026-11-19');
  const [left,top,width,height]=ui.$('#planner-map').getAttribute('viewBox').split(' ').map(Number);
  const marker=ui.$(`#planner-map [data-order="${second.id}"]`),x=Number(marker.getAttribute('cx')),y=Number(marker.getAttribute('cy'));
  assert.notEqual(`${left} ${top} ${width} ${height}`,before);
  assert.ok(x>=left&&x<=left+width&&y>=top&&y<=top+height,'the new day basket is inside the map view');
  assert.match(ui.$('#map-note').textContent,/Koszyk TEST-02 · 2026-11-19: 1 punktów/);
});
test('the full street address is prominent in basket cards, the layer list and the selected-order panel',async t=>{
  const scenario=modelApi.createScenario(dataset,uug),order=scenario.orders.find(o=>o.ready&&o.type==='MPL'&&o.slotsRequired===1),address=scenario.addresses.find(a=>a.id===order.addressId);
  let plan=modelApi.createPlan(scenario);
  plan=modelApi.applyAction(scenario,plan,{type:'ASSIGN',orderId:order.id,teamId:'TEST-02',date:'2026-11-19',start:0});
  const ui=await mount(t,{geocoding:uug,saved:new Map([[`mms-map05-plan-v1-${scenario.datasetId}`,JSON.stringify(plan)]])});
  ui.change('#planning-date','2026-11-19');
  const street=address.label.slice(`${address.postcode} ${address.city}, `.length),place=`${address.postcode} ${address.city}`;
  assert.ok(street.length>0&&street!==address.label);
  // Basket card: street line in bold, then postcode and town (not just the town).
  const card=ui.$(`#baskets button[data-order="${order.id}"]`);
  assert.equal(card.querySelector('.visit-address b').textContent,street);
  assert.match(card.querySelector('.visit-address i').textContent,new RegExp(place));
  // Selected order panel: a dedicated address card with the slot of the assignment.
  ui.click(`#baskets button[data-order="${order.id}"]`);
  const panel=ui.$('#order-details .address-card');
  assert.equal(panel.querySelector('.address-street').textContent,street);
  assert.equal(panel.querySelector('.address-place').textContent,place);
  assert.match(panel.querySelector('.address-slot').textContent,/2026-11-19 · TEST-02 · 08:00/);
  // A queued (unassigned) order shows the address card without a slot line.
  const queued=scenario.orders.find(o=>o.id!==order.id&&o.ready);
  ui.click(`#queue-list button[data-order="${queued.id}"]`);
  assert.ok(ui.$('#order-details .address-card .address-street').textContent.length>0);
  assert.equal(ui.$('#order-details .address-card .address-slot'),null);
});
test('addresses without a street name lead with the town, others keep the street line',async t=>{
  const scenario=modelApi.createScenario(dataset,uug),bare=scenario.addresses.find(a=>/^\d/.test(a.label.slice(`${a.postcode} ${a.city}, `.length))),withStreet=scenario.addresses.find(a=>/^(ul\.|al\.|pl\.)/.test(a.label.slice(`${a.postcode} ${a.city}, `.length)));
  assert.ok(bare&&withStreet);
  const order=id=>scenario.orders.find(o=>o.addressId===id&&o.ready);
  const ui=await mount(t,{geocoding:uug,saved:new Map()});
  const ob=order(bare.id)??scenario.orders.find(o=>o.addressId===bare.id),ow=order(withStreet.id)??scenario.orders.find(o=>o.addressId===withStreet.id);
  ui.click(`#queue-list button[data-order="${ob.id}"]`);
  assert.equal(ui.$('#order-details .address-street').textContent,`${bare.city} ${bare.label.slice(`${bare.postcode} ${bare.city}, `.length)}`);
  ui.click(`#queue-list button[data-order="${ow.id}"]`);
  assert.equal(ui.$('#order-details .address-street').textContent,withStreet.label.slice(`${withStreet.postcode} ${withStreet.city}, `.length));
});
test('operational map panel follows the plan for every basket and keeps keyboard focus on a visit',async t=>{
  const updates=[],fits=[];
  const fakeView=()=>({ready:Promise.resolve(),update:layers=>updates.push(layers),fit:bounds=>fits.push(bounds),flyTo(){},setRoadsVisible(){},setBasemap(){},destroy(){},resize(){}});
  const regional={regions:{PLANNER:{encoding:'polyline5-indexed',categories:['primary'],names:[''],bounds:[17.2,49.9,19,51.5],features:[]}}};
  const scenario=modelApi.createScenario(dataset,uug),routing=roadFixture(scenario);
  const ui=await mount(t,{geocoding:uug,routing,basemap:regional,Worker:recordingWorker(),createOperationalMapView:fakeView});
  for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(ui.$('#op-map-shell').hidden,false,'the operational map replaces the SVG view');
  ui.change('#planning-date','2026-11-19');ui.click('#generate');
  const plan=JSON.parse([...ui.saved.values()][0]),day=plan.assignments.filter(a=>a.date==='2026-11-19');
  const visits=updates.at(-1).visits.features.map(f=>f.properties);
  assert.ok(day.length>3);
  assert.deepEqual(visits.map(v=>v.orderId).sort(),day.map(a=>a.orderId).sort(),'map shows exactly the planned visits of the day');
  assert.equal(ui.all('#op-layers [data-op-team]').length,scenario.teams.length);
  // Keyboard: activating a numbered visit keeps focus on that visit after the planner re-renders.
  const button=ui.$('#op-layers button[data-order]'),id=button.dataset.order;
  button.focus();ui.click(`#op-layers button[data-order="${id}"]`);
  assert.equal(ui.window.document.activeElement.dataset.order,id);
  assert.match(ui.$('#order-title').textContent,new RegExp(id));
  // Return to queue goes through the model and the map drops the visit without a second store.
  ui.click('#remove-order');
  const after=updates.at(-1).visits.features.map(f=>f.properties.orderId);
  const stillPlanned=JSON.parse([...ui.saved.values()][0]).assignments.some(a=>a.orderId===id);
  assert.equal(after.includes(id),stillPlanned);
  // Changing the day removes the previous day's visits and refits.
  const fitCount=fits.length;ui.change('#planning-date','2026-11-18');
  assert.equal(updates.at(-1).visits.features.length,0);assert.ok(fits.length>fitCount);
});
test('gzip-base64 data blocks give the same planner as plain JSON blocks',async t=>{
  const scenario=modelApi.createScenario(dataset,uug),routing=roadFixture(scenario);
  const plain=await mount(t,{geocoding:uug,routing});
  const packed=await mount(t,{geocoding:uug,routing,compress:true});
  await until(()=>!packed.$('#planner').hidden&&packed.$('#located-count').textContent!=='');
  for(const selector of ['#located-count','#routing-status','#dataset-summary','#map-note'])assert.equal(packed.$(selector).textContent,plain.$(selector).textContent,selector);
  assert.deepEqual(packed.ids(),plain.ids());
  assert.ok(packed.all('#planner-map path').length>0,'the SVG map still draws the decoded road snapshot');
});

// Records what the planner hands to the road-tile worker.
async function until(condition,limit=400) {for(let i=0;i<limit&&!condition();i++)await new Promise(resolve=>setTimeout(resolve,5));assert.ok(condition(),'condition was not reached');}

function recordingWorker() {
  const created=[];
  class FakeWorker {
    constructor(url,options){this.url=String(url);this.options=options;this.sent=[];this.terminated=false;created.push(this);}
    postMessage(message){this.sent.push(message);}
    terminate(){this.terminated=true;}
  }
  FakeWorker.created=created;
  return FakeWorker;
}

test('with WebGL and workers the road snapshot goes to the tile worker and is not parsed or drawn on the main thread',async t=>{
  const regional={regions:{PLANNER:{encoding:'polyline5-indexed',categories:['primary'],names:[''],bounds:[17.2,49.9,19,51.5],features:[]}}};
  const scenario=modelApi.createScenario(dataset,uug),routing=roadFixture(scenario),FakeWorker=recordingWorker();
  const ui=await mount(t,{geocoding:uug,routing,basemap:regional,compress:true,Worker:FakeWorker,createOperationalMapView:()=>({ready:Promise.resolve(),update(){},fit(){},flyTo(){},setRoadsVisible(){},setBasemap(){},destroy(){},resize(){}})});
  await until(()=>FakeWorker.created.length===1);
  assert.equal(FakeWorker.created.length,1);
  const worker=FakeWorker.created[0],init=worker.sent[0];
  assert.equal(worker.url,'http://localhost/map05/road-tile-worker.mjs');assert.equal(worker.options.type,'module');
  assert.equal(init.type,'init');assert.equal(init.source.kind,'embedded');assert.equal(init.source.encoding,'gzip-base64');
  assert.equal(init.source.text,ui.$('#basemap-data').textContent,'the worker receives the embedded block as is');
  assert.equal(ui.all('#planner-map path').length,0,'no SVG road map is built while the operational map is active');
  assert.match(ui.$('#located-count').textContent,/ \/ 109 adresów/,'location summary does not depend on the SVG map');
  assert.match(ui.$('#map-note').textContent,/Regionalny podkład ulic obejmuje obszar zleceń/);assert.doesNotMatch(ui.$('#map-note').textContent,/wyłącznie wycinek Opola/,'the regional base map is announced even though its data lives in the worker');
  assert.equal(ui.$('#op-map-shell').hidden,false);
});

test('a failing tile worker hands the map over to the SVG view and loads the road data then',async t=>{
  const regional={regions:{PLANNER:{encoding:'polyline5-indexed',categories:['primary'],names:[''],bounds:[17.2,49.9,19,51.5],features:[]}}};
  const scenario=modelApi.createScenario(dataset,uug),routing=roadFixture(scenario),FakeWorker=recordingWorker();
  const ui=await mount(t,{geocoding:uug,routing,basemap:regional,compress:true,Worker:FakeWorker,createOperationalMapView:()=>({ready:new Promise(()=>{}),update(){},fit(){},flyTo(){},setRoadsVisible(){},setBasemap(){},destroy(){},resize(){}})});
  await until(()=>FakeWorker.created.length===1);
  const worker=FakeWorker.created[0];
  worker.onmessage({data:{type:'error',message:'Worker failed to load.'}});
  await until(()=>ui.all('#planner-map .map-ground').length>0);
  assert.equal(worker.terminated,true);
  assert.equal(ui.$('#op-map-shell').hidden,true);
  assert.match(ui.$('#message').textContent,/Worker failed to load/);
  assert.ok(ui.all('#planner-map .map-ground').length>0,'the SVG map is drawn after the hand-over');
  assert.equal(ui.$('#planner').hidden,false);
});

test('a tile worker that dies after the map is ready also hands over to the SVG view',async t=>{
  const regional={regions:{PLANNER:{encoding:'polyline5-indexed',categories:['primary'],names:[''],bounds:[17.2,49.9,19,51.5],features:[]}}};
  const scenario=modelApi.createScenario(dataset,uug),routing=roadFixture(scenario),FakeWorker=recordingWorker();
  const ui=await mount(t,{geocoding:uug,routing,basemap:regional,compress:true,Worker:FakeWorker,createOperationalMapView:()=>({ready:Promise.resolve(),update(){},fit(){},flyTo(){},setRoadsVisible(){},setBasemap(){},destroy(){},resize(){}})});
  await until(()=>FakeWorker.created.length===1);
  const worker=FakeWorker.created[0];
  worker.onmessage({data:{type:'ready',roads:1}});
  await until(()=>ui.$('#op-status').textContent.startsWith('Mapa operacyjna'));
  assert.equal(ui.$('#op-map-shell').hidden,false);
  worker.onerror({message:'Worker crashed after start.'});
  await until(()=>ui.all('#planner-map .map-ground').length>0);
  assert.equal(worker.terminated,true);assert.equal(ui.$('#op-map-shell').hidden,true);
  assert.match(ui.$('#message').textContent,/crashed after start/);
});

test('without the Worker API the SVG map stays and the operational map is never started',async t=>{
  const regional={regions:{PLANNER:{encoding:'polyline5-indexed',categories:['primary'],names:[''],bounds:[17.2,49.9,19,51.5],features:[]}}};
  const scenario=modelApi.createScenario(dataset,uug),routing=roadFixture(scenario);let created=0;
  const ui=await mount(t,{geocoding:uug,routing,basemap:regional,createOperationalMapView:()=>{created++;throw Error('must not start');}});
  for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(created,0);assert.equal(ui.$('#op-map-shell').hidden,true);
  assert.ok(ui.all('#planner-map .map-ground').length>0);
});

// MAP-07B: the optimisation is a simulation; the plan changes only after a conscious acceptance and the change can be undone.
const waitFor=async(test,limit=20000)=>{const started=Date.now();while(!test()){if(Date.now()-started>limit)throw Error('Timed out waiting for the optimiser');await new Promise(resolve=>setTimeout(resolve,25));}};
test('optimisation proposal is a simulation: nothing is saved until it is accepted, and acceptance can be undone',async t=>{
  const ui=await mount(t,{geocoding:uug,routing:realRoutes});
  ui.change('#planning-date','2026-11-19');
  const planned=()=>JSON.parse([...ui.saved.values()][0]??'{"assignments":[]}').assignments.length;
  assert.equal(ui.$('#opt-result').hidden,true);assert.equal(ui.$('#opt-run').disabled,false);
  assert.match(ui.$('#opt-hierarchy').textContent,/niezatwierdzona/);
  ui.click('#opt-run');
  await waitFor(()=>!ui.$('#opt-result').hidden);
  assert.equal(planned(),0,'the proposal must not touch the stored plan');
  assert.equal(ui.$('#undo').disabled,true);
  assert.equal(ui.all('#opt-compare tr').length,7);assert.equal(ui.all('#opt-baskets .opt-basket').length,5);
  assert.match(ui.$('#opt-status').textContent,/symulacja: plan nie został zmieniony/);
  assert.ok(ui.all('#opt-explain details').length>=10&&ui.all('#opt-skipped details').length>=5);
  assert.match(ui.$('#opt-explain').textContent,/Rozważono 5 koszyków/);
  assert.match(ui.$('#opt-rules').textContent,/Potwierdzone w dokumentacji/);
  // Cancel keeps the plan; the dialog states what will change.
  ui.click('#opt-accept');assert.equal(ui.$('#opt-dialog').open,true);assert.match(ui.$('#opt-dialog-text').textContent,/potwierdzone i ręczne przydziały pozostają/);
  ui.click('#opt-dialog-cancel');assert.equal(planned(),0);
  ui.click('#opt-accept');ui.click('#opt-dialog-accept');
  const accepted=planned();assert.ok(accepted>=10,'accepted proposal is stored as a normal plan');
  assert.equal(ui.$('#undo').disabled,false);assert.equal(ui.$('#opt-result').hidden,true);assert.match(ui.$('#opt-status').textContent,/zastosowana/);
  assert.match(ui.$('#message').textContent,/Zastosowano propozycję optymalizacji/);
  ui.click('#undo');assert.equal(planned(),0);
});
test('rejecting or invalidating a proposal leaves the plan alone',async t=>{
  const ui=await mount(t,{geocoding:uug,routing:realRoutes});
  ui.change('#planning-date','2026-11-18');ui.change('#opt-variant','AGE_FIRST');
  assert.match(ui.$('#opt-hierarchy').textContent,/starszeństwo/);
  ui.click('#opt-run');await waitFor(()=>!ui.$('#opt-result').hidden);
  ui.click('#opt-reject');assert.equal(ui.$('#opt-result').hidden,true);assert.equal(ui.saved.size,0);assert.match(ui.$('#opt-status').textContent,/odrzucona/);
  ui.click('#opt-run');await waitFor(()=>!ui.$('#opt-result').hidden);
  ui.change('#planning-date','2026-11-19');
  assert.equal(ui.$('#opt-result').hidden,true,'a day change withdraws the proposal');assert.match(ui.$('#opt-status').textContent,/wycofana/);
  assert.equal(ui.saved.size,0);
});
test('without local road data the optimiser is disabled instead of guessing distances',async t=>{
  const ui=await mount(t);
  assert.equal(ui.$('#opt-run').disabled,true);assert.match(ui.$('#opt-status').textContent,/wymaga lokalnej oceny dróg/);
});
test('the map previews the proposal on demand without changing the plan, with a visible simulation banner',async t=>{
  const updates=[],fakeView=()=>({ready:Promise.resolve(),update:layers=>updates.push(layers),fit(){},flyTo(){},setRoadsVisible(){},setBasemap(){},destroy(){},resize(){}});
  const regional={regions:{PLANNER:{encoding:'polyline5-indexed',categories:['primary'],names:[''],bounds:[17.2,49.9,19,51.5],features:[]}}};
  const ui=await mount(t,{geocoding:uug,routing:realRoutes,basemap:regional,Worker:recordingWorker(),createOperationalMapView:fakeView});
  for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));
  ui.change('#planning-date','2026-11-19');
  ui.click('#opt-run');await waitFor(()=>!ui.$('#opt-result').hidden);
  assert.equal(updates.at(-1).visits.features.length,0,'the default map view is still the current plan');
  const radio=value=>{const node=ui.$(`input[name="opt-view"][value="${value}"]`);node.checked=true;node.dispatchEvent(new ui.window.Event('change',{bubbles:true}));};
  radio('proposal');
  assert.ok(updates.at(-1).visits.features.length>=10,'proposal visits are drawn');
  assert.match(ui.$('#op-layers').textContent,/PODGLĄD PROPOZYCJI/);assert.equal(ui.saved.size,0);
  radio('current');
  assert.equal(updates.at(-1).visits.features.length,0);assert.doesNotMatch(ui.$('#op-layers').textContent,/PODGLĄD PROPOZYCJI/);
});
test('a recomputation withdraws the old proposal at once and a day change before the computation starts discards the result (Codex T15 P2)',async t=>{
  const ui=await mount(t,{geocoding:uug,routing:realRoutes});
  ui.change('#planning-date','2026-11-19');
  ui.click('#opt-run');await waitFor(()=>!ui.$('#opt-result').hidden);
  // Second run with another variant: the stale result is hidden immediately, so it cannot be accepted while the new one is computed.
  ui.change('#opt-variant','AGE_FIRST');ui.click('#opt-run');
  assert.equal(ui.$('#opt-result').hidden,true);assert.equal(ui.$('#opt-run').disabled,true);assert.equal(ui.$('#opt-variant').disabled,true);
  ui.click('#opt-run');ui.click('#opt-accept');assert.equal(ui.$('#opt-dialog').open,false,'nothing to accept while computing');
  await waitFor(()=>!ui.$('#opt-result').hidden);
  assert.match(ui.$('#opt-status').textContent,/Starszeństwo najpierw/);assert.equal(ui.$('#opt-run').disabled,false);
  // The day changes between the click and the computation: the result must not be built for the new day.
  ui.click('#opt-reject');ui.click('#opt-run');ui.change('#planning-date','2026-11-20');
  await waitFor(()=>!ui.$('#opt-run').disabled);
  assert.equal(ui.$('#opt-result').hidden,true);assert.match(ui.$('#opt-status').textContent,/zmienił się/);assert.equal(ui.saved.size,0);
});
test('choosing another variant after a computation withdraws the old proposal and its accept button (Codex T16)',async t=>{
  const ui=await mount(t,{geocoding:uug,routing:realRoutes});
  ui.change('#planning-date','2026-11-19');
  ui.click('#opt-run');await waitFor(()=>!ui.$('#opt-result').hidden);
  ui.change('#opt-variant','AGE_FIRST');
  assert.equal(ui.$('#opt-result').hidden,true);assert.match(ui.$('#opt-status').textContent,/Zmieniono wariant/);
  ui.click('#opt-accept');assert.equal(ui.$('#opt-dialog').open,false);assert.equal(ui.saved.size,0);
});
