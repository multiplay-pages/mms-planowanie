// Geocoder candidates are deliberately separate from usable building matches.
const locationError=()=>{throw new Error('Nieprawidłowa warstwa lokalizacji lub dopasowanie adresu.');};
const locationCoordinates=point=>Array.isArray(point)&&point.length===2&&point.every(Number.isFinite)&&point[0]>=14&&point[0]<=24.5&&point[1]>=49&&point[1]<=55;
const locationConfidence=value=>typeof value==='number'&&Number.isFinite(value)&&value>=.95&&value<=1;
const locationText=value=>String(value??'').normalize('NFC').replace(/\s+/g,' ').trim().toLocaleLowerCase('pl');
const locationStreet=value=>locationText(value).replace(/^(ul\.?|ulica)\s+/,'');

function validateUugMatch(address,record) {
  const candidate=record.candidate,registry=candidate.registry,evidence=record.matchEvidence;
  const sameCity=[candidate.city,candidate.citypart].some(city=>locationText(city)===locationText(address.city));
  const sameStreet=locationStreet(address.street)===locationStreet(candidate.street)||Boolean(address.street&&candidate.confidence?.streetPart===1&&/^\d{5}$/.test(registry?.ulic));
  if(locationText(address.building)!==locationText(candidate.housenumber)||!sameCity||!sameStreet||!/^\d{6,7}$/.test(registry?.teryt)||!/^\d{7}$/.test(registry?.simc)||(address.street&&!/^\d{5}$/.test(registry?.ulic))||evidence?.eligibleCount!==1||!Number.isInteger(evidence.returnedCount)||evidence.returnedCount<1)locationError();
  const samePostcode=locationText(address.postcode)===locationText(candidate.postcode);
  if(record.status==='MATCHED_BUILDING_POSTCODE_NOTE') {
    if(samePostcode||record.reasons.length!==1||record.reasons[0]!=='POSTCODE_DIFFERENCE'||evidence.returnedCount!==1||!/^\d{2}-\d{3}$/.test(address.postcode)||!/^\d{2}-\d{3}$/.test(candidate.postcode)||address.postcode.slice(0,2)!==candidate.postcode.slice(0,2))locationError();
  } else if(!samePostcode||record.reasons.length)locationError();
}

export function hasLocation(address) {
  return ['MATCHED_BUILDING','MATCHED_BUILDING_POSTCODE_NOTE'].includes(address?.locationStatus)&&locationCoordinates(address.coordinates);
}

export function mergeGeocoding(dataset,layer=null) {
  const addresses=JSON.parse(JSON.stringify(dataset.addresses));
  // Even a future catalog coordinate must not bypass the reviewed layer contract.
  for(const address of addresses){address.coordinates=null;address.locationStatus='MISSING_COORDINATES';}
  if(layer===null)return addresses;
  if(layer?.schemaVersion!==1||layer.datasetId!==dataset.source.sha256||!['Geoapify','GUGIK_UUG'].includes(layer.source?.provider)||!Array.isArray(layer.records)||layer.records.length!==addresses.length)locationError();
  const uug=layer.source.provider==='GUGIK_UUG';
  if(uug&&(layer.source.srid!==4326||layer.source.method!=='GetAddress'||layer.source.url!=='https://services.gugik.gov.pl/uug/'))locationError();
  const byId=new Map(addresses.map(address=>[address.id,address])),seen=new Set();
  for(const record of layer.records) {
    const statuses=uug?['MATCHED_BUILDING','MATCHED_BUILDING_POSTCODE_NOTE','REVIEW_REQUIRED']:['MATCHED_BUILDING','REVIEW_REQUIRED'];
    if(!record||!byId.has(record.addressId)||seen.has(record.addressId)||!statuses.includes(record.status)||!Array.isArray(record.reasons)||!record.candidate)locationError();
    seen.add(record.addressId);
    const address=byId.get(record.addressId),candidate=record.candidate;
    if(candidate.coordinates!==null&&!locationCoordinates(candidate.coordinates))locationError();
    if(record.status!=='REVIEW_REQUIRED') {
      if(!locationCoordinates(record.coordinates)||JSON.stringify(record.coordinates)!==JSON.stringify(candidate.coordinates)||candidate.country_code!=='pl')locationError();
      if(uug)validateUugMatch(address,record);
      else if(record.reasons.length||!['overall','city','building'].every(key=>locationConfidence(candidate.confidence?.[key]))||(address.street&&!locationConfidence(candidate.confidence?.street)))locationError();
      address.coordinates=[...record.coordinates];
    } else if(record.coordinates!==null||!record.reasons.length)locationError();
    address.locationStatus=record.status;
    address.geocoding=JSON.parse(JSON.stringify({candidate,reasons:record.reasons,source:layer.source,matchEvidence:record.matchEvidence}));
  }
  return addresses;
}

export function locationLabel(address) {
  const provider=address?.geocoding?.source?.provider==='GUGIK_UUG'?'GUGiK':'Geoapify';
  if(address?.locationStatus==='MATCHED_BUILDING_POSTCODE_NOTE'&&hasLocation(address))return `Punkt budynku · ${provider} · różny kod pocztowy`;
  if(hasLocation(address))return `Dopasowany budynek · ${provider}`;
  if(address?.locationStatus==='REVIEW_REQUIRED'&&provider==='GUGiK')return 'Nieustalone współrzędne · GUGiK · wynik poza mapą';
  if(address?.locationStatus==='REVIEW_REQUIRED')return 'Lokalizacja do weryfikacji · kandydat poza mapą';
  return 'Brak ustalonej lokalizacji';
}

export function summarizeLocations(addresses) {
  return {total:addresses.length,matched:addresses.filter(hasLocation).length,
    review:addresses.filter(address=>address.locationStatus==='REVIEW_REQUIRED').length,
    missing:addresses.filter(address=>address.locationStatus!=='REVIEW_REQUIRED'&&!hasLocation(address)).length};
}

export function locationReasonText(code) {
  return ({COORDINATES_INVALID:'Brak poprawnych współrzędnych',COUNTRY_MISMATCH:'Inny kraj',
    BUILDING_MISMATCH:'Brak lub różny numer budynku',CITY_MISMATCH:'Inna miejscowość',
    POSTCODE_MISMATCH:'Brak lub różny kod pocztowy',STREET_MISMATCH:'Nazwa ulicy wymaga sprawdzenia',
    LOW_CONFIDENCE:'Niska pewność ogólna',CITY_CONFIDENCE:'Niepewna miejscowość',
    STREET_CONFIDENCE:'Niepewna ulica',BUILDING_CONFIDENCE:'Brak wystarczającej pewności budynku',
    POSTCODE_DIFFERENCE:'Różny kod pocztowy usługi — zachowano kod źródłowy',
    REGISTRY_IDS_MISSING:'Brak wymaganych identyfikatorów rejestrowych',
    AMBIGUOUS_REGISTER_MATCH:'Kilka zgodnych punktów — lokalizacja niejednoznaczna',
    NO_REGISTER_MATCH:'Usługa nie zwróciła punktu — adres źródłowy zachowano',
    PROVIDER_UNAVAILABLE:'Błąd odpowiedzi usługi — nie oznacza błędu adresu'})[code]??'Wymagana weryfikacja wyniku';
}
