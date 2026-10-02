import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { PLAYERS } from '../src/players.js';
import eraData from '../src/v3/data/eras.js';
import coachData from '../src/v3/data/coaches.js';
import { leagueCopy, neutralTeamCopy, neutralTeamNaming, teamDisplayName } from '../src/loop/rights.js';
import EraStyleSelect from '../src/components/EraStyleSelect.jsx';
import CoachModal from '../src/components/CoachModal.jsx';
import RosterGrid from '../src/components/RosterGrid.jsx';
import EraRevealPanel, { eraRuleCards } from '../src/components/arena/EraRevealPanel.jsx';
import CoachCard from '../src/components/arena/CoachCard.jsx';
import { KeyMoments, MatchupPatterns } from '../src/components/PostgamePanels.jsx';

const html = (component, props) => renderToStaticMarkup(React.createElement(component, props));
const league = /\b(?:NBA|ABA|BAA|NBL|ABL)\b|National Basketball Association/i;
afterEach(() => vi.unstubAllEnvs());

describe('Loop presentation rights boundaries', () => {
  it('defaults neutral naming off and accepts explicit public flags', () => {
    expect(neutralTeamNaming({})).toBe(false);
    for (const value of ['true', '1', 'on', 'yes']) expect(neutralTeamNaming({ NEUTRAL_TEAM_NAMING: value })).toBe(true);
    expect(teamDisplayName('Celtics', '1960s', false)).toBe('Celtics');
    expect(teamDisplayName('Celtics', '1960s', true)).toBe('Boston · 1960s');
  });
  it('maps every protected catalog team label without changing a player field', () => {
    const before = JSON.stringify(PLAYERS);
    for (const player of PLAYERS) {
      const projected = teamDisplayName(player.team, player.decade, true);
      expect(projected, player.id).toContain(`· ${player.decade}`);
      for (const nickname of player.team.split('/')) expect(projected, player.id).not.toMatch(new RegExp(`\\b${nickname.trim()}\\b`));
    }
    expect(JSON.stringify(PLAYERS)).toBe(before);
    expect(teamDisplayName('Lakers', '1950s', true)).toBe('Minneapolis · 1950s');
    expect(teamDisplayName('Warriors/76ers', '1960s', true)).toBe('Philadelphia / San Francisco · 1960s');
  });
  it('neutralizes descriptive teams while preserving people and exact historical cities', () => {
    expect(neutralTeamCopy('Magic Johnson faced the Boston Celtics and Minneapolis Lakers.')).toBe('Magic Johnson faced the Boston and Minneapolis.');
    expect(neutralTeamCopy('The Atlanta Hawks and Chicago Bulls.')).toBe('The Atlanta and Chicago.');
    expect(leagueCopy('NBA Finals, NBA.com, BAA/NBA and ABA-NBA merger.', { neutral: false })).not.toMatch(league);
    expect(leagueCopy(null)).toBeNull();
  });
  it('renders every protected era without league branding in visible copy or title/alt text', () => {
    const before = JSON.stringify(eraData);
    for (const era of eraData.eras) {
      expect(html(EraStyleSelect, { eras: eraData.eras, selected: era.id, teamIds: [] }), era.id).not.toMatch(league);
      const run = { eraState: { eraStyleId: era.id }, eraContext: { ruleFacts: era.ruleFacts, highlights: era.styleSummary } };
      expect(html(EraRevealPanel, { run }), era.id).not.toMatch(league);
      expect(eraRuleCards(run).every(card => !league.test(card.full))).toBe(true);
    }
    expect(JSON.stringify(eraData)).toBe(before);
  });
  it('renders all coach details and offer title attributes without league branding', () => {
    const before = JSON.stringify(coachData);
    for (const coach of coachData.coaches) {
      expect(html(CoachModal, { side: 'gold', coaches: [coach], selectedId: coach.id, onClose() {}, onSelect() {} }), coach.id).not.toMatch(league);
    }
    expect(html(CoachCard, { offer: { role: 'head', name: 'John Kundla', span: '1948–1959 (BAA/NBA)', offense: 'NBA interior attack' } })).not.toMatch(league);
    expect(JSON.stringify(coachData)).toBe(before);
  });
  it('renders the actual roster with flag ON and leaves canonical labels intact with flag OFF', () => {
    const five = ['magic-80s', 'jordan-90s', 'bird-80s', 'duncan-00s', 'hak-90s'].map(id => PLAYERS.find(player => player.id === id));
    vi.stubEnv('NEUTRAL_TEAM_NAMING', 'true');
    const neutral = html(RosterGrid, { five });
    expect(neutral).toContain('Magic'); expect(neutral).toContain('Johnson'); expect(neutral).toContain('Los Angeles Gold'); expect(neutral).not.toMatch(/Celtics|Lakers|Bulls|Rockets|Spurs/);
    vi.stubEnv('NEUTRAL_TEAM_NAMING', 'false');
    expect(html(RosterGrid, { five })).toContain('Celtics');
    expect(five[0].team).toBe('Lakers');
  });
  it('projects generated narrative snippets at the rendering boundary', () => {
    expect(html(KeyMoments, { moments: [{ kind: 'RUN', period: 'Q1', text: 'An NBA era rule influenced the run.' }] })).not.toMatch(league);
    expect(html(MatchupPatterns, { patterns: [{ text: 'NBA spacing created an opening.' }] })).not.toMatch(league);
  });
  it('keeps the public marketing metadata and exact disclaimer free of league branding', () => {
    for (const file of ['index.html', 'public/manifest.json']) expect(readFileSync(file, 'utf8'), file).not.toMatch(league);
    expect(readFileSync('api/share-page.js', 'utf8')).toMatch(/not affiliated with, endorsed by, or sponsored by any professional basketball league or team/i);
  });
});
