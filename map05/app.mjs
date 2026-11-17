import { buildModel, filterJobs, reconcileSelection, qualifiedTeams, hasCoordinates, jobWarnings, getSlotState } from './model.mjs';
import { createMapFrame, projectMapPoint, mapGeometryPath } from './map.mjs';

const $ = id => document.getElementById(id);
const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const typeName = job => job.operator === 'POMIAR' ? 'Pomiar' : `Instalacja ${job.operator}`;
const shortDate = value => new Intl.DateTimeFormat('pl-PL',{day:'numeric',month:'long',timeZone:'Europe/Warsaw'}).format(new Date(value+'T12:00:00Z'));
const longDate = value => new Intl.DateTimeFormat('pl-PL',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Warsaw'}).format(new Date(value+'T12:00:00Z'));
const state = { region:'OPO', date:'', type:'ALL', status:'ALL', query:'', selectedId:null, view:'points', notes:new Map() };
let model, basemap=null, visibleJobs=[], reviewJobId=null, reviewTrigger=null;

async function load() {
  $('loading').hidden=false; $('failure').hidden=true; $('application').hidden=true;
  try {
    const bundled=document.getElementById('map04-data');
    if(bundled) {
      model=buildModel(JSON.parse(bundled.textContent));
    } else {
      const response=await fetch('./map04/fixtures.json',{cache:'no-store'});
      if(!response.ok) throw new Error(`Fixture niedostępny (HTTP ${response.status}).`);
      model=buildModel(await response.json());
    }
    const bundledMap=document.getElementById('basemap-data');
    try {
      if(bundledMap) basemap=JSON.parse(bundledMap.textContent);
      else {
        const response=await fetch('./basemap/data.json',{cache:'no-store'});
        if(!response.ok) throw new Error('Brak lokalnego podkładu mapy.');
        basemap=await response.json();
      }
      if(!basemap?.regions?.OPO?.features?.length||!basemap?.regions?.KNU?.features?.length) throw new Error('Niekompletny podkład.');
    } catch { basemap=null; }
    state.date=model.dates[0];
    $('date-filter').innerHTML=model.dates.map(date=>`<option value="${safe(date)}">${safe(longDate(date))}</option>`).join('');
    $('source-label').textContent=`Źródło: ${bundled?'lokalna kopia ':''}map04/fixtures.json · v${model.fixture.fixture_version} · ${model.jobs.length} zleceń / ${model.teams.length} ekip`;
    render(); $('application').hidden=false;
  } catch(error) {
    $('failure-message').textContent=error.message;
    $('failure').hidden=false;
  } finally { $('loading').hidden=true; }
}

function render() {
  visibleJobs=filterJobs(model,state);
  state.selectedId=reconcileSelection(visibleJobs,state.selectedId);
  document.querySelectorAll('[data-region]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.region===state.region)));
  $('region-notice').hidden=state.region!=='KNU';
  $('date-filter').value=state.date;
  const confirmed=visibleJobs.filter(job=>job.reservation==='CONFIRMED').length;
  const review=visibleJobs.filter(job=>jobWarnings(model,job).length).length;
  const teams=model.teams.filter(team=>team.region===state.region);
  $('summary').innerHTML=[
    [visibleJobs.length,'Zlecenia w widoku',`${state.region} · ${shortDate(state.date)}`,''],
    [confirmed,'Potwierdzone okna','Bez końcowej ekipy D−1',''],
    [teams.length,'Ekipy w fixture','Pojemność niezweryfikowana',''],
    [review,'Do ręcznej weryfikacji','Zlecenia z ostrzeżeniami','attention']
  ].map(([count,title,text,cls])=>`<div class="summary-item ${cls}"><strong>${count}</strong><div><b>${safe(title)}</b>${safe(text)}</div></div>`).join('');
  renderJobs(); renderMap(); renderSchedule(); renderDetails();
  $('announcement').textContent=`${state.region}, ${shortDate(state.date)}. ${visibleJobs.length} zleceń. ${state.selectedId ? 'Wybrano '+state.selectedId : 'Brak wyboru.'}`;
}

function renderJobs() {
  $('job-count').textContent=String(visibleJobs.length);
  $('job-list').innerHTML=visibleJobs.length ? visibleJobs.map(job=>{
    const warnings=jobWarnings(model,job);
    return `<button type="button" class="job-button" data-job="${safe(job.job_id)}" aria-pressed="${job.job_id===state.selectedId}" aria-label="${safe(job.job_id+' · '+typeName(job)+' · '+job.window.join('–'))}"><span class="job-top"><span class="job-id">${safe(job.job_id)}</span><span class="job-window">${safe(job.window.join('–'))}</span></span><span class="job-meta"><span class="type-badge type-${safe(job.operator)}">${safe(job.operator==='POMIAR'?'POMIAR':job.operator)}</span><span class="reservation">${job.reservation==='CONFIRMED'?'✓ Okno potwierdzone':'Do umówienia'}</span></span><span class="job-location">${safe(job.point_id)} · ${hasCoordinates(job)?'punkt syntetyczny':'brak pewnej lokalizacji'}</span>${warnings.length?`<span class="job-warning">${safe(warnings[0].title)}${warnings.length>1?` (+${warnings.length-1})`:''}</span>`:''}</button>`;
  }).join('') : '<div class="empty-state"><strong>Brak zleceń dla tych filtrów</strong>Zmień dzień lub wyczyść typ, status i wyszukiwanie.<br><button type="button" data-reset>Wyczyść filtry</button></div>';
}

function svgElement(tag, attrs={}, text) {
  const node=document.createElementNS('http://www.w3.org/2000/svg',tag);
  for(const [key,value] of Object.entries(attrs)) node.setAttribute(key,String(value));
  if(text!==undefined) node.textContent=text;
  return node;
}

function renderMap() {
  $('map-region').textContent=`/ ${state.region}`;
  $('point-view').hidden=state.view!=='points'; $('coordinate-view').hidden=state.view!=='list';
  document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===state.view)));
  const svg=$('point-map');
  svg.querySelectorAll(':scope > :not(title):not(desc)').forEach(node=>node.remove());
  const allPoints=model.jobs.filter(job=>job.region===state.region && hasCoordinates(job));
  const frame=createMapFrame(allPoints.map(job=>job.coordinates),680,420);
  const mapData=basemap?.regions?.[state.region];
  $('map-status').textContent=mapData?'Podkład OpenStreetMap zapisany lokalnie · punkty zleceń syntetyczne':'Brak podkładu mapy — dostępny tylko schemat punktów';
  $('map-attribution').hidden=!mapData;
  svg.append(svgElement('rect',{width:680,height:420,class:'map-ground'}));
  if(mapData) drawBasemap(svg,mapData,frame);
  else {
    for(let x=0;x<=680;x+=85) svg.append(svgElement('line',{x1:x,y1:0,x2:x,y2:420,class:'plot-grid'}));
    for(let y=0;y<=420;y+=70) svg.append(svgElement('line',{x1:0,y1:y,x2:680,y2:y,class:'plot-grid'}));
  }
  const points=visibleJobs.filter(hasCoordinates);
  // Render selected last so the halo stays visible without changing coordinates.
  points.sort((a,b)=>Number(a.job_id===state.selectedId)-Number(b.job_id===state.selectedId));
  for(const job of points) {
    const [x,y]=projectMapPoint(job.coordinates,frame);
    const group=svgElement('g',{class:`point ${job.operator}`,transform:`translate(${x},${y})`,tabindex:0,role:'button','data-job':job.job_id,'aria-pressed':job.job_id===state.selectedId,'aria-label':`${job.job_id}, ${typeName(job)}, ${job.window.join('–')}`});
    group.append(svgElement('title',{},`${job.job_id} · ${typeName(job)}`),svgElement('circle',{r:23,class:'halo'}));
    if(job.operator==='BSA') group.append(svgElement('rect',{x:-15,y:-15,width:30,height:30,rx:5,class:'marker'}));
    else if(job.operator==='POMIAR') group.append(svgElement('path',{d:'M0 -20 L20 0 L0 20 L-20 0 Z',class:'marker'}));
    else group.append(svgElement('circle',{r:16,class:'marker'}));
    group.append(svgElement('text',{y:4,class:'point-number'},job.job_id.slice(-2)));
    svg.append(group);
  }
  if(!points.length) {
    svg.append(svgElement('rect',{x:105,y:181,width:470,height:48,rx:8,class:'map-message-background'}));
    svg.append(svgElement('text',{x:340,y:210,'text-anchor':'middle',class:'plot-empty'},visibleJobs.length?'Brak punktów o pewnej lokalizacji':'Brak zleceń w tym widoku'));
  }
  $('coordinate-view').innerHTML=visibleJobs.length?visibleJobs.map(job=>`<div class="coordinate-row"><button type="button" data-job="${safe(job.job_id)}" aria-pressed="${job.job_id===state.selectedId}">${safe(job.job_id)}</button><span>${hasCoordinates(job)?safe(`${job.coordinates[1].toFixed(4)}° N, ${job.coordinates[0].toFixed(4)}° E`):'Brak pewnej lokalizacji'}</span></div>`).join(''):'<p class="empty-state">Brak zleceń w tym widoku.</p>';
  const unlocated=visibleJobs.filter(job=>!hasCoordinates(job));
  $('unlocated').hidden=!unlocated.length;
  $('unlocated').innerHTML=`<strong>Poza mapą — lokalizacja do weryfikacji:</strong> ${unlocated.map(job=>`<button type="button" data-job="${safe(job.job_id)}">${safe(job.job_id)}</button>`).join(' ')}<br>Nie zastępujemy brakującego punktu środkiem regionu.`;
  const teams=model.teams.filter(team=>team.region===state.region);
  $('team-tray').innerHTML='<p>Ekipy w puli · brak współrzędnych w fixture, bez pozycji na mapie</p>'+teams.map(team=>`<span class="team-chip"><i class="dot team"></i>${safe(team.team_id)}</span>`).join('');
}

function drawBasemap(svg,data,frame) {
  const layer=svgElement('g',{'aria-hidden':'true',class:'basemap-layer'});
  const features=data.features;
  // These lines are public map features, never paths calculated between jobs.
  for(const kind of ['green','water','rail','road']) {
    const group=svgElement('g',{class:`basemap-${kind}`});
    for(const feature of features.filter(item=>item.kind===kind)) {
      const d=mapGeometryPath(feature.points,frame)+(feature.category==='area'?' Z':'');
      group.append(svgElement('path',{d,class:`map-feature ${feature.category}`}));
    }
    layer.append(group);
  }
  const labels=svgElement('g',{class:'map-labels'}),seen=new Set(),positions=[];
  for(const feature of features.filter(item=>item.name&&['primary','secondary','tertiary','river','area'].includes(item.category))) {
    if(seen.has(feature.name)||feature.name.length>35) continue;
    const [x,y]=projectMapPoint(feature.points[Math.floor(feature.points.length/2)],frame);
    if(x<75||x>605||y<25||y>395||positions.some(p=>Math.hypot(p[0]-x,p[1]-y)<62)) continue;
    labels.append(svgElement('text',{x,y,class:'map-street-label','text-anchor':'middle'},feature.name));
    seen.add(feature.name);positions.push([x,y]);
    if(positions.length>=20) break;
  }
  layer.append(labels);svg.append(layer);
}

function renderSchedule() {
  const region=model.fixture.regions[state.region];
  const teams=model.teams.filter(team=>team.region===state.region);
  $('schedule').innerHTML=`<table class="schedule-table"><caption class="sr-only">${safe(state.region+' · '+longDate(state.date))} · wskazania testowe, bez końcowych przydziałów ekip</caption><thead><tr><th scope="col">Ekipa / kwalifikacje</th>${region.windows.map(window=>`<th scope="col">${safe(window.join('–'))}</th>`).join('')}</tr></thead><tbody>${teams.map(team=>`<tr><th scope="row">${safe(team.team_id)}<span class="team-skills">${safe(team.qualifications.join(' · '))}</span></th>${region.windows.map(window=>{
    const slot=getSlotState(model,team,state.date,window,visibleJobs);
    const {available,entries,occupiedCount,hiddenEntriesCount}=slot;
    const availability=!available?'<span>Brak dostępności fixture</span>':!entries.length&&!hiddenEntriesCount?'<span>Bez zajętości fixture<br>Wykonalność nieoceniona</span>':'';
    const hidden=hiddenEntriesCount?`<p class="hidden-entries">${occupiedCount?`Zajętość fixture: ${occupiedCount}. `:''}Wpisy poza filtrami: ${hiddenEntriesCount}.${!occupiedCount?' Bez rezerwacji.':''}</p>`:'';
    return `<td>${availability}${entries.map(job=>`<button type="button" class="slot-job ${job.occupied?'confirmed':''}" data-job="${safe(job.job_id)}" aria-pressed="${job.job_id===state.selectedId}">${safe(job.job_id)} · ${safe(job.operator)}<span>${job.occupied?'Zajętość fixture':'Kolejka · bez rezerwacji'}${job.slots_required>1?' · wymaga 2 slotów':''}</span></button>`).join('')}${hidden}</td>`;
  }).join('')}</tr>`).join('')}</tbody></table>`;
}

function renderDetails() {
  const job=visibleJobs.find(job=>job.job_id===state.selectedId);
  if(!job) {
    $('details').innerHTML='<div class="detail-empty"><p class="eyebrow">04 / SZCZEGÓŁY</p><h2 id="details-title">Brak wybranego zlecenia</h2><p>Zmień filtry, a następnie wybierz zlecenie z listy, punktów lub terminarza.</p></div>';
    return;
  }
  const warnings=jobWarnings(model,job), candidates=qualifiedTeams(model,job);
  const note=state.notes.get(job.job_id);
  $('details').innerHTML=`<div class="detail-head"><p class="eyebrow">04 / WYBRANE ZLECENIE</p><h2 id="details-title">${safe(job.job_id)}</h2><div class="job-meta"><span class="type-badge type-${safe(job.operator)}">${safe(job.operator)}</span>${job.region==='KNU'?'<span class="badge light">TEST ONLY</span>':''}</div><span class="selected-label">${safe(job.point_id)} · ${safe(typeName(job))}</span></div>
  <div class="detail-section"><dl class="detail-list"><div><dt>Dzień</dt><dd>${safe(shortDate(job.date))}</dd></div><div><dt>Okno</dt><dd>${safe(job.window.join('–'))}</dd></div><div><dt>Region</dt><dd>${safe(job.region)}</dd></div><div><dt>Potwierdzenie</dt><dd>${job.reservation==='CONFIRMED'?'Dzień / okno potwierdzone':'Do umówienia'}</dd></div><div><dt>Obsługa (test)</dt><dd>${job.service_minutes} min · bez dojazdu</dd></div><div><dt>Wymagane sloty</dt><dd>${job.slots_required}${job.slots_required>1?' · rezerwacja niepełna':''}</dd></div><div><dt>Termin BSA</dt><dd>${job.operator!=='BSA'?'Nie dotyczy':job.special_requirements.includes('BSA_DEADLINE_VERIFIED')?'Flaga VERIFIED w fixture; brak daty':'Niezweryfikowany'}</dd></div><div><dt>Źródło</dt><dd>map04/fixtures.json</dd></div></dl><p class="section-note">Czas obsługi to parametr syntetyczny, nie zatwierdzona norma. Nie oceniamy zmieszczenia pracy i dojazdu w oknie.</p></div>
  <div class="detail-section"><h3>Wymagane kwalifikacje</h3><div class="skills">${job.required_qualifications.map(skill=>`<span class="skill">${safe(skill)}</span>`).join('')}</div><p class="section-note">Zgodne kwalifikacje: ${safe(candidates.map(team=>team.team_id).join(', ')||'brak')}. To lista kompetencji, bez oceny dostępności i dopasowania puli.</p></div>
  <div class="detail-section"><h3>Dzień / okno ≠ końcowa ekipa</h3><div class="step"><span class="step-number">1</span><div><strong>${job.reservation==='CONFIRMED'?'Potwierdzenie w fixture':'Propozycja w kolejce'}</strong><p>${job.reservation==='CONFIRMED'?'Chroniony dzień i okno; model puli roboczy U02=A.':'Nie ma potwierdzenia ani rezerwacji pojemności.'}</p></div></div><div class="step pending"><span class="step-number">2</span><div><strong>D−1 · ekipa nieprzydzielona</strong><p>Wskazanie slot_id: ${safe(job.fixtureTeamId)}. Nie jest finalnym przydziałem.</p></div></div></div>
  <div class="detail-section"><h3>Weryfikacja koordynatora</h3>${warnings.length?warnings.map(warning=>`<div class="warning-box"><strong>! ${safe(warning.title)}</strong>${safe(warning.text)}</div>`).join(''):'<div class="neutral-box">Brak dodatkowych ostrzeżeń danych. Wykonalność pozostaje nieoceniona — brak routingu.</div>'}<button class="review-button" id="open-review" type="button">Przygotuj ręczną weryfikację <span aria-hidden="true">↗</span></button>${note?`<p class="detail-note"><strong>Notatka w sesji — nie zgoda</strong><br>${safe(note)}</p>`:''}</div>`;
}

document.addEventListener('click',event=>{
  const jobButton=event.target.closest('[data-job]');
  if(jobButton) {
    const id=jobButton.dataset.job;
    if(!visibleJobs.some(job=>job.job_id===id)) return;
    const source=jobButton.closest('#point-map')?'#point-map':jobButton.closest('#schedule')?'#schedule':jobButton.closest('#coordinate-view')?'#coordinate-view':jobButton.closest('#unlocated')?'#unlocated':'#job-list';
    state.selectedId=id; render();
    document.querySelector(`${source} [data-job="${id}"]`)?.focus({preventScroll:true});
  }
  const region=event.target.closest('[data-region]');
  if(region){state.region=region.dataset.region;render();}
  const view=event.target.closest('[data-view]');
  if(view){state.view=view.dataset.view;renderMap();}
  if(event.target.closest('[data-reset]')) resetFilters();
  if(event.target.closest('#open-review')) {
    reviewJobId=state.selectedId; reviewTrigger=event.target.closest('#open-review');
    $('review-context').textContent=`${reviewJobId} · zapisz tylko to, co wymaga sprawdzenia. Właściwa decyzja pozostaje poza makietą.`;
    $('review-note').value=state.notes.get(reviewJobId)||'';
    $('review-dialog').showModal(); $('review-note').focus();
  }
});

$('point-map').addEventListener('keydown',event=>{
  if((event.key==='Enter'||event.key===' ')&&event.target.closest('[data-job]')) {event.preventDefault();event.target.closest('[data-job]').dispatchEvent(new MouseEvent('click',{bubbles:true}));}
});
for(const [id,key] of [['date-filter','date'],['type-filter','type'],['status-filter','status']]) $(id).addEventListener('change',event=>{state[key]=event.target.value;render();});
$('search').addEventListener('input',event=>{state.query=event.target.value;render();});
function resetFilters(){state.type='ALL';state.status='ALL';state.query='';$('type-filter').value='ALL';$('status-filter').value='ALL';$('search').value='';render();$('search').focus();}
$('retry').addEventListener('click',load);
$('cancel-review').addEventListener('click',()=>$('review-dialog').close());
$('review-dialog').addEventListener('close',()=>{reviewTrigger=$('open-review');reviewTrigger?.focus();});
$('review-form').addEventListener('submit',event=>{
  event.preventDefault(); const note=$('review-note').value.trim();
  if(!note){$('review-note').setCustomValidity('Wpisz, co należy zweryfikować.');$('review-note').reportValidity();return;}
  state.notes.set(reviewJobId,note); renderDetails(); $('review-dialog').close();
  $('announcement').textContent='Dodano notatkę tylko w sesji. Status i ostrzeżenia pozostają bez zmian.';
});
$('review-note').addEventListener('input',()=>$('review-note').setCustomValidity(''));
load();
