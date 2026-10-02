// Browser storage is only a resume hint. The server owns every Daily attempt.
export function readHint(mode, scope, key) { try { return JSON.parse(localStorage.getItem(`ec-loop-${mode}|${scope}|${key}`) || 'null'); } catch { return null; } }
export function writeHint(mode, scope, key, value) { try { localStorage.setItem(`ec-loop-${mode}|${scope}|${key}`, JSON.stringify(value)); return true; } catch { return false; } }
export function clearHint(mode, scope, key) { try { localStorage.removeItem(`ec-loop-${mode}|${scope}|${key}`); } catch { /* storage can be unavailable */ } }
export const userScope = user => user?.session?.userId || user?.userId || user?.id || 'guest';
