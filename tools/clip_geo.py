"""
clip_geo.py: crop Natural Earth country borders to the map window.

Input: ne_50m_admin_0_countries.geojson (Natural Earth, public domain).
Usage: python3 tools/clip_geo.py ne_50m_admin_0_countries.geojson data/region.geo.json
"""
import json,sys
src,out=sys.argv[1],sys.argv[2]
X0,X1,Y0,Y1=36,100,30,60
def clip(ring):
    def edge(pts,inside,inter):
        res=[]
        for i,p in enumerate(pts):
            q=pts[i-1]
            if inside(p):
                if not inside(q): res.append(inter(q,p))
                res.append(p)
            elif inside(q): res.append(inter(q,p))
        return res
    def ix(x): return lambda a,b:[x,a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0])]
    def iy(y): return lambda a,b:[a[0]+(b[0]-a[0])*(y-a[1])/(b[1]-a[1]),y]
    p=ring
    for ins,it in [(lambda p:p[0]>=X0,ix(X0)),(lambda p:p[0]<=X1,ix(X1)),(lambda p:p[1]>=Y0,iy(Y0)),(lambda p:p[1]<=Y1,iy(Y1))]:
        if not p: break
        p=edge(p,ins,it)
    out=[];
    for x,y in p:
        pt=[round(x,2),round(y,2)]
        if not out or out[-1]!=pt: out.append(pt)
    return out if len(out)>=4 else None
g=json.load(open(src));feats=[]
for f in g['features']:
    geom=f['geometry'];polys=geom['coordinates'] if geom['type']=='MultiPolygon' else [geom['coordinates']]
    newp=[]
    for poly in polys:
        rings=[clip(r) for r in poly]
        if rings[0]: newp.append([r for r in rings if r])
    if newp:
        name=f['properties'].get('NAME_EN') or f['properties']['NAME']
        feats.append({'type':'Feature','properties':{'name':name},'geometry':{'type':'MultiPolygon','coordinates':newp}})
json.dump({'type':'FeatureCollection','features':feats},open(out,'w'),separators=(',',':'))
print(len(feats),[f['properties']['name'] for f in feats])
