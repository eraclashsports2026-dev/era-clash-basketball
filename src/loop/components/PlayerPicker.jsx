import React, { useId, useMemo, useState } from 'react';
import { searchPlayers, BY_ID } from '../draft/model.js';
import { teamDisplayName } from '../rights.js';

export default function PlayerPicker({ label, value, onChange, poolIds, position = '', hiddenStats = false, disabled = false, index = 0 }) {
  const uid = useId(), [query, setQuery] = useState(''), [open, setOpen] = useState(false), [active, setActive] = useState(0);
  const selected = BY_ID.get(value);
  const options = useMemo(() => searchPlayers(query, { poolIds, position, limit: 12 }), [query, poolIds, position]);
  const choose = p => { onChange(p.id); setQuery(''); setOpen(false); setActive(0); };
  return <div className="loop-picker" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <label htmlFor={`${uid}-input`}>{label}</label>
    <input id={`${uid}-input`} data-testid={`loop-player-${index}`} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${uid}-options`} aria-activedescendant={open && options[active] ? `${uid}-${options[active].id}` : undefined} autoComplete="off" disabled={disabled}
      value={query} placeholder={selected ? `${selected.name} · ${selected.decade}` : 'Name, nickname, or a close spelling'}
      onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setOpen(true); setActive(0); }}
      onKeyDown={event => { if (event.key === 'Escape') setOpen(false); else if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActive(i => Math.min(i + 1, options.length - 1)); } else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(i => Math.max(0, i - 1)); } else if (event.key === 'Enter' && open && options[active]) { event.preventDefault(); choose(options[active]); } }} />
    {selected && <div className="loop-selected"><span><strong>{selected.name}</strong><small>{selected.decade} · {teamDisplayName(selected.team, selected.decade)} · {selected.positions.join('/')}{!hiddenStats && ` · ${selected.pts} PPG / ${selected.reb} RPG / ${selected.ast} APG`}</small></span><button type="button" className="loop-clear" disabled={disabled} aria-label={`Remove ${selected.name}`} onClick={() => onChange(null)}>×</button></div>}
    {open && <div id={`${uid}-options`} role="listbox" aria-label={`${label} choices`} className="loop-options">
      {options.length ? options.map((p, i) => <button type="button" role="option" aria-selected={i === active} id={`${uid}-${p.id}`} key={p.id} onMouseDown={event => event.preventDefault()} onClick={() => choose(p)}>
        <strong>{p.name}</strong><span>{p.decade} · {teamDisplayName(p.team, p.decade)} · {p.positions.join('/')}</span>{!hiddenStats && <small>{p.pts} PPG · {p.reb} RPG · {p.ast} APG</small>}
      </button>) : <p role="status">No matching card in this pool. Try a surname or another spelling.</p>}
    </div>}
  </div>;
}
