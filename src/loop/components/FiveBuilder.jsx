import React from 'react';
import { POSITIONS } from '../../players.js';
import PlayerPicker from './PlayerPicker.jsx';
import { BY_ID, canonicalPerson, filterPool, legalFive } from '../draft/model.js';
import { franchiseLabel } from './franchiseLabel.js';

export default function FiveBuilder({ value, onChange, kind = 'any-five', franchise = '', era = '', slots, poolIds, hiddenStats = false, disabled = false, allowOutOfPosition = ['any-five', 'lab'].includes(kind) }) {
  const update = (index, id) => onChange(value.map((old, i) => i === index ? id : old));
  return <div className="loop-builder">
    <div className="loop-five">{POSITIONS.map((position, index) => {
      const otherPeople = new Set(value.filter((id, i) => id && i !== index).map(canonicalPerson));
      const otherEras = new Set(value.filter((id, i) => id && i !== index).map(id => BY_ID.get(id)?.decade));
      const allowedIds = filterPool({ kind, franchise, era, position: allowOutOfPosition ? '' : position, poolIds: slots?.[index]?.poolIds || poolIds }).filter(p => !otherPeople.has(canonicalPerson(p.id)) && (kind !== 'one-per-era' || !otherEras.has(p.decade))).map(p => p.id);
      return <div className="loop-pick-slot" key={position}>{slots && <p className="loop-spin-constraint">{franchiseLabel(slots[index]?.franchise, slots[index]?.era)}</p>}<PlayerPicker label={allowOutOfPosition ? `Player ${index + 1}` : position} index={index} value={value[index]} onChange={id => update(index, id)} poolIds={allowedIds} hiddenStats={hiddenStats} disabled={disabled} /></div>;
    })}</div>
    <button type="button" className="loop-secondary" disabled={disabled} onClick={() => { const five = legalFive({ kind, franchise, era, slots, poolIds, seed: `sample-${Date.now()}` }); if (five) onChange(five); }}>Fill a playable example</button>
    <p className="loop-fine">Each card represents a player in a particular decade. Nicknames and close spellings show explicit card choices. A person can appear only once.</p>
  </div>;
}
