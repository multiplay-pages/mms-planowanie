// Presentation model only: no reservation engine and no routing calculations.
export function buildModel(fixture) {
  if (fixture?.synthetic_only !== true || !fixture.regions?.OPO || !fixture.regions?.KNU) {
    throw new Error('Oczekiwano syntetycznego fixture MAP-04 dla OPO i KNU.');
  }
  const jobs = [], teams = [];
  for (const [region, data] of Object.entries(fixture.regions)) {
    if (!Array.isArray(data.teams) || !Array.isArray(data.jobs) || !data.teams.length || !Array.isArray(data.windows)) {
      throw new Error('Niekompletne ekipy, okna lub zlecenia fixture.');
    }
    const baseline = data.teams[0].availability_slots?.[0]?.slice(0, 8);
    if (!/^\d{4}-\d{2}-$/.test(baseline ?? '')) throw new Error('Brak daty odniesienia fixture.');
    teams.push(...data.teams.map(team => ({ ...team, region })));
    for (const job of data.jobs) {
      const slot = job.slot_id?.match(/^([A-Z]+)-(\d{2})-(\d{2})-(T\d+)$/);
      if (!slot || slot[1] !== region || !Array.isArray(job.window) || !Array.isArray(job.required_qualifications) || !Array.isArray(job.special_requirements)) {
        throw new Error('Nieprawidłowy wpis fixture.');
      }
      jobs.push({ ...job, region, date: baseline + slot[2], fixtureTeamId: `${region}-${slot[4]}`, finalTeamId: null });
    }
  }
  return { fixture, jobs, teams, dates: [...new Set(jobs.map(job => job.date))].sort() };
}

export function filterJobs(model, filters) {
  return model.jobs.filter(job =>
    job.region === filters.region && job.date === filters.date &&
    (!filters.type || filters.type === 'ALL' || job.operator === filters.type) &&
    (!filters.status || filters.status === 'ALL' || job.reservation === filters.status ||
      (filters.status === 'REVIEW' && jobWarnings(model, job).length > 0)) &&
    (!filters.query || `${job.job_id} ${job.point_id}`.toLowerCase().includes(filters.query.trim().toLowerCase()))
  );
}

export function reconcileSelection(jobs, selectedId) {
  return jobs.some(job => job.job_id === selectedId) ? selectedId : (jobs[0]?.job_id ?? null);
}

export function qualifiedTeams(model, job) {
  return model.teams.filter(team => team.region === job.region && job.required_qualifications.every(skill => team.qualifications.includes(skill)));
}

export function hasCoordinates(job) {
  return !job.special_requirements?.some(flag => ['LOCATION_MISSING', 'LOCATION_AMBIGUOUS'].includes(flag)) &&
    Array.isArray(job.coordinates) && job.coordinates.length === 2 && job.coordinates.every(Number.isFinite) &&
    Math.abs(job.coordinates[0]) <= 180 && Math.abs(job.coordinates[1]) <= 90;
}

export function jobWarnings(model, job) {
  const warnings = [];
  const add = (code, title, text) => warnings.push({ code, title, text });
  if (!hasCoordinates(job)) add('LOCATION_UNKNOWN', 'Lokalizacja do weryfikacji', job.special_requirements.includes('LOCATION_AMBIGUOUS') ? 'Niejednoznaczna lokalizacja. Punkt nie jest umieszczony na mapie.' : 'Brak współrzędnych. Punkt nie jest umieszczony na mapie.');
  if (job.special_requirements.includes('BSA_DEADLINE_UNVERIFIED')) add('BSA_UNVERIFIED', 'Termin BSA niezweryfikowany', 'Wymagana weryfikacja u opiekuna umowy i osobna ręczna akceptacja braku terminu. Ostrzeżenie nie oznacza zgody.');
  if (job.slots_required > 1) add('TWO_SLOTS_UNRESERVED', 'Dwa sloty — brak pełnej rezerwacji', 'U04=A to wariant roboczy: dwa sąsiednie sloty tej samej kwalifikowanej ekipy, za zgodą koordynatora. Fixture nie potwierdza takiej rezerwacji.');
  const hint = model.teams.find(team => team.team_id === job.fixtureTeamId);
  if (hint && !job.required_qualifications.every(skill => hint.qualifications.includes(skill))) add('QUALIFICATION_MISMATCH', 'Wskazanie fixture bez kwalifikacji', `${job.fixtureTeamId} nie spełnia wszystkich wymagań. To wskazanie testowe, nie końcowy przydział.`);
  if (!qualifiedTeams(model, job).some(team => team.availability_slots.includes(`${job.date}T${job.window[0]}/${job.window[1]}`))) add('AVAILABILITY_UNKNOWN', 'Brak dostępności w fixture', 'Nie podano dostępności kwalifikowanych ekip dla tego dnia i okna. Nie można z tego wywnioskować wolnej pojemności.');
  if (job.special_requirements.includes('POTENTIAL_SHARED_PERSON')) add('SHARED_PERSON', 'Ryzyko wspólnego personelu', 'Pomiar i instalacja mogą korzystać z tych samych osób. Koordynator musi sprawdzić kolizje.');
  return warnings;
}

export function routeFacts() {
  return { distance: null, duration: null, geometry: null, status: 'UNASSESSED' };
}

export function getSlotState(model, team, date, window, visibleJobs) {
  const allEntries=model.jobs.filter(job=>job.fixtureTeamId===team.team_id && job.date===date && job.window[0]===window[0]);
  const visibleIds=new Set(visibleJobs.map(job=>job.job_id));
  const entries=allEntries.filter(job=>visibleIds.has(job.job_id));
  return {
    available:team.availability_slots.includes(`${date}T${window[0]}/${window[1]}`),
    occupiedCount:allEntries.filter(job=>job.occupied).length,
    hiddenEntriesCount:allEntries.length-entries.length,
    entries,
  };
}
