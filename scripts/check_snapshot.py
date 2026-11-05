import json,sys
from pathlib import Path
obj=json.loads(Path(sys.argv[1]).read_text())
assert obj.get('status')=='ready'
features=obj.get('features',[])
assert len(features)>50, f'Only {len(features)} mapped facilities: refuse to publish broken snapshot'
assert all(x.get('cat') in ('construction','industrial','quarry') and x.get('id') for x in features)
print('Verified OSM facilities:',len(features))
