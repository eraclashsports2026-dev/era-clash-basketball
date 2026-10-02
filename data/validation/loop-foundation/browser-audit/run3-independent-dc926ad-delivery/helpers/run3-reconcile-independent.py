import collections, datetime, hashlib, json, pathlib, subprocess

SOURCE = pathlib.Path('/private/tmp/eraclash-run3-final-20261002')
PRIMARY = pathlib.Path('/Users/josephjohnson/Desktop/EraClash/EraClash Basketball/current')
BASE = pathlib.Path('data/validation/loop-foundation')
OWN = SOURCE / BASE / 'browser-audit/run3-independent-dc926ad'
OUT = SOURCE / BASE / 'browser-audit/run3-independent-dc926ad-reconciliation'
OUT.mkdir(exist_ok=True)
SHA = 'dc926adaeebd573f435263265f4251f1814cc0a5'

def read(p): return json.loads(p.read_text())
def h(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def write(name, value): (OUT/name).write_text(json.dumps(value, indent=2, ensure_ascii=False)+'\n')
def cell(status, evidence, note): return dict(status=status, evidence=evidence, note=note)

blind = read(OWN/'blind-findings.json')
freeze = read(OWN/'blind-final-manifest.json')
assert freeze['phase']=='OWN_OBSERVATIONS_FROZEN_BEFORE_ANY_RUN2_OR_LEDGER_COMPARISON'
crawl = read(SOURCE/BASE/'browser-audit/run3-independent-dc926ad-fullcrawl/report.json')
source_path = PRIMARY/BASE/'run3-source-readiness-dc926ad/modes-pages-dod-source-manifest.json'
source = read(source_path)
units_path = PRIMARY/BASE/'suites/run3-unit-final.json'
units = read(units_path)
unit_files = {pathlib.Path(r['name']).name:r['status'] for r in units['testResults']}
gate_path = PRIMARY/'data/validation/foundation/loop-run3-final-dc926ad.json'
gates = read(gate_path)
parent_path = PRIMARY/BASE/'stateful/run-3-final-dc926ada-cdp-replay/report.json'
parent = read(parent_path)
assert parent['sourceSHA']==SHA
assessment = PRIMARY/BASE/'stateful/run-3-final-dc926ada-assessment/mode-data-auth-assessment.md'
root_closure = PRIMARY/BASE/'suites/run3-baseline-closure.json'
root = read(root_closure)
events = [e for batch in parent['beacons'] for e in batch.get('events',[])]
closed_names = ['game_completed','card_created','card_shared','card_opened','rematch_started_from_card','guest_play_started','signup_completed','daily_attempted','daily_shared','mode_started']
closed_counts = {n:sum(e.get('event')==n for e in events) for n in closed_names}

warnings=[]
controls=[]
for r in crawl['routes']:
    for i in r.get('interactions',[]):
        if i.get('status')=='UNVERIFIED':
            row=dict(path=r['path'],profile=r['profile'],control=i.get('name'),tag=i.get('tag'),index=i.get('index'),rawStatus='UNVERIFIED',rawReason=i.get('reason'),attemptedRequests=i.get('attemptedWrites',[]))
            if i.get('reason','').startswith('No observable'):
                if i.get('name')=='EraClash Basketball home': group='Already on home'; ref='src/components/arena/ArenaHeader.jsx:162,206'
                elif 'ROSTERS' in i.get('name',''): group='Already-active ROSTERS stage'; ref='src/App.jsx:244,711;src/components/StageWizard.jsx:25'
                elif 'Manual Draft' in i.get('name',''): group='Already-selected Manual Draft with empty roster'; ref='src/App.jsx:320,1654'
                elif i.get('name')=='Difficulty Pro': group='Already-selected default Pro'; ref='src/v3/difficulty.js:60;src/App.jsx:1596'
                else: group='Already-selected mobile Gold tab'; ref='src/components/arena/ChaosStage.jsx:114,379'
                row.update(classification='SOURCE_EXPECTED_IDEMPOTENT_INITIAL_STATE',group=group,source=ref,acceptanceStatus='UNVERIFIED',note='Raw no-change is expected for this initial selection. This does not prove every transition or permit a zero-dead/every-control pass claim.')
            elif i.get('attemptedWrites'):
                profile_only=all(x['path']=='/api/profile' for x in i['attemptedWrites'])
                row.update(classification='READ_ONLY_GUARD_BLOCKED_PROVIDER_READ_OR_BACKGROUND' if profile_only else 'READ_ONLY_GUARD_BLOCKED_GAMEPLAY_REQUEST',acceptanceStatus='UNVERIFIED',note='POST is a transport classification; profile reads are not asserted to be writes. The guard also catches background requests unrelated to the clicked control. Fresh authorized mode proof is separate.')
            elif r['path']=='/dev/basketball-theme-lab': row.update(classification='OWNER_SURFACE_NOT_ENABLED',acceptanceStatus='PARTIAL_OWNER_SCOPE')
            else: row.update(classification='AUTHORIZED_STATEFUL_JOURNEY_REQUIRED',acceptanceStatus='PARTIAL_ATTRIBUTED_JOURNEY',note='Franchise/Daily/Spin/rooms have fresh supporting mode proof, but not this exact every-profile probe context.')
            controls.append(row)
        for v in (i.get('axe')or{}).get('violations',[]):
            if v.get('impact')=='serious': warnings.append(dict(path=r['path'],profile=r['profile'],control=i.get('name'),index=i.get('index'),rule=v['id'],rawStatus='FAIL',nodes=v['nodes'],allNodesPartiallyObscured=all('partially obscured' in n.get('failureSummary','') for n in v['nodes'])))
assert len(controls)==167 and len(warnings)==12
write('raw-failure-and-control-classification.json',{
 'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceSHA':SHA,'ownFreezeSHA256':h(OWN/'blind-final-manifest.json'),
 'rawRouteStatuses':blind['fullCrawl']['routeStatuses'],'routeFAILGroups':{'provider_disabled_leaderboard_503':5,'after_control_target_size_warning_rows':10},
 'routePARTIALGroups':{'owner_only_theme_lab_fallback':5},'zero5xxAcceptance':'FAIL;five leaderboard route/profile checks observe actual API503;configured hosted provider remainsUNVERIFIED',
 'warnings':warnings,'criticalInitial':0,'criticalAfterControls':0,'seriousInitial':0,'seriousAfterControls':12,
 'controlClassifications':dict(collections.Counter(r['classification'] for r in controls)),
 'sourceExpectedIdempotentGroups':dict(collections.Counter(r.get('group') for r in controls if r.get('group'))),
 'controls':controls,'disabledNA':100,'links':{'total':1407,'internal':1368,'external':39,'PASS':1407,'FAIL':0,'UNVERIFIED':0},
 'limits':'141,934 observations include140,120 LINK entries,not140,120nativeclicks.167rawUNVERIFIEDare retained.1,547reversible observationsPASS. No every-control completion or zero-dead-control assertion.'})

matrix=[]
loop_ids={'any-five','daily','franchise','tonight','spin','one-franchise','one-per-era','no-mvps','gauntlet','lab','rooms'}
legacy_ids={'legacy-chaos','legacy-dream','legacy-daily','legacy-bo7','legacy-win82','legacy-tournament'}
for m in source['modes']:
    mid=m['id']; route=m['route']; fields={}
    if mid in ['salary-cap','legacy-gauntlet']:
        why='Salary dataset unavailable; no fabricated play.' if mid=='salary-cap' else 'Planned public information is /modes/era-gauntlet. /play/era-gauntlet is an unrouted legacy gameplay address that falls through the existing Chaos path, not a second completed Gauntlet. Implemented new mode is /clash/gauntlet.'
        fields={k:cell('NOT_APPLICABLE_UNIMPLEMENTED',m['contract'],why) for k in source['definitionOfDoneFields']}
        matrix.append(dict(id=mid,name=m['name'],route=route,sourceClassification=m['classification'],fields=fields,fullAcceptance='UNIMPLEMENTED / DATA_BLOCKER',note=why));continue
    rows=[r for r in crawl['routes'] if r['path']==route]
    fields['route']=cell('PASS_LOCAL_INITIAL_ROUTE' if len(rows)==5 else 'PARTIAL', 'fullcrawl-report.json.gz',f'{len(rows)} actual initial route/profile checks. Stateful expected mode identity is separately attributed.')
    fields['versioned_contract']=cell('FAIL_STRICT_PATH_REQUIREMENT' if mid in legacy_ids else 'PASS_SOURCE',m['contract'],'Six inherited modes have governing source references but no standalone docs/<mode>/contract.md. No existing contract was rewritten.' if mid in legacy_ids else 'Versioned source contract present; source presence is not runtime behavior.')
    listed=[dict(file=f,status=unit_files.get(pathlib.Path(f).name,'UNMATCHED'))for f in m['unitTestSources']]
    fields['unit_tests']=cell('PASS_LISTED_SOURCE_FILES' if listed and all(x['status']=='passed' for x in listed) else 'PARTIAL',listed,'Matched to actual full100-file Run3 output. Overall full suite remains97/100filesPASS,2failedassertions+1collectionblock; no global unitPASS.')
    fields['guest_and_account_journeys']=cell('PARTIAL_EMULATED_ACCOUNTS',str(assessment.relative_to(PRIMARY)),'Ten Loop modes have actual guest games/cards and saved/history/Breakdown/fresh casual rematch; rooms have fresh emulated two-account boundaries/feed. Real Preview/provider/RLS/SMTP unverified.' if mid in loop_ids else 'Inherited entitlement/trial policy preserved. Fresh native legacy terminals and configured suites are supporting proof, not unlimited guest parity or every-format account/card lifecycle.')
    matches=[]
    for g in m['gateNames']:
        if g.get('command'):
            matches.extend(dict(command=r['command'],exit=r['exit'])for r in gates['rows']if r['command']==g['command'])
    fields['gate_entry']=cell('PASS_LOOP_GATE' if mid in loop_ids else 'PARTIAL_INHERITED_GATES',matches or m['gateNames'],'All11actualLoopgateentriesexit0. Complete88-gate sweep85PASS/3owner-diagnosticFAIL; broad inherited groups are not silently upgraded.')
    fields['og_card']=cell('PASS_LOCAL_ACTUAL_GAME_CRAWLERS' if mid in loop_ids and mid!='rooms' else 'PARTIAL_NO_FORMAT_SPECIFIC_FRESH_CRAWLER_MATRIX','sharing/run3-independent-dc926ad/report.json','Ten actual source-mode recaps on each flag, three bots, exact headline/scope/scores/all10names and1200×630PNG. Room feeds reference existing public completed games; no room-specific gamecard. Six inherited formats/Challenge invitation do not each have this fresh bot/card/guest matrix.')
    mode_events=[e for e in events if e.get('mode')==mid]
    fields['events']=cell('PASS_BOUNDED_LOCAL' if mid in loop_ids else 'PARTIAL_FORMAT_RECEIPTS_UNMATCHED',{'parentReport':str(parent_path.relative_to(PRIMARY)),'modeTaggedNames':sorted(set(e['event']for e in mode_events)),'all10Counts':closed_counts},'Actual accepted local204receipts; all10names occur in the combined parent cohort. Tonight game/guest events use tonight; its parent mode entry used franchise schedule section, so directTonightmode_started is source-only in that report. No per-format durable delivery claim.')
    fields['mobile_profiles']=cell('FAIL_LEGACY_SELECTED_COACH_42PX' if mid in legacy_ids else 'PARTIAL_STATE_COMBINATIONS','fullcrawl-report.json.gz;native-and-naming-reverify/report.json', 'Initial allfive route profiles have no product overflow/minimum-target failures; expanded states preserve after-scroll warnings. Intrinsic42pxfailure is legacy CoachPick,notnewLoopcoachselects. No physical-device acceptance.')
    fields['axe_zero_critical']=cell('PASS_BOUNDED_ZERO_CRITICAL','fullcrawl-report.json.gz','Zero critical across initial routes and reversible control states; twelve serious after-control target-size warnings retained. Actual native Tournament/Win82 terminal proof is separately attributed; not every possible account/game state.')
    fields['mode_inventory_line']=cell('PASS_SOURCE_INVENTORY','run3-source-readiness-dc926ad/post-freeze-ledger-source-comparison.json','Every source mode row is mapped to explicit or grouped governing inventory lines; a row is not full DoD acceptance.')
    if mid in ['one-franchise','one-per-era','no-mvps']: hs='FAIL_THREE_MOBILE_HOME_TAPS';hn='Twelveactualtrails across3variants×4mobiles require3taps:HomeAllmodes→OpenConstraintfilters→Playvariant.'
    elif mid=='legacy-daily': hs='FAIL_MISSING_SEPARATE_HUB_ENTRY';hn='Modes-hub Daily points to NewYork /clash/daily; inheritedUTC /play/daily has no separate hub entry. Other navigation is not a hub link.'
    else: hs='PASS_SOURCE_AND_OBSERVED_LINK';hn='Direct source hub href is observed and exact destination resolves in fullcrawl; native two-tap count was not independently repeated for every direct entry.'
    fields['hub_reachability']=cell(hs,'all-mode-guest-rematches-reverify/report.json;fullcrawl-report.json.gz;source hub inventory',hn)
    fails=[k for k,v in fields.items()if v['status'].startswith('FAIL')]
    matrix.append(dict(id=mid,name=m['name'],route=route,fields=fields,fullAcceptance='FAIL_WITH_PARTIAL_SCOPE' if fails or mid=='daily' else 'PARTIAL',failedFields=fails,additionalFail='DailyLCP3329.5477ms>2500ms' if mid=='daily' else None))
write('joined-mode-dod.json',{'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceSHA':SHA,'ownBlindFreezeSHA256':h(OWN/'blind-final-manifest.json'),'scope':'Post-blind join of source-only matrix and separately attributed current root/parent/own proof;220cells for20rows. No new execution and no borrowed Run2 acceptance.','definitionOfDoneFields':source['definitionOfDoneFields'],'modes':matrix,'pages':source['pages'],'pageScope':'15source families; literal487initialroutes across5profiles. Dynamicprovider/invitation/owned states use separately scoped emulated parent proof,notall5nativeperstate.','fullDoDAcceptance':'No implemented mode receives unqualified completePASS. Provider/physical/durable scope remainsunverified; strictlegacycontracts/hubUTC,threevariantentry,legacycoachsize/performance remainfailures.'})

ledger_bytes=subprocess.check_output(['git','show',SHA+':docs/handoffs/10-02-2026-loop-foundation.md'],cwd=SOURCE)
(OUT/'ledger-at-tested-sha.md').write_bytes(ledger_bytes)
prior=PRIMARY/'data/validation/10-02-2026-verification-run-2.md'
comparison=[
 dict(claim='C.7newmodes≤2home taps / allnewlegacyhubentries',status='DISPROVED_BROAD_CLAIM',fresh='All12actualconstrainttrails need3taps. SeparateUTC legacyDailyhubentry absent in source. Both need acceptance downgrade.',evidence='all-mode-guest-rematches-reverify/report.json;joined-mode-dod.json'),
 dict(claim='Mobile44px / alltouchtargetsinspected',status='DISPROVED_IF_GENERALIZED',fresh='Eight own legacy selectedChangeCoach boxes42px on4profiles; parentcanonicalRandom→Choose→Select also42px. Earlier inspectedcontrols44px mayhold,butdoesnotcoverselectedCoachPick.',evidence='native-and-naming-reverify/report.json;stateful/run-3-final-dc926ada-native-coach-canonical-reverify/report.json'),
 dict(claim='Emptyfuzzysearchlistbox/keyboardrecovery,badgecontrast,legacyDaily/lockedbadges/buildactions fixes',status='HOLDS_BOUNDED_FRESH_NATIVE_PROOF',fresh='Fresh7/7affected-statechecksactualUI,realkeyboard,recovery,contrastandbuilderactions. Bound to those scenarios,not everydynamicstate.',evidence='stateful/run-3-final-dc926ada-affected/affected-state-replay.json'),
 dict(claim='LabprivatepublicGETprojectionandownedscenario',status='HOLDS_FRESH_ACTUAL_HANDLERS',fresh='Owncookie-freeactualLabGETpreservesid/mode/scoreandremovesseed/session/scenario;parentfresh5/5verifiesownedscenario survives subsequent save. FullGETcandidate/fingerprint allowed; recapprojection separate.',evidence='readonly-security-interpretation.json;stateful/run-3-final-dc926ada-privacy/public-get-privacy.json'),
 dict(claim='DirectTonightcontroller/hub/selectedschedule guard',status='HOLDS_FRESH_NATIVE_PROOF',fresh='Direct9/9actualUI/games/card/newguestfive/rematch;all5directroutepages. Emptydateshonest; no earlierFranchisesectionpasssubstituted.',evidence='stateful/run-3-final-dc926ada-tonight-direct/tonight-direct.json;fullcrawl-report.json.gz'),
 dict(claim='Selectedteam/simulation/terminallegacyh1fixes',status='HOLDS_BOUNDED_FRESH_NATIVE_PROOF',fresh='Root15journeys155stagesallPASS,oneactualTournamentterminal;separateparentactualTournament4rounds/Win82terminal2/2PASS.14heldsimulationrequestsaborted; not14completedgames.',evidence='legacy-heading-journeys/report.json;stateful/run-3-final-dc926ada-legacy-terminals/terminal-headings.json'),
 dict(claim='CanonicaloriginalPNGpixels/preload/delivery',status='HOLDS_FRESH_BROWSER_PROOF',fresh='Own20/20actualbrowser-nativePNGproof;originalandselectedderivativeexactpixels/sourcebytespreserved. Source/build anchorsunchanged.',evidence='logo-native-png.json'),
 dict(claim='Sharing/guestrematch/neutralnaming',status='HOLDS_LOCAL_WITH_GREATER_FRESH_COVERAGE',fresh='102normal+102neutralchecks;2610allpairingbotobservations;10newguestcompletegames/newcards;487routesall5/1407linksPASS. Realhosts/embeds/rightsnotestablished.',evidence='blind-findings.json'),
 dict(claim='LegacyCredits/localProfileheadingfixes',status='PARTIAL_MATCHED_REPLAY',fresh='Fullcurrentinitialroutes/reversibledisclosureshavezeroCriticalandnoinitialserious;freshaffectedMyEraandrootnativelegacyh1support. ExactearliersevenCredits-originh1replayandunobservedfallbackwerenotseparatelyrepeated; no blanketfixPASS.',evidence='fullcrawl-report.json.gz;stateful/run-3-final-dc926ada-affected/affected-state-replay.json'),
 dict(claim='Stickyheaderscrollobstruction/allcontrols',status='PARTIAL_RETAINED_WARNINGS',fresh='Twelveafter-controlserious target-sizewarnings in10route/profile rows;allreportednodespartlyobscured. Fiveofsixboundedstatesreproduceandclearattop.167UNVERIFIEDremain classified,notzero-deadclaim.',evidence='raw-failure-and-control-classification.json;axe-scroll-recheck/report.json'),
 dict(claim='CLSfallbackmarginrepair',status='HOLDS_BOUNDED_GATE_PROOF',fresh='Fresh88gatescontainonly3ownerdiagnosticfailures;oldCLSgatefailuresdonotrecur. Numericalclaimsareboundedtothosegateassertions,notallpossibleloads.',evidence='data/validation/foundation/loop-run3-final-dc926ad.json'),
 dict(claim='LoadingLCP',status='PRIOR_FAIL_RECONFIRMED',fresh='Home3306.9804/Daily3329.5477/hub3304.062ms exceed2500. Result1121.67415/pairing1053.4365pass. No sourcechange/waiver/CDNinference.',evidence='lighthouse-literal-acceptance.json'),
 dict(claim='Fullsuites/currentstoredidentity/boundaries',status='BOUNDED_PASSES_AND_RETAINED_FAILURES',fresh='Browser98/98andall11LoopgatesPASS;unit97/100files,2961/2963tests+collectionblock;gates85/88.124protectedblobsunchanged;parentactualsaved/history/Breakdown/rematchandcorrectlegacyengineidentity. Missingfrozenmeasurementsremainfailures.',evidence='suites/run3-baseline-closure.json;joined-mode-dod.json'),
 dict(claim='Hostedaccounts/RLS/SMTP/durableevents/physical/fullDoD',status='STILL_UNVERIFIED_OR_PARTIAL',fresh='AlreadyqualifiedinRun2;notnewlydisproved. Local200/204/emulatedownershipdonotestablishhosted401provideracceptance,realRLS,emailreceipt,durablevendor,physicaldevicesorcomplete20-modeDoD.',evidence='joined-mode-dod.json')]
write('post-blind-comparison-and-ledger-truth.json',{'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceSHA':SHA,'ownFreezeAt':freeze['frozenAt'],'ownFreezeSHA256':h(OWN/'blind-final-manifest.json'),'priorReadOnlyAfterOwnFreeze':True,'inputs':[dict(path=str(prior),sha256=h(prior)),dict(path='ledger-at-tested-sha.md',sha256=hashlib.sha256(ledger_bytes).hexdigest())],'comparison':comparison,'ledgerDisposition':{'A.10':'PARTIAL coverage;1407linksPASSbut167controlobservationsUNVERIFIEDand5provider503. Historicalboundedimplementationlabelnotfullacceptance.','C.7':'FAIL;3variantsneed3taps,andseparatelegacyUTCDailyhubentryabsent.','mobile44px':'FAILforlegacyselectedCoachPick;do notattribute42px toLoopcoachselects.','A.8':'PASSactualboundedlocalall10events;durableingestionUNVERIFIED,day2/day7censored.','fullDoD':'PARTIAL/FAILperjoined220cells,notblanketcomplete.','otherHistoricalFIXEDlabels':'RetainoriginalRun1historybutaddcurrentboundedacceptancestatus;do notrewritehistoryascurrentall-surfacesPASS.'},'productChanges':[],'releaseReadinessAssessment':'Notassessedbythisindependentverifier.'})

checks=[
 (1,'PARTIAL_WITH_RAW_FAIL','Freshfull100unitfiles97PASS/3FAIL;2961PASS/2FAILplus1collectionblock.98/98browserPASS,85/88gatesPASS(all11Loop).No declaredskip/pending/todo.'),
 (2,'FAIL_AND_PARTIAL','2435route/profilechecks2415PASS/15FAIL/5PARTIAL;1407linksPASS;167controlsUNVERIFIED.15FAIL=5API503+10after-controlwarningrows.Threevariant3tapsFAIL.'),
 (3,'PASS_LOCAL_GUEST/PARTIAL_EMULATED','Parent126numberedchecks,90distinctLoopgamesplusgovernedChaos+2legacyformatcalls;actual7winGauntlet.20typedfives.Eachlegacyformatnotcompletefreshcard/accountmatrix.'),
 (4,'PASS_LOCAL/PARTIAL_HOSTED','Normal102/102,isolatedON102/102;2610botpairingobservations;actual10guestrematches/newcards.21socialPASS,sitemap435,3actual404PASS.'),
 (5,'UNVERIFIED_PROVIDER/N_A_PASSWORD_UI','No realPreviewaccounts/SMTP/OAuth/emailreceipt. ExistingemailcodeUIhasnopasswordresetUI; localfakeproviderseparate.'),
 (6,'FAIL_LEGACY_SIZE/PARTIAL_PHYSICAL','5Chromiumprofiles;selectedlegacyChangeCoach42px4mobiles,actualtapsopen. Initialroutegeometrynooverflow;expandedwarningsretained. No physicalOSproof.'),
 (7,'PASS_ZERO_CRITICAL/PARTIAL_BROADER','Zero initial/aftercritical;12seriousaftercontrolwarningsandmanualcontrastincompletesretained. Nativelegacy155stage/2actualterminalproofattributed.'),
 (8,'FAIL','Validhome3306.9804,Daily3329.5477,hub3304.062ms;result1121.67415,pairing1053.4365PASS. InitialNO_NAVSTARTpreserved,oneboundedhomeretry.'),
 (9,'PASS_LOCAL/PARTIAL_PROVIDER','ActualownedrowHistoryBreakdownfreshcasualRunBackidentity;Labprivacy/ownedlabelpreserved. LoopCandidate4/calibration1.4.0/core55bb26a2;legacyformatsproductionV3separate.'),
 (10,'PASS_LOCAL_ACCEPTANCE/PARTIAL_DURABLE','Parentall10closednames167events,45nativebatches/45CDP204. Parent ratios2/38,.5,1;own10guest80eventsratios1,2,.5. Do notpoolcohorts. Day2/day7null/censored.'),
 (11,'PASS_LOCAL/UNVERIFIED_LIVE_RLS','Root8/8boundary/124protectedbytes;own43servedtextassetsbyteequal/boundedsecretpatterns,7headerstargets/LabGETprivacy. SQLsyntax/structureonly;providerisolationunverified.'),
 (12,'PARTIAL_FIX_BY_FIX','Matchedfixesholdinscopedfreshproof;C7/mobilegeneralizationdisproved. Performance/cache/provider/physicalfailurespersist;unmatchedCredits/eachlegacycardchecksnotblanketPASS.')]
write('all12-independent-assessment.json',{'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceSHA':SHA,'scope':'JoinedcurrentRun3proofafterownblindfreeze;noRun2measurementborrowedforexecutionacceptance.','workstreams':[dict(number=n,status=s,evidenceAndLimit=t)for n,s,t in checks],'overallVerification':'FAIL_WITH_PARTIAL_UNVERIFIED_SCOPE','inputs':[dict(path=str(p),sha256=h(p))for p in [source_path,units_path,gate_path,parent_path,assessment,root_closure,OWN/'blind-findings.json',OWN/'blind-final-manifest.json']],'noProductEdits':True})

lines=['# Independent Run3 final assessment','','Own observations froze at '+freeze['frozenAt']+' before any Run2 outcome or ledger reading. This post-freeze assessment joins separately attributed root/source/parent evidence; it does not turn their work into this runner’s blind observations.','','Verification remains **FAIL with PARTIAL/UNVERIFIED scope**. Three constraint variants need three mobile home taps; legacy selected Change coach is42px; home/Daily/hub LCP is about3.3seconds against2.5. LegacyUTC Daily also lacks its separate modes-hub entry, and six legacy formats lack strict standalone mode contract paths. No product fix was made.','','The complete crawl recorded **2,415PASS /15FAIL /5PARTIAL** across2,435checks; **1,407/1,407linksPASS**. Fifteen raw failures are five provider-disabled API503cases and ten route/profile clipping-warning rows. Five partials are owner-only ThemeLab scope. Axe has zero critical but12serious after-control target-size warnings. Of141,934control observations,140,120are href inventory entries,1,547reversible observationsPASS,167UNVERIFIED and100disabledN/A. The58no-change entries are initial idempotent selections; this is not every-control or zero-dead proof.','','| Workstream | Classification | Evidence and limit |','| --- | --- | --- |']
lines += [f'| {n} | {s} | {t} |'for n,s,t in checks]
lines += ['','`joined-mode-dod.json` records all20source mode rows×11cells and15page families. Newgame-modecards do not prove room-specific cards or allsixlegacyformatcard/guest journeys. Real hosted401access,provideraccounts/RLS/SMTP,durabletelemetry,physicaldevices and completed returnwindows remain unverified. Planned oldGauntlet info is separate from implemented newGauntlet; SalaryCap is a data blocker.','','`post-blind-comparison-and-ledger-truth.json` gives exact claim dispositions: native search/recovery/contrast/buildactions/privacy/directTonight/legacyheading/PNG fixes have fresh bounded proof; C.7 and generalized44px claims need downgrade; unmatched replay scope remains partial. The earlier report already retained LCP/cache/provider gaps, which are reconfirmed rather than newly disproved.','','Full own frozen evidence is retained in `/private/tmp/eraclash-run3-independent-dc926ad-evidence.tar.gz` with2848file+manifest SHA verification and gzip roundtrip. Curated PR evidence contains losslessfullaggregategzip,keyshots,own reports,complete fullfilemanifest and postfreeze joins; omitted bulk raw route copies/screenshots remain in the local archive.','']
(OUT/'independent-final-assessment.md').write_text('\n'.join(lines))
write('reconciliation-manifest.json',{'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceSHA':SHA,'ownBlindFreezeSHA256':h(OWN/'blind-final-manifest.json'),'files':[dict(path=str(p),bytes=p.stat().st_size,sha256=h(p))for p in sorted(OUT.iterdir())if p.is_file()and p.name!='reconciliation-manifest.json'],'scope':'Post-freezecomparisonandattributedDoD/all12.Originalownrawfreezeunchanged.'})
print(json.dumps({'output':str(OUT),'modeRows':len(matrix),'DoDcells':len(matrix)*len(source['definitionOfDoneFields']),'sourcePages':len(source['pages']),'all12':len(checks),'controls':len(controls),'warnings':len(warnings),'manifestSHA256':h(OUT/'reconciliation-manifest.json')}))
