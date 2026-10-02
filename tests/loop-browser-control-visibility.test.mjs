// Standalone real-browser instrumentation regression; no app/provider requests.
// Run: node --test tests/loop-browser-control-visibility.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

test('actual collector excludes collapsed controls and inventories native summaries', { timeout: 30_000 }, async () => {
  const source = await readFile(new URL('../scripts/loop/fullBrowserAudit.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('async function documentControls(page)');
  const end = source.indexOf('async function settledPage(', start);
  assert(start >= 0 && end > start, 'Actual collector function must be identifiable; do not substitute a mock implementation.');
  const inventory = new Function(`return (${source.slice(start, end).trim()})`)();
  const browser = await chromium.launch({
    executablePath: process.env.ECLASH_BROWSER_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  try {
    const context = await browser.newContext({ bypassCSP: false });
    const page = await context.newPage();
    await page.setContent('<style>button,summary{min-width:44px;min-height:44px}.transparent{opacity:0}.hidden{visibility:hidden}.gone{display:none}</style><button>Visible control</button><details><summary>Closed details summary</summary><button>Collapsed descendant</button></details><details open><summary>Open details summary</summary><button>Open descendant</button></details><button class="transparent">Transparent control</button><button class="hidden">Hidden control</button><button class="gone">Absent control</button>');
    assert(await page.evaluate(() => typeof document.querySelector('button').checkVisibility === 'function'), 'This regression requires actual browser checkVisibility support.');
    const initial = await inventory(page);
    for (const name of ['Visible control', 'Closed details summary', 'Open details summary', 'Open descendant']) {
      assert(initial.some(control => control.name === name), `Visible control missing: ${name}`);
    }
    for (const name of ['Collapsed descendant', 'Transparent control', 'Hidden control', 'Absent control']) {
      assert(!initial.some(control => control.name === name), `Unrendered control incorrectly inventoried: ${name}`);
    }
    await page.getByText('Closed details summary', { exact: true }).click();
    assert((await inventory(page)).some(control => control.name === 'Collapsed descendant'), 'Native disclosure must expose its real descendant.');
    await page.getByText('Closed details summary', { exact: true }).click();
    assert(!(await inventory(page)).some(control => control.name === 'Collapsed descendant'), 'Closing the disclosure must exclude its descendant again.');
    await context.close();
  } finally {
    await browser.close();
  }
});
