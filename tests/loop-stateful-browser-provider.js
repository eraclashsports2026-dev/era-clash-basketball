// Test-only browser adapter. Imported by the companion Vite transform, never by
// a production source file. Saved rows are READ from actual fake-cloud server
// inserts; createTestProvider's privileged server/putResult path is never used.
import { createTestProvider } from '../src/accounts/testAdapter.js';
import { _setProvider } from '../src/accounts/provider.js';
import { adopt } from '../src/accounts/accountState.js';
const USERS = __LOOP_QA_USERS__; // Vite test-only define; never in a production source import.
const fixture = createTestProvider({ users: USERS });
const original = { ...fixture.provider };
async function syncSaved() {
  const session = await original.currentSession();
  if (!session) { fixture.db.savedClashes = []; return; }
  const response = await fetch('/__loop-qa/read?table=saved_clashes', { headers: { Authorization: `Bearer ${session.accessToken}` } });
  if (!response.ok) throw new Error('Owner-scoped test bridge is unavailable.');
  fixture.db.savedClashes = await response.json();
}
for (const method of ['listSavedClashes', 'getSavedClash', 'career', 'recentActivity']) fixture.provider[method] = async (...args) => { await syncSaved(); return original[method](...args); };
fixture.provider.verifyEmailCode = async (...args) => { const session = await original.verifyEmailCode(...args); if (USERS.some(user => user.userId === session.userId)) localStorage.setItem('loop_qa_account', session.userId); return session; };
fixture.provider.signOut = async () => { localStorage.removeItem('loop_qa_account'); return original.signOut(); };
_setProvider(fixture.provider);
const selected = localStorage.getItem('loop_qa_account');
if (USERS.some(user => user.userId === selected)) fixture.signInAs(selected);
// Explicit test controller for reset/cross-account journeys, not an auth flow.
window.__loopQASwitchAccount = async userId => {
  if (!USERS.some(user => user.userId === userId)) throw new Error('Unknown test account.');
  localStorage.setItem('loop_qa_account', userId);
  const session = fixture.signInAs(userId);
  await adopt(session);
  return { userId: session.userId };
};
