from pathlib import Path
import json,hashlib,sys,re,datetime
p=Path(sys.argv[1]);d=json.loads(p.read_text());pattern='guest identities|forged and other-owner tokens|one completion|next-day streak';rx=re.compile(pattern)
rows=[a for suite in d['testResults'] for a in suite['assertionResults']]
selected=[];unselected=[]
for a in rows:
 name=a.get('fullName')or' '.join([*a.get('ancestorTitles',[]),a.get('title','')]);status=a['status'];row={'name':name,'status':status}
 if rx.search(name):selected.append(row)
 else:unselected.append({**row,'reason':'Not selected by this explicit targeted -t filter; not a declaration of skipped-zero or full-suite execution.'})
out={'sourceSHA':sys.argv[2],'executionPath':str(Path.cwd()),'sourceReportSHA256':hashlib.sha256(p.read_bytes()).hexdigest(),'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'filter':pattern,'selected':selected,'skipped':unselected,'scope':'Actual clock/claim/streak selected handler tests only; parent full-unit invocation separate. All unselected names and targeted-filter reasons exported.','counts':{'passed':sum(x['status']=='passed'for x in selected),'failed':sum(x['status']=='failed'for x in selected),'skipped':len(unselected),'total':len(rows)}}
(p.parent/'daily-clock-scope.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out['counts']))
