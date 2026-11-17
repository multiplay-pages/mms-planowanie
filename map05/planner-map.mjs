import {projectMapPoint,mapGeometryPath} from './map.mjs';
import {decodeRoadPolyline} from './routes.mjs';
const mapRoadRank=category=>({motorway:0,motorway_link:0,trunk:1,trunk_link:1,primary:2,primary_link:2,secondary:3,secondary_link:3,tertiary:4,tertiary_link:4,residential:5,unclassified:5,living_street:6,service:6,pedestrian:6,track:7})[category]??7;

export function prepareMapFeatures(map,frame) {
  if(map?.encoding==='polyline5-indexed')return map.features.map(([id,category,name,encoded,bounds])=>{
    const a=projectMapPoint([bounds[0],bounds[3]],frame),b=projectMapPoint([bounds[2],bounds[1]],frame);
    const feature={id,kind:'road',category:map.categories[category],name:map.names[name],encoded};
    return {feature,bounds:[a[0],a[1],b[0],b[1]],rank:mapRoadRank(feature.category),path:null};
  });
  return (map?.features??[]).filter(feature=>Array.isArray(feature.points)&&feature.points.length>=2).map(feature=>{
    let west=Infinity,south=Infinity,east=-Infinity,north=-Infinity;
    for(const point of feature.points){west=Math.min(west,point[0]);east=Math.max(east,point[0]);south=Math.min(south,point[1]);north=Math.max(north,point[1]);}
    const a=projectMapPoint([west,north],frame),b=projectMapPoint([east,south],frame);
    return {feature,bounds:[a[0],a[1],b[0],b[1]],rank:mapRoadRank(feature.category),path:null};
  });
}

export function visibleMapFeatures(prepared,viewport,limit=1600) {
  const [x,y,width,height]=viewport,zoom=680/width,maxRank=zoom<4?3:zoom<12?4:zoom<35?5:7;
  const visible=prepared.filter(item=>item.bounds[0]<=x+width&&item.bounds[2]>=x&&item.bounds[1]<=y+height&&item.bounds[3]>=y&&(item.feature.kind!=='road'||item.rank<=maxRank));
  if(visible.length<=limit)return visible;
  // Over the limit, pieces shorter than about one screen pixel only draw specks. Keep the
  // longest roads of the most important classes so the network stays readable.
  const unit=width/680,size=item=>Math.max(item.bounds[2]-item.bounds[0],item.bounds[3]-item.bounds[1]);
  const legible=visible.filter(item=>size(item)>=unit);
  return (legible.length?legible:visible).sort((a,b)=>a.rank-b.rank||size(b)-size(a)).slice(0,limit);
}

export function mapFeaturePath(item,frame) {
  if(!item.feature.points)item.feature.points=decodeRoadPolyline(item.feature.encoded);
  item.path??=mapGeometryPath(item.feature.points,frame,4)+(item.feature.category==='area'?' Z':'');
  return item.path;
}
