import xml.etree.ElementTree as ET, json
root=ET.parse('/tmp/wicker-park.osm').getroot()
nodes={int(n.attrib['id']):{'type':'node','id':int(n.attrib['id']),'lat':float(n.attrib['lat']),'lon':float(n.attrib['lon']),'tags':{t.attrib['k']:t.attrib['v'] for t in n.findall('tag')}} for n in root.findall('node')}
ways=[]; used=set()
for w in root.findall('way'):
 t={t.attrib['k']:t.attrib['v'] for t in w.findall('tag')}
 green=t.get('leisure') in ['park','garden','recreation_ground'] or t.get('landuse') in ['grass','forest','meadow','recreation_ground','village_green']
 if 'building' not in t and not green and t.get('highway') not in ['primary','secondary','tertiary','residential','unclassified','living_street','primary_link','secondary_link','tertiary_link']: continue
 ids=[int(n.attrib['ref']) for n in w.findall('nd')]
 ways.append({'type':'way','id':int(w.attrib['id']),'nodes':ids,'tags':t});used.update(ids)
selected=[n for i,n in nodes.items() if i in used or n['tags'].get('shop') or n['tags'].get('amenity') or n['tags'].get('highway') in ['traffic_signals','stop','give_way']]
json.dump({'version':0.6,'source':'OpenStreetMap API 0.6','acquired':'2026-10-28','bounds':[41.9055,-87.683,41.914,-87.671],'elements':selected+ways},open('public/data/wicker-park.json','w'),separators=(',',':'))
print(len(selected),'nodes',len(ways),'ways')
