// MAP-06: pure projection of the current planner state onto map layers.
// It never stores or changes assignments; the planner plan is the only source of truth.
import {hasLocation} from './locations.mjs';
import {assessBasket,decodeRouteGeometry} from './routes.mjs';

// Okabe-Ito based palette: distinguishable for common colour-vision deficiencies.
export const OPERATIONAL_TEAM_COLORS=['#0072B2','#E69F00','#009E73','#CC79A7','#D55E00','#56B4E9','#8C6D1F','#5D3A9B'];

export function operationalTeamColor(scenario,teamId) {
  const index=scenario.teams.findIndex(team=>team.id===teamId);
  return index<0?'#6b7280':OPERATIONAL_TEAM_COLORS[index%OPERATIONAL_TEAM_COLORS.length];
}

const operationalFeature=(geometry,properties)=>({type:'Feature',geometry,properties});
const operationalCollection=features=>({type:'FeatureCollection',features});

/**
 * @param options.hiddenTeams   team IDs whose basket (visits + route) is hidden
 * @param options.showUnassigned show located queue orders
 * @param options.showRoutes    draw known road geometry of basket legs
 * @param options.includeUnassigned predicate for queue orders (planner filters)
 * @param options.selectedId    currently selected order
 */
export function buildOperationalLayers(scenario,plan,date,options={}) {
  const hidden=new Set(options.hiddenTeams??[]),showRoutes=options.showRoutes!==false,showUnassigned=options.showUnassigned!==false;
  const includeUnassigned=options.includeUnassigned??(()=>true),selectedId=options.selectedId??null;
  const addressOf=order=>scenario.addresses.find(address=>address.id===order.addressId);
  const orderOf=id=>scenario.orders.find(order=>order.id===id);
  const visits=[],routes=[],unassigned=[],gaps=[],teams=[];
  for(const team of scenario.teams) {
    const color=operationalTeamColor(scenario,team.id),visible=!hidden.has(team.id);
    const assessment=assessBasket(scenario,plan,team.id,date);
    const byOrder=new Map(plan.assignments.filter(a=>a.teamId===team.id&&a.date===date).map(a=>[a.orderId,a]));
    // Visit numbers follow the exact order used for the road assessment and the drawn route.
    assessment.orders.forEach((orderId,index)=>{
      const order=orderOf(orderId),address=addressOf(order),assignment=byOrder.get(orderId);
      if(!hasLocation(address)) {gaps.push({kind:'NO_LOCATION',teamId:team.id,orderId,message:`${orderId}: brak ustalonej pozycji — wizyta nie jest rysowana.`});return;}
      if(!visible)return;
      const end=scenario.windows[assignment.start+(order.slotsRequired??1)-1];
      visits.push(operationalFeature({type:'Point',coordinates:address.coordinates},{
        orderId,teamId:team.id,color,seq:index+1,label:String(index+1),type:order.type,kind:order.type==='POMIAR'?'measurement':'installation',
        window:`${scenario.windows[assignment.start][0]}–${end[1]}`,start:assignment.start,confirmed:assignment.confirmed,origin:assignment.origin,
        city:address.city,address:address.label,selected:orderId===selectedId,
      }));
    });
    if(scenario.routing) {
      assessment.legs.forEach((leg,index)=>{
        if(leg.status!=='OK') {gaps.push({kind:leg.status==='NO_PATH'?'NO_ROAD':leg.status,teamId:team.id,from:leg.from,to:leg.to,message:`${team.id}: brak znanej drogi ${leg.from} → ${leg.to} (${leg.status}) — odcinek nie jest rysowany.`});return;}
        if(!visible||!showRoutes)return;
        let coordinates;
        // A corrupt or disconnected chain is reported, never replaced by a straight line.
        try {coordinates=decodeRouteGeometry(scenario.routing,leg);} catch {gaps.push({kind:'INVALID_GEOMETRY',teamId:team.id,from:leg.from,to:leg.to,message:`${team.id}: nieprawidłowa geometria ${leg.from} → ${leg.to} — pominięto.`});return;}
        if(coordinates.length>=2)routes.push(operationalFeature({type:'LineString',coordinates},{teamId:team.id,color,from:leg.from,to:leg.to,seq:index+1,distanceM:leg.distanceM}));
      });
    } else if(assessment.orders.length>1)gaps.push({kind:'NO_ROUTING',teamId:team.id,message:`${team.id}: brak lokalnych wyników dróg — trasy nieocenione.`});
    teams.push({teamId:team.id,color,visible,count:assessment.orders.length,orders:assessment.orders,distanceM:assessment.distanceM,estimatedDurationS:assessment.estimatedDurationS,
      checks:{installationDistance:assessment.installationDistance.status,measurementExtra:assessment.measurementExtra.status,windows:assessment.windows.status},violations:assessment.violations});
  }
  const assigned=new Set(plan.assignments.map(a=>a.orderId));
  let unlocatedQueue=0;
  for(const order of scenario.orders) {
    if(assigned.has(order.id))continue;
    const address=addressOf(order);
    // Unlocated queue orders are reported globally, independent of queue filters.
    if(!hasLocation(address)){unlocatedQueue++;continue;}
    if(!includeUnassigned(order))continue;
    if(showUnassigned)unassigned.push(operationalFeature({type:'Point',coordinates:address.coordinates},{orderId:order.id,type:order.type,kind:order.type==='POMIAR'?'measurement':'installation',ready:order.ready,city:address.city,address:address.label,selected:order.id===selectedId}));
  }
  if(unlocatedQueue)gaps.push({kind:'NO_LOCATION_QUEUE',count:unlocatedQueue,message:`${unlocatedQueue} zleceń w kolejce bez ustalonej pozycji — poza mapą (decyzja użytkownika).`});
  return {date,visits:operationalCollection(visits),routes:operationalCollection(routes),unassigned:operationalCollection(unassigned),gaps,teams};
}

/** Bounding box [west,south,east,north] of the given point/line collections, or null. */
export function operationalBounds(...collections) {
  let west=Infinity,south=Infinity,east=-Infinity,north=-Infinity;
  const add=([lon,lat])=>{west=Math.min(west,lon);east=Math.max(east,lon);south=Math.min(south,lat);north=Math.max(north,lat);};
  for(const collection of collections)for(const feature of collection?.features??[]) {
    if(feature.geometry.type==='Point')add(feature.geometry.coordinates);else feature.geometry.coordinates.forEach(add);
  }
  return west===Infinity?null:[west,south,east,north];
}
