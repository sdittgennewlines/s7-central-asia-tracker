"""
build_incidents.py: rebuild data/incidents.json from the S7 + CAT Monitor sheet.

Input: the JSON returned by the Google Sheets API `spreadsheets.get` for the
range 'Incidents - Global'!A1:N2000, with
  fields = sheets.data.rowData.values(formattedValue,effectiveFormat.backgroundColor)
(cell colours are needed to drop rows highlighted red = broken link).

Usage:  python3 tools/build_incidents.py sheet_grid.json data/incidents.json

Cleaning applied (mirrors normalizeCsv in js/data.js):
  - skips blank rows and rows with any red-highlighted cell
  - normalises sector names (e.g. "FInance/Business" -> "Finance/Business"),
    splits multi-sector cells on commas
  - trims locations ("Kyrgyzstan " -> "Kyrgyzstan"); flags the five scored countries
  - severity: integer or null when blank
  - actors: the Russia / China / USA / S7 checkbox columns that are TRUE
"""
import json,sys,re,datetime,collections
src,out=sys.argv[1],sys.argv[2]
d=json.load(open(src))
rows=d['sheets'][0]['data'][0]['rowData']
TYPES={'energy':'Energy','water':'Water','education/culture':'Education/Culture','ai':'AI','transportation':'Transportation','agro and industrial':'Agro and Industrial','finance/business':'Finance/Business','defense':'Defense'}
SCORED={'Kazakhstan','Kyrgyzstan','Tajikistan','Turkmenistan','Uzbekistan'}
def val(c): return (c.get('formattedValue') or '').strip()
def red(c):
    b=c.get('effectiveFormat',{}).get('backgroundColor',{})
    return b.get('red',0)>0.9 and b.get('green',0)<0.2 and b.get('blue',0)<0.2
inc=[];skipped=collections.Counter();unknown=collections.Counter()
for i,r in enumerate(rows[1:],start=2):
    v=r.get('values',[])+[{}]*14
    if not val(v[0]): continue
    if any(red(c) for c in v[:14]): skipped['broken_link']+=1; continue
    try: dt=datetime.datetime.strptime(val(v[0]),'%m/%d/%Y').date()
    except ValueError: skipped['bad_date']+=1; continue
    types=[]
    for t in val(v[1]).split(','):
        k=t.strip().lower()
        if not k: continue
        if k in TYPES: types.append(TYPES[k])
        else: unknown[t.strip()]+=1
    sev=val(v[2]); sev=int(sev) if sev.isdigit() else None
    loc=re.sub(r'\s+',' ',val(v[4]))
    try: lat,lng=float(val(v[5])),float(val(v[6]))
    except ValueError: lat=lng=None
    actors=[a for a,c in zip(['Russia','China','USA','S7'],v[7:11]) if val(c).upper()=='TRUE']
    link=val(v[13])
    inc.append(dict(row=i,date=dt.isoformat(),types=types,severity=sev,location=loc,scored=loc in SCORED,
        lat=lat,lng=lng,actors=actors,title=re.sub(r'\s+',' ',val(v[11])),description=re.sub(r'\s+',' ',val(v[12])),link=link))
json.dump(dict(generated=datetime.date.today().isoformat(),incidents=inc),open(out,'w'),ensure_ascii=False)
print(len(inc),'incidents', dict(skipped), 'unknown types',dict(unknown))
print('no type',sum(not x['types'] for x in inc),'no sev',sum(x['severity'] is None for x in inc),'sev0',sum(x['severity']==0 for x in inc),'no actor',sum(not x['actors'] for x in inc),'no coords',sum(x['lat'] is None for x in inc))
print(collections.Counter(x['location'] for x in inc if not x['scored']))
print([ (x['location'],x['lat'],x['lng']) for x in inc if not x['scored']][:40])
