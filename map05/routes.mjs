// Local OSM snapshot only. Road length and estimated travel time are distinct.
const roadLayerError=()=>{throw Error('Nieprawidłowa lokalna warstwa tras lub współrzędne punktów.');};
const roadFinite=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const roadPoint=point=>Array.isArray(point)&&point.length===2&&point.every(Number.isFinite)&&point[0]>=14&&point[0]<=25&&point[1]>=48&&point[1]<=56;
const roadUnavailable=(status='LOCATION_UNKNOWN')=>({status,distanceM:null,estimatedDurationS:null,path:null});
const roadDecodedSegments=new WeakMap();

export function mergeRoutes(datasetId,addresses,layer=null) {
  if(layer===null)return null;
  if(layer.schemaVersion!==1||layer.datasetId!==datasetId||layer.source?.provider!=='LOCAL_OSM'||layer.source.profile!=='shortest-distance'||!['roadsSha256','engineSha256'].every(key=>/^[a-f0-9]{64}$/.test(layer.source[key]))||!Array.isArray(layer.points)||!Array.isArray(layer.segments)||!layer.routes||layer.points.length>addresses.length)roadLayerError();
  const known=new Map(addresses.map(address=>[address.id,address])),ids=new Set();
  for(const point of layer.points) {
    if(!known.has(point.addressId)||ids.has(point.addressId)||!roadPoint(point.coordinates)||JSON.stringify(point.coordinates)!==JSON.stringify(known.get(point.addressId).coordinates)||!['OK','SNAP_UNCERTAIN'].includes(point.snap?.status))roadLayerError();
    if(point.snap.status==='OK'&&(!roadPoint(point.snap.coordinates)||!roadFinite(point.snap.distanceM)||point.snap.distanceM>150))roadLayerError();
    ids.add(point.addressId);
  }
  if(layer.segments.some(segment=>typeof segment!=='string'||!segment.length||segment.length>1000000||!/^[?-~]+$/.test(segment)))roadLayerError();
  if(Object.keys(layer.routes).length!==ids.size||Object.keys(layer.routes).some(id=>!ids.has(id)))roadLayerError();
  for(const from of ids) {
    const row=layer.routes[from];
    if(!row||Object.keys(row).length!==ids.size||Object.keys(row).some(id=>!ids.has(id)))roadLayerError();
    for(const to of ids) {
      const route=row[to];
      if(route?.status==='OK') {
        if(!roadFinite(route.distanceM)||!roadFinite(route.estimatedDurationS)||!Array.isArray(route.path)||(route.distanceM>0&&!route.path.length)||route.path.some(id=>!Number.isInteger(id)||id===0||Math.abs(id)>layer.segments.length))roadLayerError();
      } else if(!['NO_PATH','SNAP_UNCERTAIN','LOCATION_UNKNOWN'].includes(route?.status)||route.distanceM!==null||route.estimatedDurationS!==null||route.path!==null)roadLayerError();
    }
  }
  return JSON.parse(JSON.stringify(layer));
}

export function routeLeg(routing,from,to) {
  return routing?.routes?.[from]?.[to]??roadUnavailable();
}

export function decodeRoadPolyline(encoded) {
  let offset=0,lat=0,lon=0;const points=[];
  const next=()=>{
    let value=0,shift=0,byte;
    do {if(offset>=encoded.length||shift>30)roadLayerError();byte=encoded.charCodeAt(offset++)-63;if(byte<0||byte>63)roadLayerError();value|=(byte&31)<<shift;shift+=5;}while(byte>=32);
    return value&1?~(value>>>1):value>>>1;
  };
  while(offset<encoded.length){lat+=next();lon+=next();points.push([lon/1e5,lat/1e5]);}
  if(points.length<2)roadLayerError();return points;
}

export function decodeRouteGeometry(routing,route) {
  if(route?.status!=='OK'||!Array.isArray(route.path))return [];
  let cache=roadDecodedSegments.get(routing);
  if(!cache){cache=new Map();roadDecodedSegments.set(routing,cache);}
  const result=[];
  for(const signed of route.path) {
    const index=Math.abs(signed)-1;
    let points=cache.get(index);
    if(!points) {
      points=decodeRoadPolyline(routing.segments[index]);cache.set(index,points);
    }
    const ordered=signed<0?[...points].reverse():points;
    // Never draw a shortcut across a corrupt or disconnected geometry chain.
    if(result.length&&JSON.stringify(result.at(-1))!==JSON.stringify(ordered[0]))roadLayerError();
    result.push(...(result.length?ordered.slice(1):ordered));
  }
  return result;
}

export function assessBasket(scenario,plan,teamId,date) {
  const assignments=plan.assignments.filter(item=>item.teamId===teamId&&item.date===date).sort((a,b)=>a.start-b.start||a.orderId.localeCompare(b.orderId));
  const orders=assignments.map(item=>scenario.orders.find(order=>order.id===item.orderId));
  const legs=orders.slice(1).map((order,index)=>({from:orders[index].id,to:order.id,...routeLeg(scenario.routing,orders[index].addressId,order.addressId)}));
  const known=legs.every(leg=>leg.status==='OK'),distanceM=orders.length>1&&known?legs.reduce((sum,leg)=>sum+leg.distanceM,0):null;
  const estimatedDurationS=orders.length>1&&known?legs.reduce((sum,leg)=>sum+leg.estimatedDurationS,0):null;
  const installs=orders.map((order,index)=>({order,index})).filter(item=>item.order.type!=='POMIAR');
  const chains=installs.slice(1).map((item,index)=>{
    const traveled=legs.slice(installs[index].index,item.index);
    return traveled.every(leg=>leg.status==='OK')?traveled.reduce((sum,leg)=>sum+leg.distanceM,0):null;
  });
  const installationDistance={status:chains.length?chains.some(value=>value!==null&&value>30000)?'LIMIT':chains.some(value=>value===null)?'UNASSESSED':'PASS':'NOT_APPLICABLE',maxM:chains.length&&chains.every(value=>value!==null)?Math.max(...chains):null,chains};
  const hasMeasurements=orders.some(order=>order.type==='POMIAR');
  let measurementExtra={status:'NOT_APPLICABLE',extraM:null,baselineM:null};
  if(hasMeasurements) {
    const bounded=installs.length>=2&&installs[0].index===0&&installs.at(-1).index===orders.length-1;
    const baseline=installs.slice(1).map((item,index)=>routeLeg(scenario.routing,installs[index].order.addressId,item.order.addressId));
    if(bounded&&known&&baseline.every(leg=>leg.status==='OK')) {
      const baselineM=baseline.reduce((sum,leg)=>sum+leg.distanceM,0),extraM=distanceM-baselineM;
      measurementExtra={status:extraM>10000?'LIMIT':'PASS',extraM,baselineM};
    } else measurementExtra={status:'UNASSESSED',extraM:null,baselineM:null,reason:bounded?'Brak odcinka drogi.':'Brak znanego punktu startowego/końcowego ekipy dla pomiaru poza instalacjami.'};
  }
  const seconds=time=>{const [hours,minutes]=time.split(':').map(Number);return hours*3600+minutes*60;};
  const entries=assignments.map((assignment,index)=>{
    const order=orders[index],serviceS=(order.serviceMinutes??(order.type==='POMIAR'?45:order.type==='BSA'?150:120))*60;
    const count=order.slotsRequired??1,start=scenario.windows[assignment.start],end=scenario.windows[assignment.start+count-1];
    const windowS=end&&start?seconds(end[1])-seconds(start[0]):0,travelS=index?legs[index-1].estimatedDurationS:null;
    const status=serviceS>windowS||(travelS!==null&&serviceS+travelS>windowS)?'LIMIT':travelS===null?'UNASSESSED':'PASS';
    return {orderId:order.id,status,serviceS,travelS,windowS};
  });
  const windows={status:entries.some(entry=>entry.status==='LIMIT')?'LIMIT':entries.some(entry=>entry.status==='UNASSESSED')?'UNASSESSED':entries.length?'PASS':'NOT_APPLICABLE',entries};
  const issues=[];
  chains.forEach((length,index)=>{if(length!==null&&length>30000)issues.push({key:`distance/${installs[index].order.id}/${installs[index+1].order.id}`,excess:length-30000,message:'Przekroczono 30 km drogami między instalacjami (łącznie z pomiarami).'});});
  if(measurementExtra.status==='LIMIT')issues.push({key:'measurement-extra',excess:measurementExtra.extraM-10000,message:'Przekroczono wspólny limit +10 km dla pomiarów.'});
  for(const entry of entries)if(entry.status==='LIMIT')issues.push({key:`window/${entry.orderId}`,excess:entry.serviceS+(entry.travelS??0)-entry.windowS,message:'Szacowany dojazd i testowy czas pracy przekraczają przydzielone okno.'});
  const violations=[...new Set(issues.map(issue=>issue.message))];
  return {orders:orders.map(order=>order.id),legs,distanceM,estimatedDurationS,installationDistance,measurementExtra,windows,issues,violations,missingRoads:legs.some(leg=>leg.status!=='OK'),hasMeasurements};
}
