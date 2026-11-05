"""Build a portable, ODbL-attributed facility snapshot from the South Korea OSM extract.

Usage: python scripts/build_facilities.py korea.osm.pbf data/facilities.json
This uses real OpenStreetMap objects only; construction tags are not proof of active works.
"""
import datetime
import json
import math
import pathlib
import sys
import osmium

LABELS={"construction", "industrial", "quarry"}


def category(tags):
    if any(tags.get(k)=="construction" for k in ("landuse", "building", "highway")):
        return "construction"
    if tags.get("landuse")=="quarry":
        return "quarry"
    if tags.get("landuse")=="industrial":
        return "industrial"
    return None


def valid(lat,lon):
    return math.isfinite(lat) and math.isfinite(lon) and 33<=lat<=39 and 124.5<=lon<=132


class FacilityHandler(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.features=[]

    def add(self, item, lat, lon, osm_type):
        tags=item.tags
        cat=category(tags)
        if not cat or not valid(lat,lon):
            return
        selected={k:str(tags.get(k)) for k in
                  ("name","name:ko","operator","addr:city","addr:street","addr:housenumber","construction","description")
                  if tags.get(k)}
        name=selected.get("name:ko") or selected.get("name") or {"construction":"공사 관련 구역 (이름 미등록)","industrial":"산업시설 (이름 미등록)","quarry":"채석장 (이름 미등록)"}[cat]
        self.features.append({"id":f"{osm_type}-{item.id}","lat":round(lat,6),"lon":round(lon,6),
                              "cat":cat,"name":name[:110],"tags":selected})

    def node(self,n):
        cat=category(n.tags)
        if cat and n.location.valid():
            self.add(n,n.location.lat,n.location.lon,"node")

    def way(self,w):
        if not category(w.tags):
            return
        pts=[(n.lat,n.lon) for n in w.nodes if n.location.valid()]
        if not pts:
            return
        # Approximate centroid of mapped way nodes; exact site boundaries aren't claimed.
        lat=sum(p[0] for p in pts)/len(pts)
        lon=sum(p[1] for p in pts)/len(pts)
        self.add(w,lat,lon,"way")


def main(source,target):
    handler=FacilityHandler()
    handler.apply_file(source,locations=True,idx='flex_mem')
    seen=set();features=[]
    for f in handler.features:
        if f['id'] not in seen:
            seen.add(f['id']);features.append(f)
    features.sort(key=lambda f:(f['cat'],f['id']))
    data={"status":"ready","generated_at":datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
          "source":"OpenStreetMap via Geofabrik South Korea extract", "license":"ODbL 1.0", 
          "note":"OSM 등록 표기. 실제 공사 중이나 공기오염 발생 여부를 증명하지 않음.",
          "features":features}
    pathlib.Path(target).parent.mkdir(parents=True,exist_ok=True)
    pathlib.Path(target).write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print('Saved',len(features),'OSM facility objects in',target)


if __name__=='__main__':
    if len(sys.argv)!=3:
        raise SystemExit('Usage: build_facilities.py INPUT.osm.pbf OUTPUT.json')
    main(sys.argv[1],sys.argv[2])
