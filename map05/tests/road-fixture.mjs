// Controlled SYNTHETIC network for UI tests only, never shipped with the app.
// Each point connects to a common hub; literal costs exercise planner rules.
export function roadFixture(scenario) {
  const points=scenario.addresses.filter(a=>a.coordinates),hub=[18,50.7];
  const encode=coordinates=>{
    let previous=[0,0],result='';
    for(const point of coordinates)for(const [axis,value] of [point[1],point[0]].entries()) {
      const current=Math.round(value*1e5),delta=current-previous[axis];previous[axis]=current;
      let encoded=delta<0?~(delta<<1):delta<<1;
      while(encoded>=32){result+=String.fromCharCode((32|(encoded&31))+63);encoded>>>=5;}
      result+=String.fromCharCode(encoded+63);
    }
    return result;
  };
  return {schemaVersion:1,datasetId:scenario.datasetId,source:{provider:'LOCAL_OSM',profile:'shortest-distance',roadsSha256:'b'.repeat(64),engineSha256:'c'.repeat(64),testFixture:true},
    points:points.map(a=>({addressId:a.id,coordinates:a.coordinates,snap:{status:'OK',distanceM:0,coordinates:a.coordinates}})),
    segments:points.map(a=>encode([hub,a.coordinates])),
    routes:Object.fromEntries(points.map((from,i)=>[from.id,Object.fromEntries(points.map((to,j)=>[to.id,{status:'OK',distanceM:i===j?0:1000,estimatedDurationS:i===j?0:60,path:i===j?[]:[-(i+1),j+1]}]))]))};
}
