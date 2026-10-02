import collections
import datetime
import hashlib
import json
import pathlib
import re
import subprocess

ROOT = pathlib.Path('/private/tmp/eraclash-run3-final-20261002')
OWN = ROOT / 'data/validation/loop-foundation/browser-audit/run3-independent-dc926ad'
CRAWL = ROOT / 'data/validation/loop-foundation/browser-audit/run3-independent-dc926ad-fullcrawl'
PREP = pathlib.Path('/private/tmp/eraclash-run3-independent-final-preparation')
SHA = 'dc926adaeebd573f435263265f4251f1814cc0a5'

def read(p):
    return json.loads(p.read_text())

def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def write(p, value):
    p.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')

def counted(rows, field='status'):
    return dict(collections.Counter(x.get(field, 'MISSING') for x in rows))

crawl = read(CRAWL / 'report.json')
assert crawl.get('endedAt'), 'Full crawl has not closed'
assert crawl.get('sourceStability', {}).get('status') == 'PASS', 'Source/build stability unavailable'
assert crawl.get('checkoutSha') == SHA
assert len(crawl.get('routes', [])) == 2435
assert len(crawl.get('inventory', {}).get('routes', [])) == 487
native = read(OWN / 'native-and-naming-reverify/report.json')
guests = read(OWN / 'all-mode-guest-rematches-reverify/report.json')
lh = read(OWN / 'lighthouse-literal-acceptance.json')
normal_share_path = ROOT / 'data/validation/loop-foundation/sharing/run3-independent-dc926ad/report.json'
neutral_share_path = ROOT / 'data/validation/loop-foundation/sharing/run3-independent-dc926ad-neutral-on/report.json'
normal_share = read(normal_share_path)
neutral_share = read(neutral_share_path)
interactions = [dict(x, route=r['path'], profile=r['profile']) for r in crawl['routes'] for x in r.get('interactions', [])]
failed_routes = [dict(path=r['path'], profile=r['profile'], rawStatus=r['status'], issues=r['issues'], artifact=r['artifact']) for r in crawl['routes'] if r['status'] == 'FAIL']
control_reasons = collections.Counter(x.get('reason', 'No reason supplied') for x in interactions if x.get('status') in ['UNVERIFIED', 'N/A'])

annotations = {
    'recordedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'sourceSHA': SHA,
    'sourceOnlyCorrections': [
        {'artifact': 'source-contract-current.json', 'rawCollectorValue': 'Private Rooms versionLine MISSING', 'interpretation': 'The version is present in the first heading: # Private rooms contract1.0.0. The collector only matched a Version: line. This is a collector limitation, not a missing source contract.', 'source': 'docs/private-rooms/contract.md:1'},
        {'artifact': 'lighthouse-source-diagnostics.json', 'interpretation': 'The actual lobby source location is src/components/lobby/PlayLobby.jsx; the exploratory parent-directory path in the diagnostic is superseded by this verified location.', 'source': 'src/components/lobby/PlayLobby.jsx'}
    ],
    'rawCollectorFailuresPreserved': [
        'Initial native naming HTML compared raw escaped apostrophes; decoded fresh reverify retains the original output.',
        'Initial clipboard assertions ran before the real asynchronous action completed; fresh reverify waits for the product state and reads the actual clipboard.',
        'Initial event observer missed delayed native beacons; reverify records unchanged serialized envelopes before the native transport.',
        'Initial Lab GET used resultId instead of source-required id; corrected GET preserves actual id/mode/scores while removing seed/session/scenario.',
        'The extra fingerprint exclusion expectation was unsupported for full game GET; source tests preserve candidate/fingerprint there. Public recap allowlisting is checked separately.'
    ]
}
write(OWN / 'source-and-collector-annotations.json', annotations)

report = {
    'recordedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'phase': 'OWN_OBSERVATIONS_FROZEN_BEFORE_ANY_RUN2_OR_LEDGER_COMPARISON',
    'independence': 'No Run2 report/result/ledger outcome/release summary was read. Current source/tests/contracts and own fresh execution evidence only. Detailed current root/parent reports are deferred until after this marker.',
    'sourceSHA': SHA,
    'normalOrigin': 'http://localhost:4320',
    'neutralOrigin': 'http://localhost:4333',
    'environment': 'Local normal production client, actual API handlers and isolated memory stores; neutral ON uses a separately archived byte-equal source/build/server. No hosted runtime, provider account, SMTP, durable vendor or physical device acceptance.',
    'actualInventory': {'routes': len(crawl['inventory']['routes']), 'routeProfileChecks': len(crawl['routes']), 'profiles': crawl['profiles'], 'kindCounts': dict(collections.Counter(r['kind'] for r in crawl['inventory']['routes'])), 'preflightCountIsHistorical': True},
    'fullCrawl': {'rawStatus': crawl['status'], 'summary': crawl['summary'], 'routeStatuses': counted(crawl['routes']), 'routesByProfile': dict(collections.Counter(r['profile'] for r in crawl['routes'])), 'sourceStability': crawl['sourceStability'], 'rawReport': str(CRAWL / 'report.json'), 'rawSHA256': digest(CRAWL / 'report.json')},
    'failedRoutes': failed_routes,
    'links': {'statuses': counted(crawl.get('links', [])), 'total': len(crawl.get('links', [])), 'external': sum(not x.get('internal', False) for x in crawl.get('links', [])), 'nonpass': [x for x in crawl.get('links', []) if x.get('status') != 'PASS'], 'method': 'Exact discovered URL HEAD with redirects; protection, unsupported HEAD and bounded network failure remain UNVERIFIED. No external cap reached.'},
    'controls': {'statuses': counted(interactions), 'total': len(interactions), 'remainingReasons': dict(control_reasons), 'coverage': 'Reversible initial-state control probes plus separately recorded ten actual guest rematch journeys and mobile native tap trails. Stateful probes are not upgraded en masse from visibility or route loads.'},
    'axe': {'criticalInitial': crawl['summary']['criticalAxe'], 'criticalAfterControl': crawl['summary']['criticalAxeAfterInteraction'], 'seriousInitial': crawl['summary']['seriousAxe'], 'seriousAfterControl': crawl['summary']['seriousAxeAfterInteraction'], 'interpretation': 'Zero-critical user criterion is distinct from stricter serious warnings. Some target-size warnings follow summary-triggered scrolling that partially clips an input under the fixed header. Bounded rechecks retain warning states and the separately clear scroll-top state. This is not a full accessibility or physical-device claim.', 'boundedRecheck': 'axe-scroll-recheck/report.json'},
    'social': {'statuses': counted(crawl.get('social', [])), 'rows': crawl.get('social', []), 'sitemap': crawl.get('servedSitemap'), 'notFound': crawl.get('notFound')},
    'sharing': {'normalReport': str(normal_share_path), 'neutralReport': str(neutral_share_path), 'normalChecks': len(normal_share['checks']), 'normalPassedChecks': sum(bool(x['pass']) for x in normal_share['checks']), 'neutralChecks': len(neutral_share['checks']), 'neutralPassedChecks': sum(bool(x['pass']) for x in neutral_share['checks']), 'normalStatus': 'PASS' if normal_share['pass'] else 'FAIL', 'neutralStatus': 'PASS' if neutral_share['pass'] else 'FAIL', 'normalIdentity': normal_share['identity'], 'neutralIdentity': neutral_share['identity'], 'normalSamples': len(normal_share['samples']), 'neutralSamples': len(neutral_share['samples']), 'scope': 'Ten actual-handler samples per flag, three crawler user agents and PNG/recap/private projection checks; positive actual headline/scope/scores and all ten names verified in own native/naming replay. Separate random ON/OFF game scores are not paired comparisons.'},
    'nativeNaming': {'counts': native['counts'], 'sourceAttribution': 'neutral-source-attribution.json', 'native': native['native'], 'crawlerChecks': len(native.get('crawler', [])), 'namingChecks': len(native.get('naming', [])), 'report': 'native-and-naming-reverify/report.json'},
    'guestRematches': {'counts': guests['counts'], 'journeys': len(guests.get('journeys', [])), 'report': 'all-mode-guest-rematches-reverify/report.json', 'scope': 'Ten source-mode public cards each followed by an actual new guest Any Five casual game and new public card, opponent inputs and positive actual scores/names preserved. iPhone14 Chromium emulation. This does not replay original-mode rule sets.'},
    'events': {'report': 'actual-guest-event-cohort.json', 'scope': 'Seven of ten required event names observed in own ten-guest cohort and accepted by local HTTP204 sink; signup and Daily event coverage is delegated current-run scope. Day2/day7 retention is censored/null.'},
    'lighthouse': lh,
    'security': {'report': 'readonly-security-interpretation.json', 'scope': '43 served text assets byte-equal to the frozen build with bounded secret-pattern scan, seven served security-header targets, cookie-free actual Lab full game GET privacy. No real provider RLS or production/Preview account isolation acceptance.'},
    'sourceDoD': {'report': 'source-contract-current.json', 'annotations': 'source-and-collector-annotations.json', 'failedCriteria': [
        {'status': 'FAIL', 'criterion': 'C.7 every mode within two mobile home taps', 'targets': ['/clash/one-franchise', '/clash/one-per-era', '/clash/no-mvps'], 'repro': 'Home All modes -> hub Open Constraint filters -> Play variant. Three actual taps, all three variants on each of four mobile profiles (12 trails).', 'source': 'src/loop/modes/LoopModes.jsx:40'},
        {'status': 'FAIL', 'criterion': '44px minimum activation height', 'target': 'Selected legacy coach Change coach', 'repro': 'Native Edit coaches -> selected Change coach. Eight measured controls across four profiles are 42px high; all native taps open the actual coach dialog.', 'source': 'src/components/CoachPick.jsx'},
        {'status': 'FAIL', 'criterion': 'Lighthouse mobile LCP <=2500ms', 'targets': ['home', 'Daily', 'modes hub'], 'repro': 'Quiet five-page Lighthouse with one bounded fresh-Chrome home retry. Valid LCPs 3306.9804, 3329.5477, 3304.062ms; result1121.67415 and programmatic1053.4365ms pass. Raw initial home NO_NAVSTART is infrastructure UNVERIFIED.'}
    ], 'allModeProofStatus': 'Own source presence and selected actual journeys only. Complete current-run source DoD/test/mode proof from root and parent must be separately attributed after this freeze; real authenticated provider cells remain UNVERIFIED.'},
    'explicitSkippedScope': [
        'Protected hosted runtime is HTTP401 without bypass credentials; no hosted acceptance.',
        'Two actual provider Preview accounts, real email/password-reset receipt, live RLS and native production-account isolation.',
        'Physical iOS Safari/Android Chrome, real OS soft keyboard/share sheet, rotation/safe-area/text-zoom behavior.',
        'Owner-only development theme surface enablement; public fallback is not private feature acceptance.',
        'Every dynamic saved/account/challenge/invitation state on all five profiles; initial all-route inventory uses 11 actual fresh public cards. Later new guest cards are exercised on iPhone14 separately.',
        'Durable external analytics/vendor receipt and completed day2/day7 return windows.',
        'Manual screen-reader/full accessibility conformance and every combinatorial control state.',
        'Independent root fullsuites, boundary/synthetic metrics and parent complete mode/account journeys are not observations by this runner and are deferred to attributed current-run reconciliation.'
    ],
    'productEdits': [],
    'parentReportsReadBeforeFreeze': False,
    'priorRunResultsReadBeforeFreeze': False
}
write(OWN / 'blind-findings.json', report)

lines = ['# Independent Basketball Run3 observations', '', 'Own observations are frozen before any Run2 result or ledger comparison. Source `' + SHA + '`; local production client and actual memory-store handlers, Chromium emulation.', '', f"The full initial route inventory has {len(crawl['inventory']['routes'])} routes and {len(crawl['routes'])} route/profile checks. Raw crawl status: {crawl['status']}. Source/build/fixture stability: {crawl['sourceStability']['status']}.", '', 'Three definite acceptance failures were reproduced: three constraint variants take three mobile home taps; selected Change coach controls are 42px high; valid quiet mobile Lighthouse home/Daily/hub LCP is about 3.3 seconds against the 2.5 second limit.', '', 'Detailed route, link, control, axe, social/404 classifications, collector corrections, actual guest events and explicit skipped scope are recorded in `blind-findings.json`. Raw FAIL/UNVERIFIED output is preserved; collector corrections are additive and bounded fresh replays remain separately attributable.', '', 'No product edits. No hosted/provider/physical-device acceptance. No release-readiness verdict.', '']
(OWN / 'blind-findings.md').write_text('\n'.join(lines))

paths = []
for directory in [OWN, CRAWL, normal_share_path.parent, neutral_share_path.parent, PREP]:
    for p in directory.rglob('*'):
        if not p.is_file() or p.name == 'blind-final-manifest.json':
            continue
        if p.is_relative_to(OWN / 'legacy-heading-journeys'):
            continue  # Root execution; defer consumption/attribution until this own freeze.
        paths.append(p)
for p in [ROOT / 'scripts/loop/fullBrowserAudit.mjs', ROOT / 'scripts/loop-sharing-audit.mjs', ROOT / 'scripts/loop/verifyLogoDeliveryBrowserPNG.mjs', ROOT / 'dist/index.html', ROOT / 'dist/sitemap.xml']:
    paths.append(p)
paths = sorted(set(paths))
manifest = {
    'frozenAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'phase': report['phase'],
    'sourceSHA': SHA,
    'checkoutSHAReadSeparately': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
    'distBuildStampReadSeparately': re.search(r'name="eraclash-build" content="([^"]+)"', (ROOT / 'dist/index.html').read_text()).group(1),
    'runtimeIdentity': crawl.get('health'),
    'runtimeSHAAttribution': 'Source/process attribution from root launch attestation and independent checkout/build/served stamp checks. Health has no independent runtime Git SHA field; supplied SHA is not treated as server-reported code identity.',
    'runnerSHA256': digest(pathlib.Path(__file__)),
    'ownFindingsSHA256': digest(OWN / 'blind-findings.json'),
    'fileCount': len(paths),
    'files': [{'path': str(p), 'bytes': p.stat().st_size, 'sha256': digest(p)} for p in paths],
    'excludedUntilAfterFreeze': ['Root-owned legacy-heading-journeys content', 'Root/parent detailed current-run reports', 'All Run2 result/report/ledger outcome content'],
    'priorRunResultsRead': False,
    'parentDetailedReportsRead': False
}
write(OWN / 'blind-final-manifest.json', manifest)
print(json.dumps({'frozenAt': manifest['frozenAt'], 'manifest': str(OWN / 'blind-final-manifest.json'), 'manifestSHA256': digest(OWN / 'blind-final-manifest.json'), 'ownFindingsSHA256': manifest['ownFindingsSHA256'], 'files': len(paths), 'summary': crawl['summary'], 'routeStatuses': report['fullCrawl']['routeStatuses'], 'links': report['links']['statuses'], 'controls': report['controls']['statuses']}, ensure_ascii=False))
