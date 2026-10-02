import { describe, it, expect } from 'vitest';
import { PLAYERS, POSITIONS } from '../src/players.js';
import { isLegalLineup } from '../src/lineupPlacement.js';
import { FRANCHISES, FRANCHISE_PAIRINGS, getFranchise, getFranchiseRoster, getFranchisePairing, franchisePairingFor, franchiseDisplayName, getTonightGames, scheduleDateKey, isScheduleDateKey, SCHEDULE_METADATA } from '../src/loop/franchises.js';
import schedule from '../data/schedule/2026-27.json' with { type:'json' };

describe('curated franchise data and historical boundaries', () => {
  it('covers all 30 franchises with legal, distinct-person, unchanged source cards', () => {
    expect(FRANCHISES).toHaveLength(30);
    expect(new Set(FRANCHISES.map(f => f.id)).size).toBe(30);
    for (const franchise of FRANCHISES) {
      const five = getFranchiseRoster(franchise.id);
      expect(five).toHaveLength(5);
      expect(isLegalLineup(five)).toBe(true);
      expect(new Set(five.map(p => p.name)).size).toBe(5);
      five.forEach((player, slot) => {
        expect(player).toBe(PLAYERS.find(p => p.id === franchise.playerIds[slot]));
        expect(player.positions).toContain(POSITIONS[slot]);
        expect(franchise.slots[slot]).toEqual({pos:POSITIONS[slot],playerId:player.id});
        expect(franchise.poolIds).toContain(player.id);
      });
      expect(franchise.sources.length).toBeGreaterThan(0);
      expect(franchise.sources.every(s => ['www.nba.com','cdn.nba.com'].includes(new URL(s).hostname))).toBe(true);
      expect(franchise.notes.length).toBeGreaterThan(30);
      expect(franchise.reviewStatus).toBe('OWNER_REVIEW');
      expect(franchise.coachId).toBe('neutral');
    }
  });
  it('never shifts New Orleans Paul into Charlotte or Seattle cards into Oklahoma City', () => {
    expect(getFranchise('new-orleans').poolIds).toContain('cp3-00s');
    expect(getFranchise('charlotte').poolIds).not.toContain('cp3-00s');
    expect(getFranchise('oklahoma-city').poolIds.every(id => !/Sonics/i.test(PLAYERS.find(p => p.id === id).team))).toBe(true);
    expect(getFranchise('portland').playerIds).not.toContain('walton-80s');
    expect(getFranchise('memphis').playerIds).not.toContain('coward-20s');
  });
  it('renders unambiguous city and era names when the neutral flag is on', () => {
    const neutralNames=FRANCHISES.map(f => franchiseDisplayName(f,{neutralNaming:true}));
    expect(new Set(neutralNames).size).toBe(30);
    expect(neutralNames.every(name=>name.endsWith('· All-time'))).toBe(true);
    expect(franchiseDisplayName('la-lakers',{neutralNaming:true})).toBe('Los Angeles Gold · All-time');
    expect(franchiseDisplayName('la-clippers',{neutralNaming:true})).toBe('Los Angeles Blue · All-time');
    expect(franchiseDisplayName('boston')).toBe('Boston Celtics · All-time');
    expect(franchiseDisplayName('boston',{neutralNaming:true})).toBe('Boston · All-time');
  });
  it('rejects unknown roster requests without generating stand-ins', () => {
    expect(getFranchise('missing')).toBeNull();
    expect(()=>getFranchiseRoster('missing')).toThrow('Unknown franchise');
    const forged={...getFranchise('boston'),playerIds:getFranchise('chicago').playerIds,name:'Forged name'};
    expect(getFranchiseRoster(forged)).toEqual(getFranchiseRoster('boston'));
    expect(franchiseDisplayName(forged)).toBe('Boston Celtics · All-time');
  });
});
describe('every unordered pairing has one canonical route', () => {
  it('contains exactly 435 unique pairings and excludes self-play', () => {
    expect(FRANCHISE_PAIRINGS).toHaveLength(435);
    expect(new Set(FRANCHISE_PAIRINGS.map(p=>p.path)).size).toBe(435);
    for(const a of FRANCHISES)for(const b of FRANCHISES){
      if(a.id===b.id) expect(franchisePairingFor(a.id,b.id)).toBeNull();
      else {
        const p=franchisePairingFor(a.id,b.id);
        expect(p).toBe(franchisePairingFor(b.id,a.id));
        expect(getFranchisePairing(p.slug)).toBe(p);
        expect(p.path).toBe(`/clash/all-time/${p.slug}`);
      }
    }
    expect(getFranchisePairing('../boston')).toBeNull();
    expect(franchisePairingFor('missing','boston')).toBeNull();
  });
});
describe('official released schedule with explicit Cup incompleteness', () => {
  it('contains all 1,200 assigned games, 80 per team, 40 designated home and away', () => {
    expect(schedule.games).toHaveLength(1200);
    expect(new Set(schedule.games.map(g=>g.id)).size).toBe(1200);
    expect(new Set(schedule.games.map(g=>g.officialGameNumber)).size).toBe(1200);
    for(const franchise of FRANCHISES){
      expect(schedule.games.filter(g=>g.homeId===franchise.id)).toHaveLength(40);
      expect(schedule.games.filter(g=>g.awayId===franchise.id)).toHaveLength(40);
    }
    for(const game of schedule.games){
      expect(getFranchise(game.homeId)).toBeTruthy();
      expect(getFranchise(game.awayId)).toBeTruthy();
      expect(game.homeId).not.toBe(game.awayId);
      expect(isScheduleDateKey(game.date)).toBe(true);
      expect(scheduleDateKey(game.tipoffUtc)).toBe(game.date);
    }
    expect(SCHEDULE_METADATA.scheduledGamesPerTeam).toBe(82);
    expect(SCHEDULE_METADATA.remainingGames).toMatchObject({count:30,gamesPerTeam:2,windowStart:'2026-12-04',windowEnd:'2026-12-10'});
    expect(SCHEDULE_METADATA.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(SCHEDULE_METADATA.subjectToChange).toBe(true);
  });
  it('matches all three opening-night opponents, ET times, and cross-midnight UTC conversion', () => {
    const games=getTonightGames('2026-10-20');
    expect(games.map(g=>[g.awayId,g.homeId,g.tipoffET])).toEqual([['boston','detroit','3:00 PM'],['philadelphia','new-york','7:00 PM'],['oklahoma-city','san-antonio','9:30 PM']]);
    expect(games[2].tipoffUtc).toBe('2026-10-21T01:30:00Z');
    expect(games.every(g=>g.home&&g.away&&g.pairing)).toBe(true);
  });
  it('handles eastern calendar boundaries and rejects malformed dates', () => {
    expect(scheduleDateKey('2026-10-21T01:30:00Z')).toBe('2026-10-20');
    expect(scheduleDateKey('2026-11-04T04:59:00Z')).toBe('2026-11-03');
    expect(scheduleDateKey('2026-11-04T05:00:00Z')).toBe('2026-11-04');
    expect(getTonightGames('2026-11-03')).toEqual([]);
    for(const date of ['2026-02-30','2026-13-01','2026-1-01','bad',''])expect(()=>getTonightGames(date)).toThrow('real YYYY-MM-DD');
    expect(()=>scheduleDateKey('bad')).toThrow('Invalid schedule clock');
  });
});
