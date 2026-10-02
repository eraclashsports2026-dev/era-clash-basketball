import { useState } from 'react';
export default function useLoopAction(api) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const act = async (body, done) => {
    if (busy) return null;
    setError(''); setBusy(true);
    try { const data = await api(body); done?.(data); return data; }
    catch (failure) { setError(failure?.message || 'This action could not be completed. Try again.'); return null; }
    finally { setBusy(false); }
  };
  return { act, busy, error, setError };
}
