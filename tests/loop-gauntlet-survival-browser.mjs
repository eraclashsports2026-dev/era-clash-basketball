// Bounded actual-browser Gauntlet survival check. No seeds, stage injection,
// result fixtures, victory overrides, or engine changes. Stop on real seven wins.
import { chromium } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { BY_ID, validateFive } from '../src/loop/draft/model.js';
const base = process.env.LOOP_TEST_URL || 'http://localhost:4321';
const label = process.env.LOOP_BROWSER_RUN || 'run-2-survival';
const bound = Math.min(20, Math.max(1, Number(process.env.LOOP_GAUNTLET_BOUND || 20)));
// Strong peak-era five, position-qualified by the current accepted card roster.
// This is a test lineup selection, not an assertion of globally optimal strength.
const goldIds = ['curry-10s', 'jordan-90s', 'lebron-10s', 'duncan-00s', 'shaq-00s'];
if (!validateFive(goldIds, { kind: 'gauntlet' }).ok) throw new Error('The test five is not eligible.');
const output = resolve(`data/validation/loop-foundation/stateful/${label}`);
await mkdir(output, { recursive: true });
const coreHash = '55bb26a20e7d9176b25f102eea553820a7ea94cf935953f87cb3c9cc18656fff';
const report = { run: label, target: base, executionPath: process.cwd(), sourceSHA: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), productionBuildStamp: /name="eraclash-build"\s+content="([^"]+)"/.exec(await readFile('dist/index.html', 'utf8'))?.[1] || null, testFileSHA256: createHash('sha256').update(await readFile('tests/loop-gauntlet-survival-browser.mjs')).digest('hex'), startedAt: new Date().toISOString(), scope: 'Actual guest Chrome browser using the local source-client companion and actual Candidate4 server. Local in-memory store; no deployment, hosted persistence, OAuth or physical-device claim.', bounds: { runs: bound, games: bound * 7 }, localBudgetOverrides: { RL_SIM_PER_MIN_SESSION: 500, RL_SIM_PER_MIN_IP: 500, purpose: 'Local verification only. Shared 120 actions/min and public 20 recaps/min remain.' }, goldIds, attempts: [], failures: [], consoleErrors: [], survival: 'UNVERIFIED' };
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] });
const assert = (value, message) => { if (!value) throw new Error(message); };
let lastPlay = 0;
try {
  for (let attempt = 1; attempt <= bound; attempt++) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage(); page.setDefaultTimeout(30000); page.setDefaultNavigationTimeout(90000);
    page.on('pageerror', error => report.consoleErrors.push({ attempt, error: error.message }));
    const observed = { attempt, games: [] }; report.attempts.push(observed);
    try {
      await page.goto(`${base}/clash/gauntlet`, { waitUntil: 'networkidle' });
      for (let index = 0; index < goldIds.length; index++) { const player = BY_ID.get(goldIds[index]); await page.getByTestId(`loop-player-${index}`).fill(player.name); await page.locator('.loop-options button').filter({ hasText: player.decade }).first().click(); }
      const start = await Promise.all([page.waitForResponse(r => r.url().endsWith('/api/game') && r.request().postDataJSON()?.op === 'gauntlet-start'), page.getByRole('button', { name: 'Start the Gauntlet', exact: true }).click()]).then(([r]) => r.json());
      assert(JSON.stringify(start.goldIds) === JSON.stringify(goldIds), 'Submitted five differs from chosen peak-era cards.');
      let final;
      for (let stage = 0; stage < 7; stage++) {
        await page.getByRole('heading', { name: `Stage ${stage + 1} of 7 · ${start.eraIds[stage]}`, exact: true }).waitFor();
        const wait = 3600 - (Date.now() - lastPlay); if (wait > 0) await page.waitForTimeout(wait); lastPlay = Date.now();
        const response = await Promise.all([page.waitForResponse(r => r.url().endsWith('/api/game') && r.request().postDataJSON()?.op === 'gauntlet-play'), page.getByRole('button', { name: stage ? 'Continue to the next era' : 'Play this era', exact: true }).click()]).then(([r]) => r);
        final = await response.json(); assert(response.ok(), `Actual stage returned ${response.status()} ${JSON.stringify(final)}`);
        assert(final.result?.candidate?.candidateId === 'Candidate 4' && final.result.candidate.possessionCalibrationVersion === '1.4.0' && final.result.candidate.coreHash === coreHash, 'Candidate/calibration/core identity drift.');
        assert(JSON.stringify(final.gauntlet.goldIds) === JSON.stringify(goldIds), 'Locked five changed.');
        assert(final.gauntlet.stage === stage + 1, 'Server stage did not advance exactly once.');
        observed.games.push({ resultId: final.resultId, eraId: final.result.eraId, score: final.result.core.finalScore, stage: final.gauntlet.stage, victories: final.gauntlet.victories, done: final.gauntlet.done, candidateId: final.result.candidate.candidateId, calibration: final.result.candidate.possessionCalibrationVersion, coreHash: final.result.candidate.coreHash });
        await page.getByRole('region', { name: 'Completed Clash', exact: true }).waitFor();
        if (final.gauntlet.done) break;
      }
      assert(final.gauntlet.done, 'Run was not terminal after seven stages.');
      observed.stagesObserved = final.gauntlet.stage; observed.victories = final.gauntlet.victories; observed.outcome = final.gauntlet.won ? 'seven-stage survival' : 'eliminated on actual result';
      await page.getByRole('heading', { name: `${observed.victories} of 7 eras survived`, exact: true }).waitFor();
      assert(await page.getByRole('button', { name: 'Build a new Gauntlet five', exact: true }).isVisible(), 'Terminal new-run action missing.');
      const expected = { victories: observed.victories, totalEras: 7, stagesPlayed: observed.stagesObserved, finished: true };
      assert(JSON.stringify(final.result.loop.gauntlet) === JSON.stringify(expected), 'Authoritative completed-run count mismatch.');
      const cardLink = page.getByRole('region', { name: 'Completed Clash', exact: true }).getByRole('link', { name: 'Open result card', exact: true });
      await cardLink.waitFor(); const cardURL = await cardLink.getAttribute('href'); const shareId = cardURL.split('/card/')[1];
      const recapResponse = await page.request.get(`${base}/api/result?id=${shareId}`); assert(recapResponse.ok(), 'Published recap cannot be read.'); const recap = await recapResponse.json();
      assert(JSON.stringify(recap.loop?.gauntlet) === JSON.stringify(expected), 'Public recap counts do not match the actual completed run.');
      assert(recap.headline.includes(`${observed.victories} of 7 eras`) && recap.scope.includes('Completed run') && recap.scope.includes('Latest stage points'), 'Public card mislabels stage points or survival counts.');
      observed.terminalUIVerified = true; observed.publicRecap = { path: `/card/${shareId}`, gauntlet: recap.loop.gauntlet, headline: recap.headline, scope: recap.scope };
      const boardResponse = await page.request.post(`${base}/api/game`, { headers: { Origin: base }, data: { action: 'loop', op: 'leaderboard', tag: 'GAUNTLET' } }); const board = await boardResponse.json();
      assert(boardResponse.ok(), 'Gauntlet leaderboard unavailable.'); assert(board.rows.some(row => row.resultId === final.resultId && JSON.stringify(row.gauntlet) === JSON.stringify(expected)), 'Completed actual run absent or miscounted on Gauntlet board.'); observed.boardVerified = true;
      if (final.gauntlet.won) {
        assert(observed.games.length === 7 && observed.games.every(game => game.score.gold > game.score.blue), 'Seven-win claim lacks seven actual winning scores.');
        await page.getByRole('heading', { name: '7 of 7 eras survived', exact: true }).scrollIntoViewIfNeeded(); await page.screenshot({ path: resolve(output, 'seven-win-terminal-mobile.png'), fullPage: true });
        await cardLink.click(); await page.getByRole('heading', { name: 'Era Gauntlet · 7 of 7 eras', exact: true }).waitFor(); await page.screenshot({ path: resolve(output, 'seven-win-public-card-mobile.png'), fullPage: true });
        report.survival = 'PASS: actual seven winning stages, terminal UI, public recap and completed-run board verified'; console.log(`PASS actual seven-stage survival on fresh attempt ${attempt}`); break;
      }
      console.log(`Actual attempt ${attempt}: ${observed.victories} wins, eliminated at stage ${observed.stagesObserved}`);
    } catch (error) { observed.error = error.message; report.failures.push({ attempt, error: error.stack }); console.log(`FAIL attempt ${attempt}: ${error.message}`); break; }
    finally { await context.close(); }
  }
} finally {
  await browser.close(); report.endedAt = new Date().toISOString(); report.summary = { attempts: report.attempts.length, games: report.attempts.reduce((sum, run) => sum + run.games.length, 0), survivalVerified: report.survival.startsWith('PASS'), failures: report.failures.length, consoleErrors: report.consoleErrors.length };
  await writeFile(resolve(output, 'gauntlet-survival.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report.summary)); if (report.failures.length || report.consoleErrors.length) process.exitCode = 1;
}
