import datetime,hashlib,json,pathlib,shutil
SRC=pathlib.Path('/private/tmp/eraclash-run3-final-20261002')
DST=pathlib.Path('/Users/josephjohnson/Desktop/EraClash/EraClash Basketball/current')
BASE=pathlib.Path('data/validation/loop-foundation')
OWN=SRC/BASE/'browser-audit/run3-independent-dc926ad'
CRAWL=SRC/BASE/'browser-audit/run3-independent-dc926ad-fullcrawl'
DELIVERY=SRC/BASE/'browser-audit/run3-independent-dc926ad-delivery'
RECON=SRC/BASE/'browser-audit/run3-independent-dc926ad-reconciliation'
PREP=pathlib.Path('/private/tmp/eraclash-run3-independent-final-preparation')
manifest=json.loads((OWN/'blind-final-manifest.json').read_text())
report=json.loads((CRAWL/'report.json').read_text())
mapping={}
def add(p,relative=None):
    relative=relative or p.relative_to(SRC)
    mapping[p]=DST/relative
for p in OWN.rglob('*'):
    if not p.is_file()or p.is_relative_to(OWN/'legacy-heading-journeys'):continue
    if p.suffix!='.png':add(p)
for p in [CRAWL/'inventory.json',DELIVERY/'archive-roundtrip.json',DELIVERY/'fullcrawl-report.json.gz',DELIVERY/'fullcrawl-gzip-roundtrip.json']:add(p)
for p in RECON.iterdir():
    if p.is_file():add(p)
for r in report['routes']:
    if r['status']in ['FAIL','PARTIAL']:add(CRAWL/r['artifact'])
keyshots=[
 'native-and-naming-reverify/iphone-se-coach.png','native-and-naming-reverify/iphone-14-coach.png','native-and-naming-reverify/iphone-pro-max-coach.png','native-and-naming-reverify/pixel-coach.png',
 'native-and-naming-reverify/iphone-se-constraint.png','native-and-naming-reverify/iphone-14-constraint.png','native-and-naming-reverify/iphone-pro-max-constraint.png','native-and-naming-reverify/pixel-constraint.png',
 'native-and-naming-reverify/guest-rematch-completed.png','axe-scroll-recheck/3-after-control.png','axe-scroll-recheck/1-after-control.png'
]
for rel in keyshots:
    p=OWN/rel
    if p.exists():add(p)
for rel in ['screenshots/iphone-se--.png','screenshots/desktop--.png','screenshots/iphone-14--play-best-of-7.png','screenshots/iphone-se--leaderboard.png']:
    p=CRAWL/rel
    if p.exists():add(p)
for directory in [SRC/BASE/'sharing/run3-independent-dc926ad',SRC/BASE/'sharing/run3-independent-dc926ad-neutral-on']:
    for p in directory.rglob('*'):
        if p.is_file():add(p)
for p in PREP.iterdir():
    if p.is_file():add(p,BASE/'browser-audit/run3-independent-dc926ad-delivery/helpers'/p.name)
for p in [pathlib.Path('/private/tmp/run3-reconcile-independent.py'),pathlib.Path(__file__)]:add(p,BASE/'browser-audit/run3-independent-dc926ad-delivery/helpers'/p.name)
rows=[]
for source,destination in sorted(mapping.items(),key=lambda x:str(x[1])):
    destination.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(source,destination)
    source_sha=hashlib.sha256(source.read_bytes()).hexdigest();dest_sha=hashlib.sha256(destination.read_bytes()).hexdigest()
    assert source_sha==dest_sha
    rows.append(dict(source=str(source),destination=str(destination),repositoryPath=str(destination.relative_to(DST)),bytes=source.stat().st_size,sha256=source_sha))
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
result={
 'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'PASS','sourceSHA':manifest['sourceSHA'],
 'ownBlindFreezeAt':manifest['frozenAt'],'ownBlindManifestSHA256':digest(OWN/'blind-final-manifest.json'),
 'scope':'Curated exact-byte copies for review/commit. Complete aggregate rawreport is losslessgzip; every original route/control/axe/link observation is present there. Bulk per-route duplicate files and most screenshots are local-archive-only, not silently claimed committed.',
 'files':rows,'copiedFiles':len(rows),'copiedBytes':sum(x['bytes']for x in rows),'largestFileBytes':max(x['bytes']for x in rows),
 'underGitHub100MBPerFile':all(x['bytes']<100_000_000 for x in rows),
 'completeOwnLocalArchive':json.loads((DELIVERY/'archive-roundtrip.json').read_text()),
 'completeOwnManifestFiles':manifest['fileCount'],'originalManifestFilesDirectlyIncludedInCuratedCopy':sum(pathlib.Path(x['path'])in mapping for x in manifest['files']),
 'keyScreenshotScope':keyshots,'missingRequestedKeyshots':[x for x in keyshots if not(OWN/x).exists()],
 'currentRootParentEvidence':'Already packaged separately in PRIMARY; not copied as observations by this runner.',
 'productSourceEdits':[]
}
dest=DST/BASE/'browser-audit/run3-independent-dc926ad-delivery/curated-copy-manifest.json';dest.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:result[k]for k in ['status','copiedFiles','copiedBytes','largestFileBytes','underGitHub100MBPerFile','missingRequestedKeyshots']}));print(str(dest));print(digest(dest))
