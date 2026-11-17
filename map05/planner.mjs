import {createScenario,createPlan,applyAction,validatePlan,queueOrders,explainOrder,restorePlan} from './planner-model.mjs';
import {createMapFrame,projectMapPoint,mapGeometryPath} from './map.mjs';
import {hasLocation,locationLabel,summarizeLocations,locationReasonText} from './locations.mjs';
import {mergeRoutes,assessBasket,decodeRouteGeometry} from './routes.mjs';
import {prepareMapFeatures,visibleMapFeatures,mapFeaturePath} from './planner-map.mjs';

const $=id=>document.getElementById(id);
const escapeText=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={date:'2026-11-18',city:'ALL',kind:'ALL',query:'',selectedId:null,mapMode:'scope',mapTeam:null};
let scenario,plan,mapData,mapFrame=null,markerLayer=null,history=[],storageKey,storageAvailable=true,viewport=[0,0,680,380],drag=null;
let backgroundLayer,routeLayer,townLayer,scaleLayer,preparedMap=[],townLabels=[],lastMapView=null;
const addressFor=order=>scenario.addresses.find(a=>a.id===order.addressId);
const orderById=id=>scenario.orders.find(o=>o.id===id);
const onDay=()=>plan.assignments.filter(a=>a.date===state.date);
const slotLabel=(start,count=1)=>`${scenario.windows[start][0]}–${scenario.windows[start+count-1][1]}`;
const matches=order=>{
  const address=addressFor(order),query=state.query.trim().toLocaleLowerCase('pl');
  return (state.city==='ALL'||state.city===address.city)&&(state.kind==='ALL'||state.kind===order.type)&&(!query||`${order.id} ${address.label}`.toLocaleLowerCase('pl').includes(query));
};
const assignmentFor=id=>plan.assignments.find(a=>a.orderId===id);
const slotsFor=teamId=>plan.availability.find(a=>a.teamId===teamId&&a.date===state.date)?.slots??[];
const occupies=(teamId,index)=>onDay().find(a=>a.teamId===teamId&&index>=a.start&&index<a.start+orderById(a.orderId).slotsRequired);

async function readData(id,url) {
  const bundled=$(id);
  if(bundled) return JSON.parse(bundled.textContent);
  const response=await fetch(url,{cache:'no-store'});
  if(!response.ok) throw Error(`Brak pliku lokalnego: ${url} (${response.status}).`);
  return response.json();
}

async function loadPlanner() {
  try {
    const dataset=await readData('address-data','./data/addresses.json');
    let geocoding=null,locationWarning='';
    try {geocoding=await readData('geocoding-data','./data/uug-geocoding.json');}
    catch {locationWarning='Warstwa lokalizacji nie jest dostępna. Plan zasobowy działa bez punktów adresowych.';}
    try {scenario=createScenario(dataset,geocoding);}
    catch(error) {if(!geocoding)throw error;scenario=createScenario(dataset);locationWarning=`Pominięto warstwę lokalizacji: ${error.message} Zachowano planer zasobowy.`;}
    try {const routes=await readData('routing-data','./data/local-routes.json');scenario.routing=mergeRoutes(scenario.datasetId,scenario.addresses,routes);}
    catch(error) {locationWarning+=` Lokalna ocena dróg nie jest dostępna: ${error.message} Zachowano planer zasobowy.`;}
    try {mapData=await readData('basemap-data','./basemap/planner-compact.json');} catch {mapData=null;locationWarning+=' Lokalny podkład ulic nie jest dostępny.';}
    plan=createPlan(scenario);storageKey=`mms-map05-plan-v1-${scenario.datasetId}`;
    let warning=locationWarning;
    try {
      const saved=localStorage.getItem(storageKey);
      if(saved) plan=restorePlan(scenario,saved);
    } catch(error) {warning+=" "+`Nie wczytano zapisanego planu: ${error.message} Użyto pustego scenariusza; zapis w pamięci przeglądarki nie został nadpisany.`;}
    state.selectedId=scenario.orders[0]?.id??null;
    $('planning-date').value=state.date;
    $('city-filter').innerHTML='<option value="ALL">Wszystkie miejscowości</option>'+[...new Set(scenario.addresses.map(a=>a.city))].sort((a,b)=>a.localeCompare(b,'pl')).map(city=>`<option value="${escapeText(city)}">${escapeText(city)}</option>`).join('');
    $('dataset-summary').textContent=`${scenario.addresses.length} unikalnych adresów · ${scenario.quality.cities} miejscowości · pominięte powtórzenia: ${scenario.quality.duplicates.length}`;
    $('source-detail').textContent=`Źródło: ${scenario.source.filename} · ${scenario.source.sheet}, ${scenario.source.range}. Arkusz pozostawiono bez zmian.`;
    const provider=scenario.addresses.find(address=>address.geocoding)?.geocoding.source.provider;
    const providerName=provider==='GUGIK_UUG'?'GUGiK':provider==='Geoapify'?'Geoapify':'brak warstwy lokalizacji';
    $('geocoder-source').textContent=providerName;
    $('map-desc').textContent=`Punkty budynków: ${providerName}. Przerywany obrys oznacza różny kod pocztowy w odpowiedzi usługi. Nieustalone lokalizacje pozostają poza mapą. Przesuwaj przeciągnięciem lub strzałkami; plus/minus zmieniają skalę, Home dopasowuje zakres. ${mapData?.regions?.PLANNER?'Regionalny podkład OSM obejmuje obszar zleceń; przybliż adres, aby zobaczyć ulice.':'Podkład ulic obejmuje wyłącznie wycinek Opola.'}`;
    $('routing-status').textContent=scenario.routing?'Drogi obliczane lokalnie na OSM. Generator i ręczna zmiana sprawdzają robocze limity 30 km, +10 km i dojazd z pracą w oknie. Czasy i normy pracy są szacunkowe; start ekipy i wjazd na posesję pozostają niepotwierdzone.':'Brak lokalnych wyników dróg — przydziały są propozycjami zasobowymi, bez oceny przejazdów.';
    renderPlanner();drawPlannerMap();$('planner').hidden=false;
    if(warning) showMessage(warning,true);
  } catch(error) {$('failure-message').textContent=error.message;$('failure').hidden=false;}
  finally {$('loading').hidden=true;}
}

function showMessage(message,error=false) {
  $('message').textContent=message;$('message').className=`notice ${error?'error':'success'}`;$('message').hidden=false;
}

function persist() {
  try {localStorage.setItem(storageKey,JSON.stringify(plan));storageAvailable=true;}
  catch {storageAvailable=false;}
}

function updatePlan(next,message) {
  validatePlan(scenario,next);
  history.push(plan);if(history.length>50)history.shift();plan=next;
  persist();renderPlanner();showMessage(message);
}

function perform(action,message) {
  try {updatePlan(applyAction(scenario,plan,action),message);return true;}
  catch(error) {showMessage(error.message,true);renderPlanner();return false;}
}

function renderPlanner() {
  const active=document.activeElement,focusId=active?.id,focusOrder=active?.dataset?.order;
  const focusContainer=active?.closest('#queue-list, #baskets, #planner-map, #location-review')?.id;
  const queue=queueOrders(scenario,plan),visible=queue.filter(matches),day=onDay();
  const open=scenario.teams.reduce((sum,team)=>sum+slotsFor(team.id).length,0);
  const occupied=day.reduce((sum,a)=>sum+orderById(a.orderId).slotsRequired,0);
  const locations=summarizeLocations(scenario.addresses);
  const postalNotes=scenario.addresses.filter(address=>address.locationStatus==='MATCHED_BUILDING_POSTCODE_NOTE').length;
  const stats=[[queue.length,'Do umówienia','Kolejka niezależna od dnia'],[day.length,'Zlecenia w koszykach',`${day.filter(a=>a.confirmed).length} potwierdzonych okien`],[`${open-occupied} / ${open}`,'Wolne / otwarte sloty','Wspólny zasób instalacji i pomiarów'],[locations.matched+' / '+locations.total,'Punkty budynków',`${locations.review+locations.missing} nieustalonych · ${postalNotes} z uwagą o kodzie`]];
  $('metrics').innerHTML=stats.map(([value,title,note])=>`<div class="metric"><strong>${escapeText(value)}</strong><div><b>${escapeText(title)}</b><small>${escapeText(note)}</small></div></div>`).join('');
  $('generation-scope').textContent=`Zakres: ${state.city==='ALL'?'wszystkie miejscowości':state.city} · ${state.kind==='ALL'?'wszystkie rodzaje':state.kind}${state.query.trim()?' · wyszukiwanie: '+state.query.trim():''}. Ponowne generowanie zastąpi tylko automatyczne, niepotwierdzone propozycje tego dnia w tym zakresie. Ręczne zmiany i potwierdzenia pozostają.`;
  $('queue-count').textContent=visible.length===queue.length?String(visible.length):`${visible.length} / ${queue.length}`;
  $('queue-list').innerHTML=visible.length?visible.map(order=>{
    const address=addressFor(order),age=Math.max(0,Math.floor((Date.parse(state.date+'T12:00:00Z')-Date.parse(order.createdOn+'T12:00:00Z'))/86400000));
    return `<button type="button" class="order" data-order="${order.id}" aria-pressed="${order.id===state.selectedId}"><span class="order-top"><strong>${order.id}</strong><span class="type ${order.type}">${order.type}</span></span><span class="address">${escapeText(address.label)}</span><span class="order-sub">${age} dni w kolejce testowej · ${order.slotsRequired} ${order.slotsRequired===1?'slot':'sloty'}</span><span class="reason">${escapeText(explainOrder(scenario,plan,order,state.date))}</span></button>`;
  }).join(''):'<p class="empty">Brak nieprzydzielonych zleceń dla tych filtrów.</p>';
  $('basket-day').textContent=state.date;
  $('baskets').innerHTML=scenario.teams.map(team=>{
    const entries=day.filter(a=>a.teamId===team.id);
    const assessment=scenario.routing?assessBasket(scenario,plan,team.id,state.date):null;
    return `<section class="basket" aria-label="Koszyk ${team.id}"><div class="basket-head"><strong>${team.id}</strong><span>${entries.length} zleceń · ${escapeText(team.skills.join(' / '))}</span><button id="map-basket-${team.id}" type="button" data-basket-map="${team.id}" aria-label="Pokaż koszyk ${team.id} na mapie" aria-pressed="${state.mapMode==='basket'&&state.mapTeam===team.id}">Mapa</button></div><div class="basket-slots">${scenario.windows.map((window,index)=>{
      const a=occupies(team.id,index),order=a?orderById(a.orderId):null;
      return `<div class="slot ${!slotsFor(team.id).includes(index)?'closed':''}"><span class="slot-time">${window.join('–')}</span>${a?`<button type="button" data-order="${a.orderId}" data-team="${team.id}" data-start="${a.start}" class="${a.confirmed?'locked':''}" aria-pressed="${a.orderId===state.selectedId}"><strong>${a.orderId} · ${order.type}</strong><small>${escapeText(addressFor(order).city)}${index>a.start?' · ciąg dalszy':''}</small><small>${a.confirmed?'✓ Potwierdzone okno':a.origin==='MANUAL'?'Ręczna propozycja':'Automatyczna propozycja'}</small></button>`:`<span class="slot-empty">${slotsFor(team.id).includes(index)?'Wolne':'Wyłączone'}</span>`}</div>`;
    }).join('')}</div>${assessment?roadCheckSummary(assessment):''}</section>`;
  }).join('');
  $('availability').innerHTML=scenario.teams.map(team=>`<tr><th scope="row">${team.id}<small>${team.skills.join(' / ')}</small></th>${scenario.windows.map((window,index)=>`<td><label><input type="checkbox" data-availability="${team.id}" data-slot="${index}" ${slotsFor(team.id).includes(index)?'checked':''} aria-label="${team.id} ${window.join('–')}">${occupies(team.id,index)?'<span class="taken">Zajęte</span>':slotsFor(team.id).includes(index)?'Otwarte':'Wyłączone'}</label></td>`).join('')}<td>${slotsFor(team.id).length} / ${day.filter(a=>a.teamId===team.id).reduce((sum,a)=>sum+orderById(a.orderId).slotsRequired,0)}</td></tr>`).join('');
  $('undo').disabled=!history.length;
  $('storage-status').textContent=storageAvailable?'Zmiany są zapisywane lokalnie w tej przeglądarce, jeśli pozwalają na to jej ustawienia. JSON pozwala przenieść plan między kartami lub przeglądarkami.':'Pamięć przeglądarki jest niedostępna. Zmiany pozostają w tej sesji. Użyj „Zapisz plan JSON” przed zamknięciem.';
  renderOrderDetails();
  if(mapFrame)renderMapMarkers();
  if(focusOrder&&focusContainer)$(focusContainer)?.querySelector(`[data-order="${focusOrder}"]`)?.focus();
  else if(focusId)$(focusId)?.focus();
}

function renderOrderDetails() {
  const order=orderById(state.selectedId);
  if(!order) {$('order-details').innerHTML='<h2 id="order-title">Wybierz zlecenie</h2>';return;}
  const address=addressFor(order),a=assignmentFor(order.id);
  const status=a?(a.confirmed?'Okno potwierdzone (test)':a.origin==='MANUAL'?'Ręczna propozycja':'Automatyczna propozycja'):'Do umówienia';
  const geo=address.geocoding;
  const snap=scenario.routing?.points.find(point=>point.addressId===address.id)?.snap;
  const roadDetail=snap?.status==='OK'?`<br>Punkt drogi: ${snap.distanceM.toFixed(1)} m od budynku; ostatni dojazd na posesję niepotwierdzony.`:scenario.routing?'<br>Brak potwierdzonego punktu dostępu do drogi.':'';
  const locationDetail=`${escapeText(locationLabel(address))}${hasLocation(address)?`<br>${address.coordinates[1].toFixed(6)}° N, ${address.coordinates[0].toFixed(6)}° E`:''}${geo?`<br>Wynik: ${escapeText(geo.candidate.formatted)}${geo.reasons.length?`<br>${geo.reasons.map(reason=>escapeText(locationReasonText(reason))).join('; ')}`:''}`:''}${roadDetail}<br>Adres z listy użytkownika; zasięg sieci potwierdzony przez użytkownika.`;
  $('order-details').innerHTML=`<p class="eyebrow">WYBRANE ZLECENIE</p><h2 id="order-title">${order.id} <span class="type ${order.type}">${order.type}</span></h2><p class="order-address">${escapeText(address.label)}</p><dl><div><dt>Stan</dt><dd>${status}</dd></div><div><dt>Wymaganie testowe</dt><dd>${order.slotsRequired===2?'2 sąsiednie sloty jednej ekipy · U04 wariant roboczy':'1 slot'}</dd></div><div><dt>Gotowość</dt><dd>${order.ready?'Gotowe — parametr testowy':'Brak gotowości — parametr testowy'}</dd></div><div><dt>Lokalizacja / zasięg</dt><dd>${locationDetail}</dd></div><div><dt>Źródło adresu</dt><dd>${escapeText(scenario.source.sheet)} · wiersz ${address.sourceRows.join(', ')}</dd></div>${a?`<div><dt>Zarezerwowany zasób testowy</dt><dd>${a.date} · ${a.teamId} · ${slotLabel(a.start,order.slotsRequired)}</dd></div>`:''}<div><dt>Finalna obsada D−1</dt><dd>Nieprzydzielona</dd></div></dl><p class="notice compact">${escapeText(explainOrder(scenario,plan,order,state.date))}</p>
    <p class="small muted">Czas pracy w symulacji: ${order.serviceMinutes} min. ${a&&scenario.routing?'Wyniki dróg i okien są widoczne przy koszyku.':''}</p>
    ${!a&&plan.manualExclusions?.some(item=>item.orderId===order.id&&item.date===state.date)?'<button id="include-auto" type="button" class="secondary">Włącz ponownie do generatora na ten dzień</button>':''}
    ${order.type==='BSA'?'<p class="notice compact">Termin umowny BSA nie został podany. Wymaga osobnej weryfikacji przed rzeczywistym umówieniem; symulacja nie stanowi zgody na wyjątek.</p>':''}
    <form id="assignment-form"><label>Ekipa — propozycja zasobu<select id="assignment-team">${scenario.teams.map(team=>`<option value="${team.id}" ${team.id===(a?.teamId??'TEST-02')?'selected':''}>${team.id} · ${team.skills.join('/')}</option>`).join('')}</select></label><label>Dzień przydziału<input id="assignment-date" type="date" value="${a?.date??state.date}" required></label><label>Początek ${order.slotsRequired===2?'2 sąsiednich slotów':'slotu'}<select id="assignment-slot">${scenario.windows.map((window,i)=>`<option value="${i}" ${i===(a?.start??0)?'selected':''}>${window.join('–')}</option>`).join('')}</select></label><button id="assign-order" type="submit" class="primary" ${!order.ready||a?.confirmed?'disabled':''}>${a?'Zmień przydział ręcznie':'Dodaj do koszyka ręcznie'}</button></form>
    ${a?`<button id="remove-order" type="button" class="secondary" ${a.confirmed?'disabled':''}>Wróć do kolejki</button>${a.confirmed?'<p class="lock">✓ Okno potwierdzone i chronione</p><label class="release-reason">Powód zwolnienia potwierdzenia<input id="release-reason" type="text" maxlength="400" placeholder="Np. korekta scenariusza testowego"></label><button id="release-order" type="button" class="danger">Zwolnij potwierdzenie testowe</button>':'<button id="confirm-order" type="button" class="secondary">Potwierdź okno w teście</button>'}`:''}<p class="small muted">Potwierdzenie jest lokalną symulacją uzgodnienia. Nie kontaktuje się z klientem. Przydział i kolejność zmieniasz wyborem dnia, ekipy i początku okna.</p>`;
}

function svgNode(tag,attrs={}) {
  const node=document.createElementNS('http://www.w3.org/2000/svg',tag);
  for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));
  return node;
}

function drawPlannerMap() {
  const svg=$('planner-map'),map=mapData?.regions?.PLANNER??mapData?.regions?.OPO;
  const points=scenario.addresses.filter(hasLocation);
  const bounds=map?.bounds??[17.9,50.65,17.95,50.69];
  mapFrame=createMapFrame(points.length?points.map(a=>a.coordinates):[[bounds[0],bounds[1]],[bounds[2],bounds[3]]],680,380);
  svg.append(svgNode('rect',{x:-10000,y:-10000,width:20000,height:20000,class:'map-ground'}));
  preparedMap=prepareMapFeatures(map,mapFrame);lastMapView=null;
  backgroundLayer=svgNode('g',{'aria-hidden':'true'});svg.append(backgroundLayer);
  routeLayer=svgNode('g',{class:'basket-routes','aria-hidden':'true'});svg.append(routeLayer);
  townLayer=svgNode('g',{'aria-hidden':'true'});svg.append(townLayer);
  // Town labels annotate these actual points; they are not substitute coordinates.
  const towns=new Map();
  for(const address of points){const group=towns.get(address.city)??[];group.push(projectMapPoint(address.coordinates,mapFrame));towns.set(address.city,group);}
  townLabels=[];for(const [city,positions] of towns) {
    const x=positions.reduce((sum,p)=>sum+p[0],0)/positions.length,y=positions.reduce((sum,p)=>sum+p[1],0)/positions.length;
    townLabels.push({city,x,y});
  }
  markerLayer=svgNode('g',{class:'map-points'});svg.append(markerLayer);
  scaleLayer=svgNode('g',{'aria-hidden':'true',class:'map-scale'});svg.append(scaleLayer);renderMapMarkers();
}

function formatRoadDistance(value) {return value===null?'Nieustalone':`${(value/1000).toLocaleString('pl-PL',{maximumFractionDigits:1})} km`;}
function roadCheckSummary(assessment) {
  const label=status=>({PASS:'w limicie',LIMIT:'przekroczony',UNASSESSED:'nieocenione',NOT_APPLICABLE:'nie dotyczy'})[status];
  return `<div class="road-checks"><span class="check ${assessment.installationDistance.status}">30 km: ${label(assessment.installationDistance.status)}</span><span class="check ${assessment.measurementExtra.status}">+10 km: ${label(assessment.measurementExtra.status)}</span><span class="check ${assessment.windows.status}">Dojazd + praca: ${label(assessment.windows.status)}</span><small>${assessment.orders.length>1?`Między wizytami: ${formatRoadDistance(assessment.distanceM)} · ${assessment.estimatedDurationS===null?'czas nieustalony':Math.ceil(assessment.estimatedDurationS/60)+' min (szacunek)'}`:'Ustaw co najmniej dwie wizyty, aby ocenić odcinki.'}</small>${assessment.violations.length?`<strong>${assessment.violations.map(escapeText).join(' ')}</strong>`:''}</div>`;
}

function renderBasemapViewport() {
  const key=viewport.join('/')+'/'+state.selectedId;if(key===lastMapView)return;lastMapView=key;
  backgroundLayer.replaceChildren();townLayer.replaceChildren();
  const factor=viewport[2]/680,visible=visibleMapFeatures(preparedMap,viewport),groups=new Map(),labels=[];
  for(const item of visible) {
    const feature=item.feature,kind=feature.kind;
    if(!groups.has(kind)){const group=svgNode('g',{class:`basemap-${kind}`});groups.set(kind,group);backgroundLayer.append(group);}
    groups.get(kind).append(svgNode('path',{class:feature.category,d:mapFeaturePath(item,mapFrame),'data-feature':feature.id,'vector-effect':'non-scaling-stroke'}));
    if(feature.name&&680/viewport[2]>20&&labels.length<60) {
      const xy=projectMapPoint(feature.points[Math.floor(feature.points.length/2)],mapFrame);
      if(xy[0]>=viewport[0]&&xy[0]<=viewport[0]+viewport[2]&&xy[1]>=viewport[1]&&xy[1]<=viewport[1]+viewport[3])labels.push({text:feature.name,x:xy[0],y:xy[1],kind:'map-road-label'});
    }
  }
  labels.push(...townLabels.filter(item=>item.x>=viewport[0]&&item.x<=viewport[0]+viewport[2]&&item.y>=viewport[1]&&item.y<=viewport[1]+viewport[3]).map(item=>({text:item.city,x:item.x,y:item.y,kind:'map-town-label'})));
  const occupied=[];
  for(const item of labels) {
    const width=(item.text.length*5.5+8)*factor,height=13*factor,box=[item.x-width/2,item.y-height,item.x+width/2,item.y+2*factor];
    if(occupied.some(other=>box[0]<other[2]&&box[2]>other[0]&&box[1]<other[3]&&box[3]>other[1]))continue;
    occupied.push(box);const label=svgNode('text',{x:item.x,y:item.y,class:item.kind,'font-size':10*factor,dy:-3*factor});label.textContent=item.text;townLayer.append(label);
  }
  scaleLayer.replaceChildren();
  const latitude=Math.atan(Math.sinh(Math.PI*(1-2*mapFrame.centerY))),metersPerUnit=40075016.686*Math.cos(latitude)/mapFrame.scale;
  const target=100*factor*metersPerUnit,power=10**Math.floor(Math.log10(target)),meters=[1,2,5].map(n=>n*power).filter(n=>n<=target).at(-1)??power;
  const x=viewport[0]+15*factor,y=viewport[1]+viewport[3]-14*factor;
  scaleLayer.append(svgNode('line',{x1:x,y1:y,x2:x+meters/metersPerUnit,y2:y,'vector-effect':'non-scaling-stroke'}));
  const scaleText=svgNode('text',{x,y:y-5*factor,'font-size':10*factor});scaleText.textContent=meters>=1000?`${meters/1000} km`:`${meters} m`;scaleLayer.append(scaleText);
}

function renderBasketRoute() {
  routeLayer.replaceChildren();
  if(state.mapMode!=='basket'){$('route-summary').textContent='Wybierz „Mapa” przy koszyku, aby zobaczyć kolejność wizyt i lokalnie obliczoną drogę.';return;}
  if(!scenario.routing){$('route-summary').textContent='Brak lokalnych obliczeń drogowych dla tego koszyka.';return;}
  const assessment=assessBasket(scenario,plan,state.mapTeam,state.date);let geometryError=false;
  for(const leg of assessment.legs)if(leg.status==='OK'&&leg.path.length) {
    try {routeLayer.append(svgNode('path',{class:'basket-route',d:mapGeometryPath(decodeRouteGeometry(scenario.routing,leg),mapFrame,4),'vector-effect':'non-scaling-stroke'}));}
    catch {geometryError=true;}
  }
  $('route-summary').textContent=`${state.mapTeam}: ${assessment.orders.join(' → ')||'pusty koszyk'}. Droga między wizytami: ${formatRoadDistance(assessment.distanceM)}; czas: ${assessment.estimatedDurationS===null?'nieustalony':Math.ceil(assessment.estimatedDurationS/60)+' min (szacunek)'}. Bez dojazdu do pierwszej wizyty i powrotu. Manewry przy posesji niezweryfikowane.${geometryError?' Nieprawidłową geometrię pominięto.':''}${assessment.violations.length?' '+assessment.violations.join(' '):''}`;
}

function mapOrders() {
  if(state.mapMode==='selected')return scenario.orders.filter(order=>order.id===state.selectedId);
  if(state.mapMode==='basket'){const ids=new Set(onDay().filter(a=>a.teamId===state.mapTeam).map(a=>a.orderId));return scenario.orders.filter(order=>ids.has(order.id));}
  return scenario.orders.filter(matches);
}

function renderMapMarkers() {
  markerLayer.replaceChildren();
  const orders=mapOrders(),points=orders.filter(order=>hasLocation(addressFor(order))),summary=summarizeLocations(scenario.addresses);
  const scope=state.mapMode==='basket'?`Koszyk ${state.mapTeam} · ${state.date}`:state.mapMode==='selected'?'Wybrany adres':'Zakres według filtrów';
  const postalNotes=scenario.addresses.filter(address=>address.locationStatus==='MATCHED_BUILDING_POSTCODE_NOTE').length;
  $('located-count').textContent=`${summary.matched} / ${summary.total} adresów`;
  $('map-note').textContent=`${scope}: ${points.length} punktów na mapie. W całym zbiorze: ${summary.review} nieustalonych lokalizacji poza mapą; ${postalNotes} punktów z różnym kodem pocztowym usługi (przerywany obrys, kod źródłowy zachowano). ${mapData?.regions?.PLANNER?'Regionalny podkład ulic obejmuje obszar zleceń; przybliż wybrany adres, aby zobaczyć lokalne ulice.':'Podkład ulic obejmuje wyłącznie wycinek Opola.'} ${scenario.routing?'Drogi są obliczane lokalnie; mapa niczego nie wysyła.':'Brak tras i oceny przejazdu.'}`;
  if(!summary.matched&&!summary.review)$('map-note').textContent=`Brak współrzędnych ${summary.total} adresów. Podkład referencyjny Opola nie przedstawia zasięgu sieci ani rozmieszczenia zleceń.`;
  points.sort((a,b)=>Number(a.id===state.selectedId)-Number(b.id===state.selectedId));
  for(const order of points) {
    const address=addressFor(order),xy=projectMapPoint(address.coordinates,mapFrame),selected=order.id===state.selectedId;
    const postalNote=address.locationStatus==='MATCHED_BUILDING_POSTCODE_NOTE',markerLabel=`${order.id} · ${address.label} · ${locationLabel(address)}`;
    const marker=svgNode('circle',{cx:xy[0],cy:xy[1],r:7,class:`map-marker ${order.type}${postalNote?' postcode-note':''}${selected?' selected':''}`,tabindex:0,role:'button','aria-label':markerLabel,'aria-pressed':String(selected),'data-order':order.id,'vector-effect':'non-scaling-stroke'});
    const title=svgNode('title');title.textContent=markerLabel;marker.append(title);markerLayer.append(marker);
    if(selected){const label=svgNode('text',{x:xy[0],y:xy[1],class:'map-selected-label','aria-hidden':'true'});label.textContent=order.id;markerLayer.append(label);}
  }
  const review=orders.filter(order=>['REVIEW_REQUIRED','MATCHED_BUILDING_POSTCODE_NOTE'].includes(addressFor(order).locationStatus));
  $('location-review-count').textContent=`${review.length}`;
  $('location-review').innerHTML=review.map(order=>`<button type="button" data-order="${order.id}" aria-pressed="${order.id===state.selectedId}"><strong>${order.id}</strong> ${escapeText(addressFor(order).label)}<span>${addressFor(order).geocoding.reasons.map(reason=>escapeText(locationReasonText(reason))).join(' · ')}</span></button>`).join('')||'<p class="small muted">Brak uwag do odpowiedzi usługi w tym zakresie.</p>';
  document.querySelectorAll('[data-map="all"], [data-map="selected"]').forEach(button=>button.setAttribute('aria-pressed',String((button.dataset.map==='all'&&state.mapMode==='scope')||(button.dataset.map==='selected'&&state.mapMode==='selected'))));
  renderBasketRoute();
  updateViewport();
}

function fitCurrentMap() {
  const orders=mapOrders().filter(order=>hasLocation(addressFor(order)));
  if(!orders.length||(state.mapMode==='scope'&&orders.length===scenario.addresses.filter(hasLocation).length)){viewport=[0,0,680,380];updateViewport();return;}
  const points=orders.map(order=>projectMapPoint(addressFor(order).coordinates,mapFrame));
  if(state.mapMode==='basket'&&scenario.routing)for(const leg of assessBasket(scenario,plan,state.mapTeam,state.date).legs)if(leg.status==='OK'){
    try {points.push(...decodeRouteGeometry(scenario.routing,leg).map(point=>projectMapPoint(point,mapFrame)));}catch{}
  }
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
  const padding=orders.length===1?1:Math.max(2,Math.max(right-left,bottom-top)*.08);
  const width=Math.max(right-left+2*padding,(bottom-top+2*padding)*680/380,3),height=width*380/680;
  viewport=[(left+right-width)/2,(top+bottom-height)/2,width,height];updateViewport();
}

function updateViewport() {
  $('planner-map').setAttribute('viewBox',viewport.map(n=>Number(n.toFixed(3))).join(' '));
  const factor=viewport[2]/680;
  document.querySelectorAll('#planner-map .map-marker').forEach(marker=>marker.setAttribute('r',String(7*factor)));
  document.querySelectorAll('#planner-map .map-town-label, #planner-map .map-selected-label').forEach(label=>{label.setAttribute('font-size',String(10*factor));label.setAttribute('dy',String(-11*factor));});
  renderBasemapViewport();
}
function moveMap(command) {
  if(command==='all'||command==='selected'){state.mapMode=command==='all'?'scope':'selected';state.mapTeam=null;renderPlanner();fitCurrentMap();return;}
  if(command==='fit'){fitCurrentMap();return;}
  else if(command==='in'||command==='out') {
    const factor=command==='in'?.8:1.25,nextWidth=viewport[2]*factor;
    if(nextWidth<.3||nextWidth>2720)return;
    viewport=[viewport[0]+viewport[2]*(1-factor)/2,viewport[1]+viewport[3]*(1-factor)/2,nextWidth,viewport[3]*factor];
  } else {
    const delta={left:[-.15,0],right:[.15,0],up:[0,-.15],down:[0,.15]}[command];
    if(!delta)return;viewport[0]+=viewport[2]*delta[0];viewport[1]+=viewport[3]*delta[1];
  }
  updateViewport();
}

function selectMapOrder(id) {
  state.selectedId=id;
  const a=assignmentFor(id);
  if(state.mapMode==='basket'&&(!a||a.date!==state.date||a.teamId!==state.mapTeam))state.mapMode='scope';
  renderPlanner();if(state.mapMode==='selected')fitCurrentMap();
}

document.addEventListener('click',event=>{
  const item=event.target.closest('[data-order]');
  if(item) {selectMapOrder(item.dataset.order);return;}
  const basket=event.target.closest('[data-basket-map]');
  if(basket){state.mapMode='basket';state.mapTeam=basket.dataset.basketMap;renderPlanner();fitCurrentMap();return;}
  const mapButton=event.target.closest('[data-map]');if(mapButton)moveMap(mapButton.dataset.map);
});
$('generate').addEventListener('click',()=>{
  const ids=scenario.orders.filter(matches).map(o=>o.id);
  if(perform({type:'GENERATE',date:state.date,orderIds:ids},'Wygenerowano propozycje.'))showMessage(`Plan ${state.date}: ${onDay().length} zleceń w koszykach. W kolejce ogółem: ${queueOrders(scenario,plan).length}. Powody pozostawienia w kolejce widoczne przy zleceniach. ${scenario.routing?'Wyniki lokalnych dróg i szacowanych okien są widoczne przy koszykach.':'Trasy pozostają nieocenione.'}`);
});
for(const [id,key] of [['city-filter','city'],['kind-filter','kind']])$(id).addEventListener('change',event=>{state[key]=event.target.value;state.mapMode='scope';renderPlanner();fitCurrentMap();});
$('planning-date').addEventListener('change',event=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) {event.target.value=state.date;showMessage('Wybierz poprawny dzień.',true);return;}
  state.date=event.target.value;renderPlanner();
});
$('queue-search').addEventListener('input',event=>{state.query=event.target.value;state.mapMode='scope';renderPlanner();fitCurrentMap();});
$('availability').addEventListener('change',event=>{
  const input=event.target.closest('[data-availability]');if(!input)return;
  const slots=new Set(slotsFor(input.dataset.availability)),index=Number(input.dataset.slot);
  if(input.checked)slots.add(index);else slots.delete(index);
  perform({type:'AVAILABILITY',teamId:input.dataset.availability,date:state.date,slots:[...slots].sort()},'Zmieniono dostępność testowej ekipy.');
  $(`availability`).querySelector(`[data-availability="${input.dataset.availability}"][data-slot="${index}"]`)?.focus();
});
$('day-defaults').addEventListener('click',()=>{
  try {
    const missing=scenario.teams.filter(t=>!plan.availability.some(a=>a.teamId===t.id&&a.date===state.date));
    if(!missing.length){showMessage('Dostępność tego dnia jest już zdefiniowana. Zmieniaj poszczególne okna w tabeli.');return;}
    let next=plan;for(const team of missing)next=applyAction(scenario,next,{type:'AVAILABILITY',teamId:team.id,date:state.date,slots:[0,1,2]});
    updatePlan(next,'Dodano testową dostępność: 3 sloty dla każdej brakującej ekipy.');
  } catch(error) {showMessage(error.message,true);}
});
$('order-details').addEventListener('submit',event=>{
  if(event.target.id!=='assignment-form')return;event.preventDefault();
  perform({type:'ASSIGN',orderId:state.selectedId,teamId:$('assignment-team').value,date:$('assignment-date').value,start:Number($('assignment-slot').value)},'Zapisano ręczną propozycję. Generator zachowa tę korektę.');
});
$('order-details').addEventListener('click',event=>{
  const id=event.target.closest('button')?.id;
  if(id==='remove-order')perform({type:'REMOVE',orderId:state.selectedId},'Zlecenie wróciło do kolejki.');
  if(id==='confirm-order')perform({type:'CONFIRM',orderId:state.selectedId},'Potwierdzono okno w lokalnym teście. Finalna obsada D−1 pozostaje nieprzydzielona.');
  if(id==='release-order')perform({type:'UNCONFIRM',orderId:state.selectedId,reason:$('release-reason').value},'Zwolniono testowe potwierdzenie. Zachowano powód korekty.');
  if(id==='include-auto')perform({type:'ALLOW_AUTO',orderId:state.selectedId,date:state.date},'Zlecenie może ponownie uczestniczyć w generowaniu na ten dzień.');
});
$('undo').addEventListener('click',()=>{if(history.length){plan=history.pop();persist();renderPlanner();showMessage('Cofnięto ostatnią zmianę planu.');}});
$('save-plan').addEventListener('click',()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(plan,null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download=`mms-plan-${state.date}.json`;document.body.append(link);link.click();link.remove();
  // The browser owns the download after activation; revoke at a later task.
  document.addEventListener('visibilitychange',()=>URL.revokeObjectURL(url),{once:true});
  showMessage('Przygotowano lokalny plik planu JSON. Plik zawiera identyfikatory testowe i dostępność; nie zawiera katalogu adresów.');
});
$('load-plan').addEventListener('change',async event=>{
  const file=event.target.files?.[0];if(!file)return;
  try {if(file.size>2000000)throw Error('Plik planu jest za duży (limit 2 MB).');updatePlan(restorePlan(scenario,await file.text()),'Wczytano i zweryfikowano plan lokalny. Poprzedni stan można cofnąć.');}
  catch(error){showMessage(`Nie wczytano planu: ${error.message}`,true);}
  finally{event.target.value='';}
});
$('reset-plan').addEventListener('click',()=>$('reset-dialog').showModal());
$('cancel-reset').addEventListener('click',()=>{$('reset-dialog').close();$('reset-plan').focus();});
$('accept-reset').addEventListener('click',()=>{updatePlan(createPlan(scenario),'Wyczyszczono plan testowy. Katalog adresów pozostał bez zmian.');$('reset-dialog').close();$('reset-plan').focus();});
$('planner-map').addEventListener('keydown',event=>{
  const item=event.target.closest('[data-order]');
  if(item&&['Enter',' '].includes(event.key)){event.preventDefault();selectMapOrder(item.dataset.order);return;}
  const command={'+':'in','=':'in','-':'out',ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down',Home:'fit'}[event.key];
  if(command){event.preventDefault();moveMap(command);}
});
$('planner-map').addEventListener('pointerdown',event=>{
  if(event.target.closest('[data-order]')||event.button!==0)return;
  drag={x:event.clientX,y:event.clientY,view:[...viewport],pointerId:event.pointerId};
  $('planner-map').setPointerCapture?.(event.pointerId);
});
$('planner-map').addEventListener('pointermove',event=>{
  if(!drag||event.pointerId!==drag.pointerId)return;
  const rect=$('planner-map').getBoundingClientRect();if(!rect.width||!rect.height)return;
  viewport=[drag.view[0]-(event.clientX-drag.x)*drag.view[2]/rect.width,drag.view[1]-(event.clientY-drag.y)*drag.view[3]/rect.height,drag.view[2],drag.view[3]];updateViewport();
});
for(const event of ['pointerup','pointercancel','lostpointercapture'])$('planner-map').addEventListener(event,()=>{drag=null;});
$('planner-map').addEventListener('wheel',event=>{event.preventDefault();moveMap(event.deltaY<0?'in':'out');},{passive:false});
loadPlanner();
