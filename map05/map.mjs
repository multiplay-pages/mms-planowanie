// Public basemap geometry and synthetic job markers use the same Web Mercator
// projection. This module does not infer connectivity or calculate any route.
function worldPoint(coordinates) {
  if(!Array.isArray(coordinates)||coordinates.length!==2||!coordinates.every(Number.isFinite)||Math.abs(coordinates[0])>180||Math.abs(coordinates[1])>85.05112878) return null;
  const [longitude,latitude]=coordinates, radians=latitude*Math.PI/180;
  return [(longitude+180)/360,(1-Math.log(Math.tan(radians)+1/Math.cos(radians))/Math.PI)/2];
}

export function createMapFrame(points,width=680,height=420) {
  const projected=points.map(worldPoint).filter(Boolean);
  if(!projected.length) throw new Error('Brak punktu odniesienia mapy.');
  const xs=projected.map(p=>p[0]),ys=projected.map(p=>p[1]);
  const west=Math.min(...xs),east=Math.max(...xs),north=Math.min(...ys),south=Math.max(...ys);
  const spanX=Math.max(east-west,.00005),spanY=Math.max(south-north,.00005);
  return {width,height,centerX:(west+east)/2,centerY:(north+south)/2,scale:Math.min((width-64)/spanX,(height-64)/spanY)};
}

export function projectMapPoint(coordinates,frame) {
  const world=worldPoint(coordinates);
  return world?[(world[0]-frame.centerX)*frame.scale+frame.width/2,(world[1]-frame.centerY)*frame.scale+frame.height/2]:null;
}

export function mapGeometryPath(points,frame,precision=1) {
  let started=false;
  return points.map(point=>{
    const xy=projectMapPoint(point,frame);
    if(!xy){started=false;return '';}
    const command=started?'L':'M';started=true;
    return `${command}${xy[0].toFixed(precision)},${xy[1].toFixed(precision)}`;
  }).filter(Boolean).join(' ');
}
