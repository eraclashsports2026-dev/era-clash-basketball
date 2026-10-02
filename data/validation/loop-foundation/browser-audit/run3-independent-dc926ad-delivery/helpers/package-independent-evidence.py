import datetime
import gzip
import hashlib
import json
import pathlib
import shutil
import tarfile

ROOT = pathlib.Path('/private/tmp/eraclash-run3-final-20261002')
PREP = pathlib.Path('/private/tmp/eraclash-run3-independent-final-preparation')
OWN = ROOT / 'data/validation/loop-foundation/browser-audit/run3-independent-dc926ad'
OUT = ROOT / 'data/validation/loop-foundation/browser-audit/run3-independent-dc926ad-delivery'
OUT.mkdir(exist_ok=True)
MANIFEST = OWN / 'blind-final-manifest.json'
manifest = json.loads(MANIFEST.read_text())

def sha_file(p):
    h = hashlib.sha256()
    with p.open('rb') as f:
        while True:
            data = f.read(1024 * 1024)
            if not data:
                return h.hexdigest()
            h.update(data)

def arcname(p):
    if p.is_relative_to(ROOT):
        return 'checkout/' + str(p.relative_to(ROOT))
    if p.is_relative_to(PREP):
        return 'preparation/' + str(p.relative_to(PREP))
    raise ValueError('Unexpected evidence location: ' + str(p))

paths = [pathlib.Path(row['path']) for row in manifest['files']] + [MANIFEST]
for row in manifest['files']:
    assert sha_file(pathlib.Path(row['path'])) == row['sha256'], row['path']
tar_path = pathlib.Path('/private/tmp/eraclash-run3-independent-dc926ad-evidence.tar')
gzip_path = tar_path.with_suffix('.tar.gz')
with tarfile.open(tar_path, 'w', format=tarfile.PAX_FORMAT) as archive:
    for p in sorted(set(paths)):
        archive.add(p, arcname=arcname(p), recursive=False)
tar_sha = sha_file(tar_path)
with tar_path.open('rb') as source, gzip.GzipFile(filename=str(gzip_path), mode='wb', compresslevel=6, mtime=0) as dest:
    shutil.copyfileobj(source, dest, 1024 * 1024)
h = hashlib.sha256()
with gzip.open(gzip_path, 'rb') as stream:
    while True:
        block = stream.read(1024 * 1024)
        if not block:
            break
        h.update(block)
assert h.hexdigest() == tar_sha, 'gzip round-trip tar digest changed'
verified = 0
with tarfile.open(gzip_path, 'r:gz') as archive:
    for row in manifest['files']:
        stream = archive.extractfile(arcname(pathlib.Path(row['path'])))
        assert stream is not None
        payload = stream.read()
        assert len(payload) == row['bytes']
        assert hashlib.sha256(payload).hexdigest() == row['sha256'], row['path']
        verified += 1
    assert hashlib.sha256(archive.extractfile(arcname(MANIFEST)).read()).hexdigest() == sha_file(MANIFEST)
report = {'recordedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'status': 'PASS', 'sourceSHA': manifest['sourceSHA'], 'archive': str(gzip_path), 'compressedBytes': gzip_path.stat().st_size, 'compressedSHA256': sha_file(gzip_path), 'uncompressedTarBytes': tar_path.stat().st_size, 'uncompressedTarSHA256': tar_sha, 'gzipRoundTripSHA256': h.hexdigest(), 'manifest': str(MANIFEST), 'manifestSHA256': sha_file(MANIFEST), 'filePayloadsVerified': verified, 'manifestPayloadVerified': True, 'scope': 'Exact frozen own evidence files and runners/build anchors. Root/parent and historical Run2 outcome reports are separate attributed evidence, not observations by this runner.', 'extraction': 'tar -xzf /private/tmp/eraclash-run3-independent-dc926ad-evidence.tar.gz; files have checkout/ and preparation/ prefixes.'}
(OUT / 'archive-roundtrip.json').write_text(json.dumps(report, indent=2) + '\n')
tar_path.unlink()
print(json.dumps(report))
