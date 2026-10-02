// Test-only companion: actual API handlers + existing fakeCloud server and a
// Vite SOURCE client whose provider is the existing test adapter. Never deploy.
// Account browser evidence is PARTIAL EMULATED, never real Preview/OAuth/RLS.
import { createServer as createViteServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { statefulUsers, identitySalt } from './loop-stateful-identities.mjs';
const apiPort = Number(process.env.LOOP_QA_API_PORT || 4322);
const clientPort = Number(process.env.LOOP_QA_PORT || 4321);
process.env.ECLASH_FAKE_CLOUD = '1';
process.env.ECLASH_TEST_MEMORY_STORE = '1';
process.env.PREVIEW_SIM_ENGINE_ENABLED = 'true';
// Local verification only; production/default budgets remain unchanged.
process.env.RL_SIM_PER_MIN_SESSION = '500';
process.env.RL_SIM_PER_MIN_IP = '500';
process.env.VERCEL_ENV = 'preview';
process.env.VITE_CLOUD_ACCOUNTS_ENABLED = 'false';
process.env.VITE_SUPABASE_URL = '';
process.env.VITE_SUPABASE_ANON_KEY = '';
process.env.PUBLIC_SITE_ORIGIN = `http://localhost:${clientPort}`;
process.argv[2] = String(apiPort);
await import('../scripts/harness.mjs');
// Profiles only; scores, games, claims and saved rows remain empty until the
// actual handlers write them during a browser journey.
for (const user of statefulUsers) globalThis.__fakeCloud.tables.profiles.push({ user_id: user.userId, display_name: user.displayName });
const fixturePlugin = {
  name: 'loop-stateful-test-provider-only', enforce: 'pre',
  transform(code, id) {
    if (id.split('?')[0] === fileURLToPath(new URL('../src/main.jsx', import.meta.url))) return `import '/tests/loop-stateful-browser-provider.js';\n${code}`;
  },
  configureServer(server) {
    server.middlewares.use('/__loop-qa/read', (req, res) => {
      const userId = /^Bearer test-token\.([0-9a-f-]+)$/.exec(req.headers.authorization || '')?.[1];
      const db = globalThis.__fakeCloud?.tables;
      if (req.method !== 'GET' || !db?.profiles.some(row => row.user_id === userId)) { res.statusCode = 401; res.end('test account required'); return; }
      const table = new URL(req.url, 'http://localhost').searchParams.get('table');
      if (table !== 'saved_clashes') { res.statusCode = 400; res.end('read not permitted'); return; }
      res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(db.saved_clashes.filter(row => row.user_id === userId)));
    });
  },
};
const vite = await createViteServer({ root: fileURLToPath(new URL('../', import.meta.url)), plugins: [fixturePlugin], define: { __LOOP_QA_USERS__: JSON.stringify(statefulUsers) }, optimizeDeps: { entries: ['index.html'] }, server: { watch: null, hmr: false, host: '127.0.0.1', port: clientPort, strictPort: true, proxy: { '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false }, '/card': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false } } } });
await vite.listen();
console.log(`PARTIAL EMULATED account QA source client http://localhost:${clientPort}; actual API/fake cloud :${apiPort}; identity namespace ${identitySalt}`);
