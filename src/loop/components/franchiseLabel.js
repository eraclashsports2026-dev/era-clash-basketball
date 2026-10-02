import { franchiseDisplayName, getFranchise } from '../franchiseCatalog.js';
import { neutralTeamNaming, teamDisplayName } from '../rights.js';
export function franchiseLabel(id, era = 'All-time') {
  if (getFranchise(id)) return `${franchiseDisplayName(id, { neutralNaming: neutralTeamNaming() }).replace(/ · All-time$/, '')} · ${era}`;
  const name = teamDisplayName(id, era);
  return neutralTeamNaming() ? name : `${name} · ${era}`;
}
