import { useState, useRef } from "react";

// ── Player Database ───────────────────────────────────────────────────────────
// pos = primary position, positions = all eligible positions (like 82-0)
const PLAYERS = [
  // ═══ 1960s ═══
  { id:"wilt-60s",   name:"Wilt Chamberlain",        decade:"1960s", pos:"C",  positions:["C"],           team:"Warriors/76ers",  pts:37.6, reb:27.2, ast:4.2,  stl:0.0, blk:0.0 , mvp:4, fmvp:0, dpoy:0, an1:7, an2:0, an3:0, ad1:0, ad2:0, win:6, pop:9 },
  { id:"bill-60s",   name:"Bill Russell",             decade:"1960s", pos:"C",  positions:["C"],           team:"Celtics",         pts:16.2, reb:23.6, ast:4.3,  stl:0.0, blk:0.0 , mvp:5, fmvp:0, dpoy:0, an1:3, an2:4, an3:0, ad1:0, ad2:0, win:10, pop:9 },
  { id:"oscar-60s",  name:"Oscar Robertson",          decade:"1960s", pos:"PG", positions:["PG","SG"],     team:"Royals",          pts:30.8, reb:10.4, ast:11.4, stl:0.0, blk:0.0 , mvp:1, fmvp:0, dpoy:0, an1:6, an2:2, an3:0, ad1:0, ad2:0, win:5, pop:9 },
  { id:"jerry-60s",  name:"Jerry West",               decade:"1960s", pos:"PG", positions:["PG","SG"],     team:"Lakers",          pts:27.0, reb:5.8,  ast:6.7,  stl:0.0, blk:0.0 , mvp:0, fmvp:1, dpoy:0, an1:4, an2:2, an3:0, ad1:0, ad2:0, win:6, pop:9 },
  { id:"elgin-60s",  name:"Elgin Baylor",             decade:"1960s", pos:"SF", positions:["SF","PF"],     team:"Lakers",          pts:34.8, reb:19.8, ast:4.6,  stl:0.0, blk:0.0 , mvp:0, fmvp:0, dpoy:0, an1:5, an2:4, an3:0, ad1:0, ad2:0, win:5, pop:8 },
  { id:"hal-60s",    name:"Hal Greer",                decade:"1960s", pos:"SG", positions:["SG","PG"],     team:"76ers",           pts:22.1, reb:5.3,  ast:4.5,  stl:0.0, blk:0.0 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:1, an3:2, ad1:0, ad2:0, win:6, pop:5 },
  { id:"nate-60s",   name:"Nate Thurmond",            decade:"1960s", pos:"C",  positions:["C","PF"],      team:"Warriors",        pts:17.0, reb:22.0, ast:2.1,  stl:0.0, blk:0.0 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:1, an3:0, ad1:0, ad2:0, win:5, pop:6 },
  { id:"willis-60s", name:"Willis Reed",              decade:"1960s", pos:"C",  positions:["C","PF"],      team:"Knicks",          pts:18.7, reb:12.9, ast:1.8,  stl:0.0, blk:0.0 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:1, an3:0, ad1:0, ad2:0, win:5, pop:7 },
  { id:"bob-60s",    name:"Bob Pettit",               decade:"1960s", pos:"PF", positions:["PF","C"],      team:"Hawks",           pts:27.9, reb:20.3, ast:3.6,  stl:0.0, blk:0.0 , mvp:0, fmvp:0, dpoy:0, an1:3, an2:2, an3:0, ad1:0, ad2:0, win:5, pop:7 },
  { id:"sam-60s",    name:"Sam Jones",                decade:"1960s", pos:"SG", positions:["SG","PG"],     team:"Celtics",         pts:18.9, reb:4.4,  ast:3.0,  stl:0.0, blk:0.0 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:10, pop:6 },
  { id:"lenny-60s",  name:"Lenny Wilkens",            decade:"1960s", pos:"PG", positions:["PG","SG"],     team:"Hawks",           pts:16.5, reb:6.1,  ast:8.0,  stl:0.0, blk:0.0 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:5, pop:6 },
  { id:"dave-60s",   name:"Dave Bing",                decade:"1960s", pos:"PG", positions:["PG","SG"],     team:"Pistons",         pts:20.0, reb:4.0,  ast:6.0,  stl:0.0, blk:0.0 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:1, an3:0, ad1:0, ad2:0, win:4, pop:6 },
  { id:"john-h-60s", name:"John Havlicek",            decade:"1960s", pos:"SF", positions:["SF","SG"],     team:"Celtics",         pts:20.8, reb:6.3,  ast:4.8,  stl:1.2, blk:0.4 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:1, ad1:0, ad2:0, win:8, pop:7 },
  { id:"billy-60s",  name:"Billy Cunningham",         decade:"1960s", pos:"PF", positions:["PF","SF"],     team:"76ers",           pts:21.0, reb:10.1, ast:4.3,  stl:0.0, blk:0.0 , mvp:0, fmvp:0, dpoy:0, an1:1, an2:1, an3:0, ad1:0, ad2:0, win:5, pop:6 },
  // ═══ 1970s ═══
  { id:"kareem-70s", name:"Kareem Abdul-Jabbar",      decade:"1970s", pos:"C",  positions:["C"],           team:"Bucks/Lakers",    pts:29.9, reb:14.5, ast:3.5,  stl:0.9, blk:3.5 , mvp:3, fmvp:1, dpoy:0, an1:5, an2:0, an3:0, ad1:3, ad2:0, win:7, pop:9 },
  { id:"julius-70s", name:"Julius Erving",            decade:"1970s", pos:"SF", positions:["SF","PF"],     team:"Nets/76ers",      pts:28.7, reb:12.1, ast:5.0,  stl:2.3, blk:2.1 , mvp:3, fmvp:0, dpoy:0, an1:4, an2:1, an3:0, ad1:0, ad2:0, win:7, pop:10 },
  { id:"pete-70s",   name:"Pete Maravich",            decade:"1970s", pos:"PG", positions:["PG","SG"],     team:"Jazz",            pts:31.1, reb:5.4,  ast:5.4,  stl:1.4, blk:0.2 , mvp:0, fmvp:0, dpoy:0, an1:1, an2:1, an3:0, ad1:0, ad2:0, win:4, pop:8 },
  { id:"bob-mc-70s", name:"Bob McAdoo",               decade:"1970s", pos:"C",  positions:["C","PF"],      team:"Braves",          pts:30.6, reb:13.2, ast:3.0,  stl:1.0, blk:2.0 , mvp:1, fmvp:0, dpoy:0, an1:1, an2:1, an3:0, ad1:0, ad2:0, win:5, pop:6 },
  { id:"rick-70s",   name:"Rick Barry",               decade:"1970s", pos:"SF", positions:["SF","SG"],     team:"Warriors",        pts:25.9, reb:7.5,  ast:5.1,  stl:2.3, blk:0.7 , mvp:0, fmvp:1, dpoy:0, an1:2, an2:2, an3:0, ad1:0, ad2:2, win:6, pop:7 },
  { id:"elvin-70s",  name:"Elvin Hayes",              decade:"1970s", pos:"PF", positions:["PF","C"],      team:"Bullets",         pts:21.0, reb:17.1, ast:2.0,  stl:1.4, blk:2.0 , mvp:0, fmvp:0, dpoy:0, an1:1, an2:2, an3:1, ad1:1, ad2:1, win:6, pop:6 },
  { id:"dave-c-70s", name:"Dave Cowens",              decade:"1970s", pos:"C",  positions:["C","PF"],      team:"Celtics",         pts:19.8, reb:15.2, ast:4.2,  stl:1.2, blk:0.8 , mvp:1, fmvp:0, dpoy:0, an1:1, an2:2, an3:0, ad1:0, ad2:0, win:7, pop:6 },
  { id:"tiny-70s",   name:"Nate Archibald",           decade:"1970s", pos:"PG", positions:["PG"],          team:"Kings",           pts:28.2, reb:4.7,  ast:11.4, stl:1.5, blk:0.1 , mvp:0, fmvp:0, dpoy:0, an1:1, an2:0, an3:0, ad1:0, ad2:0, win:4, pop:6 },
  { id:"george-70s", name:"George Gervin",            decade:"1970s", pos:"SG", positions:["SG","SF"],     team:"Spurs",           pts:27.1, reb:5.5,  ast:3.6,  stl:1.3, blk:0.8 , mvp:0, fmvp:0, dpoy:0, an1:3, an2:2, an3:0, ad1:0, ad2:0, win:5, pop:8 },
  { id:"artis-70s",  name:"Artis Gilmore",            decade:"1970s", pos:"C",  positions:["C"],           team:"Bulls",           pts:22.3, reb:17.1, ast:2.8,  stl:1.0, blk:2.9 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:1, an3:0, ad1:0, ad2:0, win:5, pop:5 },
  { id:"john-h-70s", name:"John Havlicek",            decade:"1970s", pos:"SF", positions:["SF","SG"],     team:"Celtics",         pts:22.6, reb:7.2,  ast:5.5,  stl:1.5, blk:0.5 , mvp:0, fmvp:1, dpoy:0, an1:4, an2:0, an3:0, ad1:3, ad2:2, win:7, pop:8 },
  { id:"wilt-70s",   name:"Wilt Chamberlain",         decade:"1970s", pos:"C",  positions:["C"],           team:"Lakers",          pts:14.8, reb:19.2, ast:4.1,  stl:0.0, blk:0.0 , mvp:0, fmvp:0, dpoy:0, an1:1, an2:0, an3:0, ad1:1, ad2:0, win:6, pop:8 },
  { id:"oscar-70s",  name:"Oscar Robertson",          decade:"1970s", pos:"PG", positions:["PG","SG"],     team:"Bucks",           pts:15.5, reb:5.7,  ast:8.2,  stl:0.0, blk:0.0 , mvp:0, fmvp:1, dpoy:0, an1:0, an2:2, an3:0, ad1:1, ad2:0, win:7, pop:8 },
  { id:"walt-70s",   name:"Walt Frazier",             decade:"1970s", pos:"PG", positions:["PG","SG"],     team:"Knicks",          pts:19.3, reb:6.1,  ast:6.9,  stl:1.8, blk:0.3 , mvp:0, fmvp:0, dpoy:0, an1:2, an2:2, an3:0, ad1:5, ad2:2, win:7, pop:8 },
  { id:"bob-l-70s",  name:"Bob Lanier",               decade:"1970s", pos:"C",  positions:["C","PF"],      team:"Pistons",         pts:22.7, reb:11.3, ast:3.1,  stl:0.9, blk:1.6 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:1, an3:1, ad1:0, ad2:0, win:4, pop:5 },
  { id:"gail-70s",   name:"Gail Goodrich",            decade:"1970s", pos:"SG", positions:["SG","PG"],     team:"Lakers",          pts:22.0, reb:3.5,  ast:5.3,  stl:1.1, blk:0.2 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:1, an3:0, ad1:0, ad2:0, win:6, pop:5 },
  { id:"spencer-70s",name:"Spencer Haywood",          decade:"1970s", pos:"PF", positions:["PF","C"],      team:"Sonics",          pts:24.9, reb:12.1, ast:1.5,  stl:1.1, blk:1.2 , mvp:0, fmvp:0, dpoy:0, an1:2, an2:1, an3:0, ad1:0, ad2:0, win:4, pop:5 },
  // ═══ 1980s ═══
  { id:"magic-80s",  name:"Magic Johnson",            decade:"1980s", pos:"PG", positions:["PG","SF"],     team:"Lakers",          pts:20.0, reb:7.7,  ast:12.3, stl:1.9, blk:0.4 , mvp:3, fmvp:3, dpoy:0, an1:8, an2:1, an3:0, ad1:0, ad2:0, win:9, pop:10 },
  { id:"bird-80s",   name:"Larry Bird",               decade:"1980s", pos:"SF", positions:["SF","PF"],     team:"Celtics",         pts:25.8, reb:10.4, ast:7.0,  stl:1.8, blk:0.9 , mvp:3, fmvp:2, dpoy:0, an1:9, an2:0, an3:0, ad1:0, ad2:0, win:9, pop:10 },
  { id:"jordan-80s", name:"Michael Jordan",           decade:"1980s", pos:"SG", positions:["SG","SF"],     team:"Bulls",           pts:32.4, reb:6.4,  ast:5.5,  stl:2.6, blk:1.2 , mvp:1, fmvp:0, dpoy:1, an1:3, an2:2, an3:0, ad1:7, ad2:2, win:5, pop:10 },
  { id:"kareem-80s", name:"Kareem Abdul-Jabbar",      decade:"1980s", pos:"C",  positions:["C"],           team:"Lakers",          pts:22.6, reb:9.5,  ast:2.8,  stl:0.9, blk:2.3 , mvp:1, fmvp:2, dpoy:0, an1:4, an2:3, an3:0, ad1:0, ad2:0, win:9, pop:9 },
  { id:"julius-80s", name:"Julius Erving",            decade:"1980s", pos:"SF", positions:["SF","PF"],     team:"76ers",           pts:22.4, reb:6.8,  ast:3.9,  stl:1.7, blk:1.3 , mvp:1, fmvp:1, dpoy:0, an1:2, an2:2, an3:0, ad1:0, ad2:0, win:7, pop:9 },
  { id:"isiah-80s",  name:"Isiah Thomas",             decade:"1980s", pos:"PG", positions:["PG"],          team:"Pistons",         pts:19.2, reb:3.6,  ast:9.3,  stl:1.9, blk:0.3 , mvp:0, fmvp:2, dpoy:0, an1:1, an2:5, an3:1, ad1:0, ad2:1, win:7, pop:8 },
  { id:"moses-80s",  name:"Moses Malone",             decade:"1980s", pos:"C",  positions:["C","PF"],      team:"76ers/Rockets",   pts:24.5, reb:13.1, ast:1.3,  stl:0.8, blk:1.7 , mvp:1, fmvp:1, dpoy:0, an1:3, an2:3, an3:0, ad1:0, ad2:0, win:7, pop:7 },
  { id:"alex-80s",   name:"Alex English",             decade:"1980s", pos:"SF", positions:["SF","SG"],     team:"Nuggets",         pts:26.4, reb:6.0,  ast:4.0,  stl:1.1, blk:0.7 , mvp:0, fmvp:0, dpoy:0, an1:1, an2:2, an3:2, ad1:0, ad2:0, win:5, pop:6 },
  { id:"dom-80s",    name:"Dominique Wilkins",        decade:"1980s", pos:"SF", positions:["SF","SG"],     team:"Hawks",           pts:27.4, reb:6.8,  ast:2.8,  stl:1.4, blk:0.8 , mvp:0, fmvp:0, dpoy:0, an1:1, an2:5, an3:1, ad1:0, ad2:0, win:4, pop:8 },
  { id:"charles-80s",name:"Charles Barkley",          decade:"1980s", pos:"PF", positions:["PF","C"],      team:"76ers",           pts:23.0, reb:11.9, ast:3.4,  stl:1.6, blk:0.9 , mvp:0, fmvp:0, dpoy:0, an1:1, an2:3, an3:1, ad1:0, ad2:0, win:5, pop:8 },
  { id:"clyde-80s",  name:"Clyde Drexler",            decade:"1980s", pos:"SG", positions:["SG","SF"],     team:"Blazers",         pts:21.5, reb:6.5,  ast:5.8,  stl:2.1, blk:0.7 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:3, an3:2, ad1:0, ad2:2, win:5, pop:7 },
  { id:"mcHale-80s", name:"Kevin McHale",             decade:"1980s", pos:"PF", positions:["PF","C"],      team:"Celtics",         pts:21.3, reb:8.6,  ast:2.3,  stl:0.6, blk:1.8 , mvp:0, fmvp:0, dpoy:0, an1:1, an2:5, an3:0, ad1:0, ad2:0, win:9, pop:7 },
  { id:"parish-80s", name:"Robert Parish",            decade:"1980s", pos:"C",  positions:["C"],           team:"Celtics",         pts:18.3, reb:10.6, ast:2.1,  stl:0.9, blk:1.4 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:2, an3:1, ad1:0, ad2:0, win:9, pop:6 },
  { id:"george-80s", name:"George Gervin",            decade:"1980s", pos:"SG", positions:["SG","SF"],     team:"Spurs",           pts:25.9, reb:4.6,  ast:3.5,  stl:1.2, blk:0.7 , mvp:0, fmvp:0, dpoy:0, an1:1, an2:2, an3:0, ad1:0, ad2:0, win:5, pop:7 },
  { id:"dantley-80s",name:"Adrian Dantley",           decade:"1980s", pos:"SF", positions:["SF","SG"],     team:"Jazz",            pts:29.6, reb:6.0,  ast:3.0,  stl:1.1, blk:0.3 , mvp:0, fmvp:0, dpoy:0, an1:1, an2:1, an3:2, ad1:0, ad2:0, win:5, pop:5 },
  { id:"jack-80s",   name:"Jack Sikma",               decade:"1980s", pos:"C",  positions:["C","PF"],      team:"Sonics",          pts:15.6, reb:10.9, ast:3.4,  stl:1.0, blk:0.8 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:1, ad1:0, ad2:0, win:5, pop:4 },
  { id:"walton-80s", name:"Bill Walton",              decade:"1980s", pos:"C",  positions:["C"],           team:"Celtics",         pts:10.3, reb:9.3,  ast:2.4,  stl:0.6, blk:1.3 , mvp:0, fmvp:0, dpoy:0, an1:1, an2:0, an3:0, ad1:0, ad2:0, win:8, pop:6 },
  { id:"mark-80s",   name:"Mark Aguirre",             decade:"1980s", pos:"SF", positions:["SF","PF"],     team:"Mavericks",       pts:24.6, reb:6.4,  ast:4.1,  stl:0.9, blk:0.4 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:1, an3:0, ad1:0, ad2:0, win:5, pop:5 },
  { id:"terry-80s",  name:"Terry Cummings",           decade:"1980s", pos:"PF", positions:["PF","SF"],     team:"Bucks",           pts:23.0, reb:9.3,  ast:2.0,  stl:1.1, blk:0.7 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:1, an3:0, ad1:0, ad2:0, win:4, pop:4 },
  // ═══ 1990s ═══
  { id:"jordan-90s", name:"Michael Jordan",           decade:"1990s", pos:"SG", positions:["SG","SF"],     team:"Bulls",           pts:31.5, reb:6.4,  ast:5.5,  stl:2.4, blk:0.8 , mvp:5, fmvp:6, dpoy:0, an1:7, an2:2, an3:0, ad1:8, ad2:0, win:10, pop:10 },
  { id:"pippen-90s", name:"Scottie Pippen",           decade:"1990s", pos:"SF", positions:["SF","SG","PF"],team:"Bulls",           pts:18.5, reb:7.3,  ast:6.0,  stl:2.2, blk:0.9 , mvp:0, fmvp:0, dpoy:0, an1:3, an2:2, an3:2, ad1:8, ad2:1, win:10, pop:9 },
  { id:"hak-90s",    name:"Hakeem Olajuwon",          decade:"1990s", pos:"C",  positions:["C"],           team:"Rockets",         pts:27.8, reb:11.9, ast:3.4,  stl:1.8, blk:3.7 , mvp:1, fmvp:2, dpoy:2, an1:6, an2:3, an3:0, ad1:5, ad2:0, win:7, pop:9 },
  { id:"rob-90s",    name:"David Robinson",           decade:"1990s", pos:"C",  positions:["C","PF"],      team:"Spurs",           pts:23.2, reb:10.8, ast:2.5,  stl:1.7, blk:3.0 , mvp:1, fmvp:0, dpoy:1, an1:4, an2:4, an3:0, ad1:4, ad2:2, win:6, pop:8 },
  { id:"barkley-90s",name:"Charles Barkley",          decade:"1990s", pos:"PF", positions:["PF","C"],      team:"Suns",            pts:24.6, reb:11.6, ast:4.1,  stl:1.5, blk:0.9 , mvp:1, fmvp:0, dpoy:0, an1:5, an2:4, an3:0, ad1:0, ad2:0, win:5, pop:9 },
  { id:"stock-90s",  name:"John Stockton",            decade:"1990s", pos:"PG", positions:["PG"],          team:"Jazz",            pts:14.7, reb:3.2,  ast:11.3, stl:2.2, blk:0.2 , mvp:0, fmvp:0, dpoy:0, an1:2, an2:5, an3:0, ad1:5, ad2:0, win:6, pop:8 },
  { id:"malone-90s", name:"Karl Malone",              decade:"1990s", pos:"PF", positions:["PF","C"],      team:"Jazz",            pts:27.4, reb:10.1, ast:4.1,  stl:1.6, blk:0.8 , mvp:2, fmvp:0, dpoy:0, an1:7, an2:2, an3:0, ad1:0, ad2:0, win:6, pop:8 },
  { id:"ewing-90s",  name:"Patrick Ewing",            decade:"1990s", pos:"C",  positions:["C"],           team:"Knicks",          pts:23.7, reb:11.0, ast:2.1,  stl:1.0, blk:2.7 , mvp:0, fmvp:0, dpoy:0, an1:1, an2:4, an3:2, ad1:0, ad2:1, win:5, pop:7 },
  { id:"shaq-90s",   name:"Shaquille O'Neal",         decade:"1990s", pos:"C",  positions:["C"],           team:"Magic",           pts:27.2, reb:12.5, ast:2.7,  stl:0.5, blk:2.8 , mvp:0, fmvp:0, dpoy:0, an1:2, an2:3, an3:0, ad1:0, ad2:0, win:4, pop:9 },
  { id:"penny-90s",  name:"Penny Hardaway",           decade:"1990s", pos:"PG", positions:["PG","SG"],     team:"Magic",           pts:20.7, reb:6.0,  ast:7.2,  stl:1.7, blk:0.9 , mvp:0, fmvp:0, dpoy:0, an1:1, an2:1, an3:1, ad1:0, ad2:1, win:5, pop:8 },
  { id:"kemp-90s",   name:"Shawn Kemp",               decade:"1990s", pos:"PF", positions:["PF","C"],      team:"Sonics",          pts:19.6, reb:10.9, ast:2.0,  stl:1.0, blk:1.8 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:3, ad1:0, ad2:0, win:5, pop:6 },
  { id:"reggie-90s", name:"Reggie Miller",            decade:"1990s", pos:"SG", positions:["SG"],          team:"Pacers",          pts:19.6, reb:3.2,  ast:3.0,  stl:1.2, blk:0.2 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:1, an3:3, ad1:0, ad2:0, win:5, pop:7 },
  { id:"gary-90s",   name:"Gary Payton",              decade:"1990s", pos:"PG", positions:["PG","SG"],     team:"Sonics",          pts:21.8, reb:4.9,  ast:8.7,  stl:2.5, blk:0.2 , mvp:0, fmvp:0, dpoy:1, an1:2, an2:3, an3:2, ad1:6, ad2:3, win:5, pop:8 },
  { id:"dom-90s",    name:"Dominique Wilkins",        decade:"1990s", pos:"SF", positions:["SF","SG"],     team:"Hawks",           pts:26.0, reb:7.0,  ast:2.6,  stl:1.1, blk:0.6 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:1, an3:2, ad1:0, ad2:0, win:4, pop:7 },
  { id:"grant-90s",  name:"Grant Hill",               decade:"1990s", pos:"SF", positions:["SF","SG","PF"],team:"Pistons",         pts:21.6, reb:7.9,  ast:6.3,  stl:1.4, blk:0.6 , mvp:0, fmvp:0, dpoy:0, an1:2, an2:1, an3:0, ad1:0, ad2:0, win:4, pop:8 },
  { id:"kidd-90s",   name:"Jason Kidd",               decade:"1990s", pos:"PG", positions:["PG"],          team:"Suns",            pts:15.0, reb:7.1,  ast:9.4,  stl:2.4, blk:0.3 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:1, an3:1, ad1:0, ad2:3, win:4, pop:6 },
  { id:"mitch-90s",  name:"Mitch Richmond",           decade:"1990s", pos:"SG", positions:["SG"],          team:"Kings",           pts:23.2, reb:3.8,  ast:3.8,  stl:1.6, blk:0.3 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:1, an3:2, ad1:0, ad2:0, win:4, pop:5 },
  { id:"isiah-90s",  name:"Isiah Thomas",             decade:"1990s", pos:"PG", positions:["PG"],          team:"Pistons",         pts:20.8, reb:4.2,  ast:10.2, stl:2.0, blk:0.3 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:1, an3:3, ad1:0, ad2:0, win:6, pop:7 },
  { id:"clyde-90s",  name:"Clyde Drexler",            decade:"1990s", pos:"SG", positions:["SG","SF"],     team:"Blazers",         pts:20.4, reb:6.0,  ast:5.4,  stl:2.0, blk:0.7 , mvp:0, fmvp:1, dpoy:0, an1:1, an2:1, an3:2, ad1:0, ad2:0, win:6, pop:7 },
  { id:"dumars-90s", name:"Joe Dumars",               decade:"1990s", pos:"SG", positions:["SG","PG"],     team:"Pistons",         pts:19.3, reb:3.2,  ast:4.7,  stl:1.2, blk:0.2 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:1, ad1:2, ad2:2, win:7, pop:6 },
  { id:"glen-90s",   name:"Glen Rice",                decade:"1990s", pos:"SF", positions:["SF","SG"],     team:"Heat/Hornets",    pts:20.1, reb:4.9,  ast:2.7,  stl:1.0, blk:0.4 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:1, an3:0, ad1:0, ad2:0, win:5, pop:5 },
  { id:"alonzo-90s", name:"Alonzo Mourning",          decade:"1990s", pos:"C",  positions:["C"],           team:"Heat",            pts:21.2, reb:10.0, ast:1.3,  stl:0.7, blk:3.0 , mvp:0, fmvp:0, dpoy:1, an1:0, an2:4, an3:0, ad1:0, ad2:0, win:5, pop:6 },
  { id:"larry-j-90s",name:"Larry Johnson",            decade:"1990s", pos:"PF", positions:["PF","SF"],     team:"Hornets",         pts:19.2, reb:8.4,  ast:3.9,  stl:1.0, blk:0.4 , mvp:0, fmvp:0, dpoy:0, an1:1, an2:1, an3:0, ad1:0, ad2:0, win:4, pop:6 },
  { id:"dik-90s",    name:"Dikembe Mutombo",          decade:"1990s", pos:"C",  positions:["C"],           team:"Nuggets/Hawks",   pts:11.5, reb:12.5, ast:1.5,  stl:0.5, blk:3.3 , mvp:0, fmvp:0, dpoy:2, an1:0, an2:2, an3:2, ad1:4, ad2:2, win:5, pop:6 },
  { id:"webb-90s",   name:"Chris Webber",             decade:"1990s", pos:"PF", positions:["PF","C"],      team:"Kings",           pts:21.0, reb:9.7,  ast:4.2,  stl:1.3, blk:1.4 , mvp:0, fmvp:0, dpoy:0, an1:1, an2:2, an3:1, ad1:0, ad2:0, win:4, pop:6 },
  // ═══ 2000s ═══
  { id:"shaq-00s",   name:"Shaquille O'Neal",         decade:"2000s", pos:"C",  positions:["C"],           team:"Lakers/Heat",     pts:26.0, reb:10.4, ast:2.9,  stl:0.6, blk:2.2 , mvp:1, fmvp:3, dpoy:0, an1:4, an2:3, an3:0, ad1:0, ad2:0, win:8, pop:10 },
  { id:"kobe-00s",   name:"Kobe Bryant",              decade:"2000s", pos:"SG", positions:["SG","SF"],     team:"Lakers",          pts:28.5, reb:5.4,  ast:5.0,  stl:1.5, blk:0.5 , mvp:1, fmvp:1, dpoy:0, an1:7, an2:2, an3:0, ad1:8, ad2:1, win:7, pop:10 },
  { id:"lebron-00s", name:"LeBron James",             decade:"2000s", pos:"SF", positions:["SF","PF","PG"],team:"Cavaliers",       pts:27.8, reb:7.0,  ast:7.0,  stl:1.7, blk:0.8 , mvp:1, fmvp:0, dpoy:0, an1:5, an2:3, an3:0, ad1:4, ad2:3, win:5, pop:10 },
  { id:"duncan-00s", name:"Tim Duncan",               decade:"2000s", pos:"PF", positions:["PF","C"],      team:"Spurs",           pts:22.3, reb:12.2, ast:3.1,  stl:0.7, blk:2.5 , mvp:2, fmvp:3, dpoy:0, an1:8, an2:1, an3:0, ad1:4, ad2:4, win:8, pop:9 },
  { id:"kidd-00s",   name:"Jason Kidd",               decade:"2000s", pos:"PG", positions:["PG"],          team:"Nets",            pts:15.5, reb:7.2,  ast:9.4,  stl:2.1, blk:0.4 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:3, an3:2, ad1:4, ad2:3, win:5, pop:7 },
  { id:"ai-00s",     name:"Allen Iverson",            decade:"2000s", pos:"PG", positions:["PG","SG"],     team:"76ers",           pts:31.0, reb:4.5,  ast:6.8,  stl:2.4, blk:0.3 , mvp:1, fmvp:0, dpoy:0, an1:3, an2:3, an3:1, ad1:0, ad2:0, win:4, pop:9 },
  { id:"tmac-00s",   name:"Tracy McGrady",            decade:"2000s", pos:"SG", positions:["SG","SF"],     team:"Magic/Rockets",   pts:27.5, reb:6.8,  ast:5.4,  stl:1.5, blk:1.1 , mvp:0, fmvp:0, dpoy:0, an1:2, an2:3, an3:0, ad1:0, ad2:0, win:3, pop:8 },
  { id:"dirk-00s",   name:"Dirk Nowitzki",            decade:"2000s", pos:"PF", positions:["PF","C"],      team:"Mavericks",       pts:24.6, reb:8.7,  ast:2.7,  stl:0.8, blk:0.9 , mvp:1, fmvp:0, dpoy:0, an1:4, an2:3, an3:2, ad1:0, ad2:0, win:5, pop:8 },
  { id:"wade-00s",   name:"Dwyane Wade",              decade:"2000s", pos:"SG", positions:["SG","SF"],     team:"Heat",            pts:25.5, reb:5.2,  ast:6.2,  stl:1.8, blk:0.9 , mvp:0, fmvp:1, dpoy:0, an1:2, an2:4, an3:1, ad1:0, ad2:1, win:6, pop:9 },
  { id:"cp3-00s",    name:"Chris Paul",               decade:"2000s", pos:"PG", positions:["PG"],          team:"Hornets",         pts:18.6, reb:4.8,  ast:10.7, stl:2.7, blk:0.2 , mvp:0, fmvp:0, dpoy:0, an1:3, an2:2, an3:3, ad1:6, ad2:2, win:4, pop:8 },
  { id:"kg-00s",     name:"Kevin Garnett",            decade:"2000s", pos:"PF", positions:["PF","C"],      team:"Timberwolves",    pts:22.4, reb:12.2, ast:4.9,  stl:1.4, blk:1.8 , mvp:1, fmvp:0, dpoy:1, an1:4, an2:3, an3:2, ad1:4, ad2:4, win:5, pop:8 },
  { id:"pierce-00s", name:"Paul Pierce",              decade:"2000s", pos:"SF", positions:["SF","SG"],     team:"Celtics",         pts:22.1, reb:6.2,  ast:3.8,  stl:1.4, blk:0.6 , mvp:0, fmvp:1, dpoy:0, an1:0, an2:1, an3:3, ad1:0, ad2:0, win:5, pop:7 },
  { id:"carmelo-00s",name:"Carmelo Anthony",          decade:"2000s", pos:"SF", positions:["SF","PF"],     team:"Nuggets",         pts:26.3, reb:7.8,  ast:3.3,  stl:1.2, blk:0.5 , mvp:0, fmvp:0, dpoy:0, an1:1, an2:3, an3:1, ad1:0, ad2:0, win:4, pop:7 },
  { id:"vince-00s",  name:"Vince Carter",             decade:"2000s", pos:"SG", positions:["SG","SF"],     team:"Raptors",         pts:23.4, reb:5.3,  ast:3.6,  stl:1.3, blk:0.8 , mvp:0, fmvp:0, dpoy:0, an1:1, an2:2, an3:1, ad1:0, ad2:0, win:3, pop:7 },
  { id:"ray-00s",    name:"Ray Allen",                decade:"2000s", pos:"SG", positions:["SG"],          team:"Sonics",          pts:23.0, reb:4.4,  ast:4.1,  stl:1.2, blk:0.2 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:1, an3:2, ad1:0, ad2:0, win:6, pop:6 },
  { id:"yao-00s",    name:"Yao Ming",                 decade:"2000s", pos:"C",  positions:["C"],           team:"Rockets",         pts:19.0, reb:9.2,  ast:1.9,  stl:0.6, blk:2.0 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:2, an3:2, ad1:0, ad2:0, win:3, pop:7 },
  { id:"amare-00s",  name:"Amar'e Stoudemire",        decade:"2000s", pos:"PF", positions:["PF","C"],      team:"Suns",            pts:24.0, reb:8.9,  ast:1.7,  stl:0.8, blk:1.6 , mvp:0, fmvp:0, dpoy:0, an1:1, an2:2, an3:2, ad1:0, ad2:0, win:4, pop:6 },
  { id:"arenas-00s", name:"Gilbert Arenas",           decade:"2000s", pos:"PG", positions:["PG","SG"],     team:"Wizards",         pts:28.4, reb:4.6,  ast:6.0,  stl:1.7, blk:0.3 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:1, an3:2, ad1:0, ad2:0, win:3, pop:6 },
  { id:"bosh-00s",   name:"Chris Bosh",               decade:"2000s", pos:"PF", positions:["PF","C"],      team:"Raptors",         pts:22.6, reb:9.0,  ast:2.3,  stl:0.8, blk:1.3 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:1, an3:2, ad1:0, ad2:0, win:4, pop:5 },
  { id:"ben-00s",    name:"Ben Wallace",              decade:"2000s", pos:"C",  positions:["C","PF"],      team:"Pistons",         pts:6.6,  reb:12.8, ast:1.5,  stl:1.3, blk:2.4 , mvp:0, fmvp:1, dpoy:4, an1:0, an2:0, an3:2, ad1:5, ad2:3, win:6, pop:6 },
  { id:"rip-00s",    name:"Richard Hamilton",         decade:"2000s", pos:"SG", positions:["SG","SF"],     team:"Pistons",         pts:20.1, reb:3.6,  ast:3.9,  stl:1.2, blk:0.2 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:1, ad1:0, ad2:0, win:6, pop:5 },
  { id:"melo-f-00s", name:"Pau Gasol",                decade:"2000s", pos:"PF", positions:["PF","C"],      team:"Grizzlies/Lakers",pts:19.8, reb:9.8,  ast:3.2,  stl:0.7, blk:1.6 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:2, an3:3, ad1:0, ad2:0, win:5, pop:6 },
  // ═══ 2010s ═══
  { id:"lebron-10s", name:"LeBron James",             decade:"2010s", pos:"SF", positions:["SF","PF","PG"],team:"Heat/Cavaliers",  pts:27.1, reb:7.5,  ast:7.4,  stl:1.6, blk:0.9 , mvp:3, fmvp:3, dpoy:0, an1:8, an2:1, an3:0, ad1:4, ad2:2, win:8, pop:10 },
  { id:"kobe-10s",   name:"Kobe Bryant",              decade:"2010s", pos:"SG", positions:["SG","SF"],     team:"Lakers",          pts:27.4, reb:5.3,  ast:4.6,  stl:1.4, blk:0.4 , mvp:0, fmvp:2, dpoy:0, an1:2, an2:4, an3:2, ad1:2, ad2:3, win:6, pop:10 },
  { id:"durant-10s", name:"Kevin Durant",             decade:"2010s", pos:"SF", positions:["SF","PF","SG"],team:"Thunder/Warriors",pts:27.1, reb:7.4,  ast:4.4,  stl:1.1, blk:1.1 , mvp:1, fmvp:1, dpoy:0, an1:6, an2:3, an3:0, ad1:0, ad2:0, win:6, pop:9 },
  { id:"curry-10s",  name:"Stephen Curry",            decade:"2010s", pos:"PG", positions:["PG","SG"],     team:"Warriors",        pts:26.4, reb:5.1,  ast:6.8,  stl:1.9, blk:0.2 , mvp:2, fmvp:0, dpoy:0, an1:7, an2:2, an3:0, ad1:0, ad2:0, win:7, pop:10 },
  { id:"russ-10s",   name:"Russell Westbrook",        decade:"2010s", pos:"PG", positions:["PG","SG"],     team:"Thunder",         pts:23.5, reb:7.3,  ast:8.7,  stl:1.7, blk:0.3 , mvp:1, fmvp:0, dpoy:0, an1:2, an2:4, an3:2, ad1:0, ad2:0, win:4, pop:8 },
  { id:"harden-10s", name:"James Harden",             decade:"2010s", pos:"SG", positions:["SG","PG"],     team:"Rockets",         pts:29.6, reb:5.8,  ast:8.1,  stl:1.6, blk:0.7 , mvp:1, fmvp:0, dpoy:0, an1:3, an2:4, an3:1, ad1:0, ad2:0, win:4, pop:8 },
  { id:"kawhi-10s",  name:"Kawhi Leonard",            decade:"2010s", pos:"SF", positions:["SF","SG","PF"],team:"Spurs/Raptors",   pts:19.6, reb:6.3,  ast:3.0,  stl:1.9, blk:0.5 , mvp:0, fmvp:2, dpoy:2, an1:2, an2:2, an3:2, ad1:5, ad2:2, win:7, pop:8 },
  { id:"dame-10s",   name:"Damian Lillard",           decade:"2010s", pos:"PG", positions:["PG"],          team:"Blazers",         pts:24.5, reb:4.2,  ast:6.8,  stl:0.9, blk:0.3 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:3, an3:3, ad1:0, ad2:0, win:3, pop:7 },
  { id:"cp3-10s",    name:"Chris Paul",               decade:"2010s", pos:"PG", positions:["PG"],          team:"Clippers",        pts:18.0, reb:4.7,  ast:10.2, stl:2.3, blk:0.1 , mvp:0, fmvp:0, dpoy:0, an1:3, an2:4, an3:1, ad1:6, ad2:3, win:4, pop:8 },
  { id:"giannis-10s",name:"Giannis Antetokounmpo",    decade:"2010s", pos:"PF", positions:["PF","SF","C"], team:"Bucks",           pts:22.9, reb:8.7,  ast:4.8,  stl:1.3, blk:1.4 , mvp:1, fmvp:0, dpoy:1, an1:3, an2:2, an3:1, ad1:2, ad2:2, win:5, pop:9 },
  { id:"ad-10s",     name:"Anthony Davis",            decade:"2010s", pos:"PF", positions:["PF","C"],      team:"Pelicans",        pts:24.3, reb:10.5, ast:2.2,  stl:1.4, blk:2.5 , mvp:0, fmvp:0, dpoy:0, an1:1, an2:3, an3:3, ad1:0, ad2:3, win:4, pop:7 },
  { id:"kyrie-10s",  name:"Kyrie Irving",             decade:"2010s", pos:"PG", positions:["PG","SG"],     team:"Cavaliers",       pts:22.8, reb:3.8,  ast:5.7,  stl:1.3, blk:0.4 , mvp:0, fmvp:1, dpoy:0, an1:1, an2:3, an3:2, ad1:0, ad2:0, win:5, pop:8 },
  { id:"luka-10s",   name:"Luka Doncic",              decade:"2010s", pos:"PG", positions:["PG","SF"],     team:"Mavericks",       pts:24.4, reb:8.0,  ast:7.1,  stl:1.1, blk:0.4 , mvp:0, fmvp:0, dpoy:0, an1:1, an2:2, an3:0, ad1:0, ad2:0, win:3, pop:7 },
  { id:"jokic-10s",  name:"Nikola Jokic",             decade:"2010s", pos:"C",  positions:["C","PF"],      team:"Nuggets",         pts:18.6, reb:9.8,  ast:6.0,  stl:1.2, blk:0.6 , mvp:0, fmvp:0, dpoy:0, an1:1, an2:1, an3:0, ad1:0, ad2:0, win:4, pop:6 },
  { id:"embiid-10s", name:"Joel Embiid",              decade:"2010s", pos:"C",  positions:["C","PF"],      team:"76ers",           pts:23.6, reb:10.9, ast:3.0,  stl:0.9, blk:1.8 , mvp:0, fmvp:0, dpoy:0, an1:1, an2:2, an3:2, ad1:0, ad2:1, win:4, pop:7 },
  { id:"butler-10s", name:"Jimmy Butler",             decade:"2010s", pos:"SF", positions:["SF","SG","PF"],team:"Bulls/Wolves",    pts:19.8, reb:5.3,  ast:4.3,  stl:1.8, blk:0.6 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:1, an3:2, ad1:1, ad2:3, win:4, pop:6 },
  { id:"drose-10s",  name:"Derrick Rose",             decade:"2010s", pos:"PG", positions:["PG"],          team:"Bulls",           pts:21.8, reb:3.8,  ast:7.7,  stl:1.1, blk:0.6 , mvp:1, fmvp:0, dpoy:0, an1:1, an2:0, an3:0, ad1:0, ad2:0, win:4, pop:7 },
  { id:"blake-10s",  name:"Blake Griffin",            decade:"2010s", pos:"PF", positions:["PF","C","SF"], team:"Clippers",        pts:22.1, reb:9.5,  ast:4.3,  stl:0.9, blk:0.5 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:1, an3:3, ad1:0, ad2:0, win:3, pop:6 },
  { id:"klay-10s",   name:"Klay Thompson",            decade:"2010s", pos:"SG", positions:["SG","SF"],     team:"Warriors",        pts:20.0, reb:3.6,  ast:2.3,  stl:1.1, blk:0.6 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:2, an3:1, ad1:0, ad2:2, win:7, pop:7 },
  { id:"draymond-10s",name:"Draymond Green",          decade:"2010s", pos:"PF", positions:["PF","SF","C"], team:"Warriors",        pts:10.2, reb:7.9,  ast:7.3,  stl:1.6, blk:1.2 , mvp:0, fmvp:0, dpoy:1, an1:0, an2:1, an3:2, ad1:3, ad2:3, win:7, pop:7 },
  { id:"beal-10s",   name:"Bradley Beal",             decade:"2010s", pos:"SG", positions:["SG","SF"],     team:"Wizards",         pts:25.0, reb:4.2,  ast:5.5,  stl:1.4, blk:0.3 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:1, ad1:0, ad2:0, win:3, pop:5 },
  { id:"love-10s",   name:"Kevin Love",               decade:"2010s", pos:"PF", positions:["PF","C"],      team:"Timberwolves",    pts:22.8, reb:14.0, ast:2.5,  stl:0.8, blk:0.5 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:1, an3:1, ad1:0, ad2:0, win:4, pop:5 },
  { id:"booker-10s", name:"Devin Booker",             decade:"2010s", pos:"SG", positions:["SG","SF"],     team:"Suns",            pts:23.3, reb:3.9,  ast:4.1,  stl:0.9, blk:0.3 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:2, ad1:0, ad2:0, win:3, pop:6 },
  { id:"gobert-10s", name:"Rudy Gobert",              decade:"2010s", pos:"C",  positions:["C"],           team:"Jazz",            pts:12.0, reb:12.5, ast:1.5,  stl:0.6, blk:2.1 , mvp:0, fmvp:0, dpoy:2, an1:0, an2:2, an3:2, ad1:3, ad2:3, win:4, pop:5 },
  { id:"lavine-10s", name:"Zach LaVine",              decade:"2010s", pos:"SG", positions:["SG","SF"],     team:"Bulls",           pts:22.6, reb:4.8,  ast:4.3,  stl:1.3, blk:0.5 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:1, ad1:0, ad2:0, win:3, pop:5 },
  { id:"kemba-10s",  name:"Kemba Walker",             decade:"2010s", pos:"PG", positions:["PG","SG"],     team:"Hornets",         pts:21.5, reb:3.8,  ast:5.8,  stl:1.2, blk:0.3 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:2, ad1:0, ad2:0, win:3, pop:5 },
  { id:"al-10s",     name:"Al Horford",               decade:"2010s", pos:"PF", positions:["PF","C"],      team:"Hawks/Celtics",   pts:14.8, reb:7.8,  ast:3.5,  stl:0.9, blk:1.3 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:5, pop:4 },
  { id:"melo-10s",   name:"Carmelo Anthony",          decade:"2010s", pos:"SF", positions:["SF","PF"],     team:"Knicks/Thunder",  pts:25.9, reb:6.7,  ast:2.7,  stl:1.1, blk:0.4 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:1, ad1:0, ad2:0, win:3, pop:6 },
  // ═══ 2020s ═══
  { id:"jokic-20s",  name:"Nikola Jokic",             decade:"2020s", pos:"C",  positions:["C","PF"],      team:"Nuggets",         pts:26.5, reb:12.0, ast:9.0,  stl:1.4, blk:0.7 , mvp:3, fmvp:1, dpoy:0, an1:5, an2:0, an3:0, ad1:0, ad2:0, win:6, pop:9 },
  { id:"lebron-20s", name:"LeBron James",             decade:"2020s", pos:"SF", positions:["SF","PF","PG"],team:"Lakers",          pts:25.7, reb:7.3,  ast:8.3,  stl:1.3, blk:0.6 , mvp:0, fmvp:1, dpoy:0, an1:2, an2:1, an3:1, ad1:0, ad2:0, win:5, pop:10 },
  { id:"giannis-20s",name:"Giannis Antetokounmpo",    decade:"2020s", pos:"PF", positions:["PF","C","SF"], team:"Bucks",           pts:29.9, reb:11.6, ast:5.8,  stl:1.2, blk:1.3 , mvp:0, fmvp:1, dpoy:1, an1:2, an2:1, an3:0, ad1:2, ad2:1, win:6, pop:9 },
  { id:"embiid-20s", name:"Joel Embiid",              decade:"2020s", pos:"C",  positions:["C","PF"],      team:"76ers",           pts:30.6, reb:11.7, ast:4.2,  stl:1.2, blk:1.7 , mvp:1, fmvp:0, dpoy:0, an1:3, an2:1, an3:0, ad1:0, ad2:1, win:4, pop:8 },
  { id:"durant-20s", name:"Kevin Durant",             decade:"2020s", pos:"SF", positions:["SF","PF"],     team:"Nets/Suns",       pts:27.2, reb:7.1,  ast:5.0,  stl:0.9, blk:1.4 , mvp:0, fmvp:0, dpoy:0, an1:2, an2:1, an3:0, ad1:0, ad2:0, win:4, pop:8 },
  { id:"luka-20s",   name:"Luka Doncic",              decade:"2020s", pos:"PG", positions:["PG","SF"],     team:"Mavericks",       pts:32.4, reb:9.1,  ast:9.8,  stl:1.4, blk:0.5 , mvp:0, fmvp:1, dpoy:0, an1:4, an2:0, an3:0, ad1:0, ad2:0, win:4, pop:9 },
  { id:"tatum-20s",  name:"Jayson Tatum",             decade:"2020s", pos:"SF", positions:["SF","SG","PF"],team:"Celtics",         pts:26.9, reb:8.1,  ast:4.9,  stl:1.1, blk:0.6 , mvp:0, fmvp:0, dpoy:0, an1:3, an2:1, an3:1, ad1:0, ad2:1, win:5, pop:8 },
  { id:"curry-20s",  name:"Stephen Curry",            decade:"2020s", pos:"PG", positions:["PG","SG"],     team:"Warriors",        pts:26.4, reb:5.5,  ast:6.3,  stl:1.6, blk:0.4 , mvp:0, fmvp:1, dpoy:0, an1:2, an2:1, an3:0, ad1:0, ad2:0, win:6, pop:9 },
  { id:"ad-20s",     name:"Anthony Davis",            decade:"2020s", pos:"PF", positions:["PF","C"],      team:"Lakers",          pts:25.9, reb:12.3, ast:2.6,  stl:1.2, blk:2.3 , mvp:0, fmvp:1, dpoy:0, an1:2, an2:1, an3:0, ad1:1, ad2:2, win:5, pop:7 },
  { id:"butler-20s", name:"Jimmy Butler",             decade:"2020s", pos:"SF", positions:["SF","SG","PF"],team:"Heat/Warriors",   pts:22.9, reb:5.8,  ast:5.3,  stl:1.8, blk:0.4 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:2, an3:1, ad1:0, ad2:1, win:4, pop:7 },
  { id:"kawhi-20s",  name:"Kawhi Leonard",            decade:"2020s", pos:"SF", positions:["SF","SG"],     team:"Clippers",        pts:24.0, reb:6.5,  ast:3.9,  stl:1.7, blk:0.4 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:1, an3:1, ad1:1, ad2:2, win:3, pop:7 },
  { id:"dame-20s",   name:"Damian Lillard",           decade:"2020s", pos:"PG", positions:["PG"],          team:"Bucks",           pts:26.4, reb:4.4,  ast:7.3,  stl:0.8, blk:0.3 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:1, an3:2, ad1:0, ad2:0, win:4, pop:7 },
  { id:"shai-20s",   name:"Shai Gilgeous-Alexander",  decade:"2020s", pos:"PG", positions:["PG","SG"],     team:"Thunder",         pts:30.1, reb:5.5,  ast:6.2,  stl:2.0, blk:1.0 , mvp:0, fmvp:0, dpoy:0, an1:2, an2:1, an3:0, ad1:1, ad2:1, win:5, pop:8 },
  { id:"tyrese-20s", name:"Tyrese Haliburton",        decade:"2020s", pos:"PG", positions:["PG","SG"],     team:"Pacers",          pts:20.1, reb:3.9,  ast:10.9, stl:1.4, blk:0.5 , mvp:0, fmvp:0, dpoy:0, an1:1, an2:0, an3:1, ad1:0, ad2:0, win:4, pop:6 },
  { id:"kyrie-20s",  name:"Kyrie Irving",             decade:"2020s", pos:"PG", positions:["PG","SG"],     team:"Mavericks",       pts:26.0, reb:5.0,  ast:5.2,  stl:1.4, blk:0.4 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:1, an3:0, ad1:0, ad2:0, win:4, pop:7 },
  { id:"booker-20s", name:"Devin Booker",             decade:"2020s", pos:"SG", positions:["SG","SF"],     team:"Suns",            pts:27.1, reb:4.5,  ast:6.4,  stl:0.9, blk:0.3 , mvp:0, fmvp:0, dpoy:0, an1:1, an2:1, an3:1, ad1:0, ad2:0, win:4, pop:7 },
  { id:"ja-20s",     name:"Ja Morant",                decade:"2020s", pos:"PG", positions:["PG","SG"],     team:"Grizzlies",       pts:25.1, reb:5.6,  ast:7.8,  stl:1.1, blk:0.4 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:1, an3:0, ad1:0, ad2:0, win:4, pop:7 },
  { id:"brunson-20s",name:"Jalen Brunson",            decade:"2020s", pos:"PG", positions:["PG","SG"],     team:"Knicks",          pts:28.7, reb:3.5,  ast:7.0,  stl:0.9, blk:0.2 , mvp:0, fmvp:0, dpoy:0, an1:1, an2:0, an3:0, ad1:0, ad2:0, win:4, pop:6 },
  { id:"bam-20s",    name:"Bam Adebayo",              decade:"2020s", pos:"C",  positions:["C","PF"],      team:"Heat",            pts:20.4, reb:9.5,  ast:3.3,  stl:1.3, blk:0.9 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:2, an3:0, ad1:1, ad2:2, win:4, pop:5 },
  { id:"wemby-20s",  name:"Victor Wembanyama",        decade:"2020s", pos:"C",  positions:["C","PF"],      team:"Spurs",           pts:21.4, reb:10.6, ast:3.9,  stl:1.2, blk:3.6 , mvp:0, fmvp:0, dpoy:1, an1:1, an2:0, an3:0, ad1:1, ad2:0, win:3, pop:8 },
  { id:"ant-20s",    name:"Anthony Edwards",          decade:"2020s", pos:"SG", positions:["SG","SF"],     team:"Timberwolves",    pts:25.9, reb:5.4,  ast:5.1,  stl:1.3, blk:0.6 , mvp:0, fmvp:0, dpoy:0, an1:1, an2:1, an3:0, ad1:0, ad2:0, win:4, pop:8 },
  { id:"paolo-20s",  name:"Paolo Banchero",           decade:"2020s", pos:"PF", positions:["PF","SF","C"], team:"Magic",           pts:22.6, reb:6.9,  ast:5.4,  stl:1.1, blk:0.5 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:3, pop:5 },
  { id:"cade-20s",   name:"Cade Cunningham",          decade:"2020s", pos:"PG", positions:["PG","SG"],     team:"Pistons",         pts:22.7, reb:4.4,  ast:9.0,  stl:1.4, blk:0.5 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:3, pop:5 },
  { id:"evan-20s",   name:"Evan Mobley",              decade:"2020s", pos:"PF", positions:["PF","C"],      team:"Cavaliers",       pts:15.7, reb:9.4,  ast:2.7,  stl:1.1, blk:1.6 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:3, pop:4 },
  { id:"franz-20s",  name:"Franz Wagner",             decade:"2020s", pos:"SF", positions:["SF","SG","PF"],team:"Magic",           pts:19.7, reb:5.3,  ast:3.5,  stl:1.2, blk:0.5 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:3, pop:4 },

  // ─── 1960s additions ───
  { id:"chet-60s",    name:"Chet Walker",             decade:"1960s", pos:"SF", positions:["SF","SG"],     team:"76ers",           pts:17.3, reb:8.1,  ast:2.4,  stl:0.0, blk:0.0 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:1, ad1:0, ad2:0, win:6, pop:5 },
  { id:"tom-h-60s",   name:"Tom Heinsohn",            decade:"1960s", pos:"SF", positions:["SF","PF"],     team:"Celtics",         pts:18.6, reb:8.8,  ast:2.3,  stl:0.0, blk:0.0 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:1, an3:0, ad1:0, ad2:0, win:8, pop:5 },
  { id:"bailey-60s",  name:"Bailey Howell",           decade:"1960s", pos:"SF", positions:["SF","PF"],     team:"Pistons/Celtics", pts:18.7, reb:9.9,  ast:2.0,  stl:0.0, blk:0.0 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:1, ad1:0, ad2:0, win:6, pop:4 },
  { id:"jerry-l-60s", name:"Jerry Lucas",             decade:"1960s", pos:"PF", positions:["PF","C","SF"], team:"Royals",          pts:17.0, reb:19.1, ast:3.3,  stl:0.0, blk:0.0 , mvp:0, fmvp:0, dpoy:0, an1:3, an2:0, an3:0, ad1:0, ad2:0, win:5, pop:6 },
  { id:"gus-60s",     name:"Gus Johnson",             decade:"1960s", pos:"PF", positions:["PF","SF"],     team:"Bullets",         pts:16.6, reb:12.7, ast:2.2,  stl:0.0, blk:0.0 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:4, pop:4 },
  { id:"dave-d-60s",  name:"Dave DeBusschere",        decade:"1960s", pos:"PF", positions:["PF","SF"],     team:"Pistons/Knicks",  pts:16.1, reb:11.0, ast:2.9,  stl:0.0, blk:0.0 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:2, ad2:2, win:7, pop:6 },
  { id:"don-n-60s",   name:"Don Nelson",              decade:"1960s", pos:"SF", positions:["SF","PF"],     team:"Celtics",         pts:10.3, reb:5.1,  ast:1.9,  stl:0.0, blk:0.0 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:9, pop:4 },
  { id:"tom-s-60s",   name:"Tom Sanders",             decade:"1960s", pos:"PF", positions:["PF","SF"],     team:"Celtics",         pts:9.0,  reb:6.9,  ast:1.2,  stl:0.0, blk:0.0 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:9, pop:3 },
  { id:"walt-b-60s",  name:"Walt Bellamy",            decade:"1960s", pos:"C",  positions:["C","PF"],      team:"Bullets",         pts:20.1, reb:13.7, ast:2.5,  stl:0.0, blk:0.0 , mvp:0, fmvp:0, dpoy:0, an1:1, an2:0, an3:0, ad1:0, ad2:0, win:4, pop:5 },
  { id:"wes-60s",     name:"Wes Unseld",              decade:"1960s", pos:"C",  positions:["C","PF"],      team:"Bullets",         pts:13.8, reb:18.2, ast:3.9,  stl:0.0, blk:0.0 , mvp:1, fmvp:0, dpoy:0, an1:0, an2:1, an3:0, ad1:0, ad2:0, win:5, pop:7 },
  { id:"wayne-60s",   name:"Wayne Embry",             decade:"1960s", pos:"C",  positions:["C"],           team:"Royals",          pts:12.5, reb:10.3, ast:1.7,  stl:0.0, blk:0.0 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:5, pop:3 },
  { id:"archie-60s",  name:"Archie Clark",            decade:"1960s", pos:"PG", positions:["PG","SG"],     team:"Lakers/76ers",    pts:15.0, reb:3.2,  ast:4.9,  stl:0.0, blk:0.0 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:5, pop:3 },
  { id:"clem-60s",    name:"Clem Haskins",            decade:"1960s", pos:"SG", positions:["SG","PG"],     team:"Bulls",           pts:12.8, reb:4.0,  ast:3.3,  stl:0.0, blk:0.0 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:4, pop:3 },
  { id:"dick-v-60s",  name:"Dick Van Arsdale",        decade:"1960s", pos:"SG", positions:["SG","SF"],     team:"Knicks/Suns",     pts:15.2, reb:4.3,  ast:3.2,  stl:0.0, blk:0.0 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:4, pop:3 },
  { id:"lucius-60s",  name:"Lucius Allen",            decade:"1960s", pos:"PG", positions:["PG","SG"],     team:"Bucks",           pts:12.1, reb:3.5,  ast:5.0,  stl:0.0, blk:0.0 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:5, pop:3 },
  { id:"emmette-60s", name:"Emmette Bryant",          decade:"1960s", pos:"PG", positions:["PG","SG"],     team:"Celtics",         pts:9.4,  reb:3.0,  ast:4.2,  stl:0.0, blk:0.0 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:5, pop:2 },
  { id:"jon-m-60s",   name:"Jon McGlocklin",          decade:"1960s", pos:"SG", positions:["SG"],          team:"Bucks",           pts:14.5, reb:2.8,  ast:2.8,  stl:0.0, blk:0.0 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:5, pop:2 },
  { id:"fred-h-60s",  name:"Fred Hetzel",             decade:"1960s", pos:"PF", positions:["PF","C"],      team:"Warriors",        pts:14.8, reb:8.6,  ast:1.8,  stl:0.0, blk:0.0 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:3, pop:2 },
  { id:"paul-s-60s",  name:"Paul Silas",              decade:"1960s", pos:"PF", positions:["PF","C"],      team:"Hawks",           pts:9.4,  reb:10.6, ast:1.7,  stl:0.0, blk:0.0 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:6, pop:3 },
  { id:"leroy-60s",   name:"LeRoy Ellis",             decade:"1960s", pos:"C",  positions:["C","PF"],      team:"Lakers",          pts:10.2, reb:9.2,  ast:1.2,  stl:0.0, blk:0.0 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:4, pop:2 },
  { id:"larry-s-60s", name:"Larry Siegfried",         decade:"1960s", pos:"SG", positions:["SG","PG"],     team:"Celtics",         pts:11.7, reb:3.8,  ast:3.7,  stl:0.0, blk:0.0 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:9, pop:2 },

  // ─── 1970s additions ───
  { id:"norm-70s",    name:"Norm Van Lier",           decade:"1970s", pos:"PG", positions:["PG","SG"],     team:"Bulls",           pts:12.0, reb:4.6,  ast:7.0,  stl:2.0, blk:0.2 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:2, ad2:2, win:5, pop:4 },
  { id:"jojo-70s",    name:"Jo Jo White",             decade:"1970s", pos:"PG", positions:["PG","SG"],     team:"Celtics",         pts:17.2, reb:4.9,  ast:5.1,  stl:1.3, blk:0.2 , mvp:0, fmvp:1, dpoy:0, an1:0, an2:2, an3:0, ad1:0, ad2:0, win:7, pop:5 },
  { id:"phil-c-70s",  name:"Phil Chenier",            decade:"1970s", pos:"SG", positions:["SG","PG"],     team:"Bullets",         pts:18.8, reb:3.9,  ast:4.0,  stl:1.5, blk:0.3 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:1, an3:0, ad1:0, ad2:0, win:5, pop:4 },
  { id:"don-b-70s",   name:"Don Buse",                decade:"1970s", pos:"PG", positions:["PG","SG"],     team:"Pacers",          pts:9.5,  reb:3.2,  ast:8.5,  stl:2.9, blk:0.2 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:1, win:5, pop:3 },
  { id:"kevin-p-70s", name:"Kevin Porter",            decade:"1970s", pos:"PG", positions:["PG"],          team:"Pistons",         pts:13.3, reb:3.5,  ast:8.0,  stl:1.5, blk:0.1 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:4, pop:3 },
  { id:"randy-70s",   name:"Randy Smith",             decade:"1970s", pos:"SG", positions:["SG","PG"],     team:"Braves",          pts:19.7, reb:4.3,  ast:5.1,  stl:2.2, blk:0.3 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:4, pop:3 },
  { id:"charlie-70s", name:"Charlie Scott",           decade:"1970s", pos:"SG", positions:["SG","PG"],     team:"Suns/Celtics",    pts:20.0, reb:4.2,  ast:4.5,  stl:1.7, blk:0.3 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:1, an3:0, ad1:0, ad2:0, win:6, pop:4 },
  { id:"mike-n-70s",  name:"Mike Newlin",             decade:"1970s", pos:"SG", positions:["SG","PG"],     team:"Rockets",         pts:17.8, reb:3.1,  ast:3.6,  stl:1.2, blk:0.3 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:3, pop:3 },
  { id:"kenon-70s",   name:"Larry Kenon",             decade:"1970s", pos:"SF", positions:["SF","PF"],     team:"Spurs",           pts:19.1, reb:10.3, ast:2.5,  stl:1.7, blk:0.5 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:5, pop:3 },
  { id:"chet-70s",    name:"Chet Walker",             decade:"1970s", pos:"SF", positions:["SF","SG"],     team:"Bulls",           pts:18.7, reb:7.2,  ast:2.6,  stl:0.8, blk:0.2 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:5, pop:4 },
  { id:"bobby-70s",   name:"Bobby Dandridge",         decade:"1970s", pos:"SF", positions:["SF","SG","PF"],team:"Bucks/Bullets",   pts:18.5, reb:6.6,  ast:3.4,  stl:1.4, blk:0.6 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:1, an3:0, ad1:1, ad2:2, win:7, pop:4 },
  { id:"rudy-t-70s",  name:"Rudy Tomjanovich",        decade:"1970s", pos:"SF", positions:["SF","PF"],     team:"Rockets",         pts:17.4, reb:8.1,  ast:1.7,  stl:0.8, blk:0.3 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:4, pop:4 },
  { id:"paul-s-70s",  name:"Paul Silas",              decade:"1970s", pos:"PF", positions:["PF","SF"],     team:"Suns/Celtics",    pts:11.3, reb:11.6, ast:2.0,  stl:1.3, blk:0.4 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:7, pop:3 },
  { id:"dan-70s",     name:"Dan Issel",               decade:"1970s", pos:"PF", positions:["PF","C"],      team:"Nuggets",         pts:22.6, reb:10.2, ast:2.8,  stl:0.9, blk:0.5 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:4, pop:5 },
  { id:"tom-b-70s",   name:"Tom Burleson",            decade:"1970s", pos:"C",  positions:["C"],           team:"Sonics",          pts:12.1, reb:9.5,  ast:1.5,  stl:0.6, blk:1.5 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:4, pop:2 },
  { id:"swen-70s",    name:"Swen Nater",              decade:"1970s", pos:"C",  positions:["C","PF"],      team:"Braves",          pts:12.2, reb:13.4, ast:1.4,  stl:0.6, blk:0.8 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:4, pop:2 },
  { id:"billy-p-70s", name:"Billy Paultz",            decade:"1970s", pos:"C",  positions:["C"],           team:"Spurs",           pts:14.6, reb:9.8,  ast:2.5,  stl:0.7, blk:1.4 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:4, pop:2 },
  { id:"luol-70s",    name:"Curtis Perry",            decade:"1970s", pos:"PF", positions:["PF","C"],      team:"Bucks",           pts:10.5, reb:9.2,  ast:1.5,  stl:1.0, blk:0.6 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:5, pop:2 },
  { id:"clint-70s",   name:"Clint Richardson",        decade:"1970s", pos:"SG", positions:["SG","PG"],     team:"76ers",           pts:10.9, reb:3.6,  ast:3.1,  stl:1.3, blk:0.4 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:4, pop:2 },
  { id:"connie-70s",  name:"Connie Hawkins",          decade:"1970s", pos:"SF", positions:["SF","PF"],     team:"Suns",            pts:20.0, reb:8.8,  ast:4.3,  stl:0.0, blk:0.0 , mvp:0, fmvp:0, dpoy:0, an1:1, an2:0, an3:0, ad1:0, ad2:0, win:4, pop:5 },
  { id:"james-70s",   name:"James Silas",             decade:"1970s", pos:"PG", positions:["PG","SG"],     team:"Spurs",           pts:20.1, reb:3.0,  ast:5.5,  stl:1.6, blk:0.2 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:4, pop:3 },
  { id:"david-t-70s", name:"David Thompson",          decade:"1970s", pos:"SG", positions:["SG","SF"],     team:"Nuggets",         pts:24.3, reb:4.0,  ast:3.3,  stl:1.3, blk:0.5 , mvp:0, fmvp:0, dpoy:0, an1:2, an2:1, an3:0, ad1:0, ad2:0, win:5, pop:7 },
  { id:"billy-k-70s", name:"Billy Knight",            decade:"1970s", pos:"SF", positions:["SF","SG"],     team:"Pacers",          pts:19.2, reb:5.0,  ast:2.0,  stl:1.0, blk:0.3 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:4, pop:3 },
  { id:"john-d-70s",  name:"John Drew",               decade:"1970s", pos:"SF", positions:["SF","SG"],     team:"Hawks",           pts:21.0, reb:7.3,  ast:1.8,  stl:1.2, blk:0.3 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:3, pop:3 },

  // ─── 1980s additions ───
  { id:"dj-80s",      name:"Dennis Johnson",          decade:"1980s", pos:"PG", positions:["PG","SG"],     team:"Suns/Celtics",    pts:14.1, reb:3.9,  ast:5.7,  stl:1.7, blk:0.5 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:1, an3:2, ad1:5, ad2:1, win:8, pop:6 },
  { id:"mo-80s",      name:"Maurice Cheeks",          decade:"1980s", pos:"PG", positions:["PG"],          team:"76ers",           pts:11.5, reb:3.0,  ast:6.8,  stl:2.1, blk:0.2 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:4, ad2:1, win:7, pop:5 },
  { id:"kj-80s",      name:"Kevin Johnson",           decade:"1980s", pos:"PG", positions:["PG"],          team:"Suns",            pts:20.4, reb:3.8,  ast:12.2, stl:1.7, blk:0.4 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:2, an3:1, ad1:0, ad2:0, win:4, pop:6 },
  { id:"price-80s",   name:"Mark Price",              decade:"1980s", pos:"PG", positions:["PG"],          team:"Cavaliers",       pts:16.0, reb:2.4,  ast:8.1,  stl:1.3, blk:0.1 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:1, an3:1, ad1:0, ad2:0, win:4, pop:5 },
  { id:"porter-80s",  name:"Terry Porter",            decade:"1980s", pos:"PG", positions:["PG","SG"],     team:"Blazers",         pts:14.2, reb:3.7,  ast:7.4,  stl:1.6, blk:0.2 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:5, pop:4 },
  { id:"sleepy-80s",  name:"Sleepy Floyd",            decade:"1980s", pos:"PG", positions:["PG","SG"],     team:"Warriors",        pts:14.9, reb:3.4,  ast:7.2,  stl:1.4, blk:0.2 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:5, pop:3 },
  { id:"doc-80s",     name:"Doc Rivers",              decade:"1980s", pos:"PG", positions:["PG","SG"],     team:"Hawks",           pts:10.9, reb:3.7,  ast:6.0,  stl:2.0, blk:0.3 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:1, win:4, pop:4 },
  { id:"lever-80s",   name:"Fat Lever",               decade:"1980s", pos:"PG", positions:["PG","SG"],     team:"Nuggets",         pts:16.0, reb:6.8,  ast:7.0,  stl:2.6, blk:0.4 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:2, an3:0, ad1:0, ad2:0, win:4, pop:4 },
  { id:"tiny-80s",    name:"Nate Archibald",          decade:"1980s", pos:"PG", positions:["PG"],          team:"Celtics",         pts:11.0, reb:2.5,  ast:7.7,  stl:1.0, blk:0.1 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:5, pop:5 },
  { id:"johnny-80s",  name:"Johnny Moore",            decade:"1980s", pos:"PG", positions:["PG"],          team:"Spurs",           pts:10.0, reb:2.8,  ast:9.6,  stl:1.8, blk:0.1 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:4, pop:3 },
  { id:"byron-80s",   name:"Byron Scott",             decade:"1980s", pos:"SG", positions:["SG","SF"],     team:"Lakers",          pts:15.6, reb:2.8,  ast:3.0,  stl:1.1, blk:0.2 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:8, pop:5 },
  { id:"vinnie-80s",  name:"Vinnie Johnson",          decade:"1980s", pos:"SG", positions:["SG","PG"],     team:"Pistons",         pts:15.0, reb:3.5,  ast:3.4,  stl:0.9, blk:0.3 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:7, pop:4 },
  { id:"danny-80s",   name:"Danny Ainge",             decade:"1980s", pos:"SG", positions:["SG","PG"],     team:"Celtics",         pts:11.5, reb:2.9,  ast:4.7,  stl:1.4, blk:0.2 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:8, pop:5 },
  { id:"dale-80s",    name:"Dale Ellis",              decade:"1980s", pos:"SG", positions:["SG","SF"],     team:"Sonics",          pts:21.3, reb:4.0,  ast:1.8,  stl:1.0, blk:0.4 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:4, pop:3 },
  { id:"wdavis-80s",  name:"Walter Davis",            decade:"1980s", pos:"SG", positions:["SG","SF"],     team:"Suns",            pts:21.3, reb:3.7,  ast:4.6,  stl:1.4, blk:0.3 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:1, an3:0, ad1:0, ad2:0, win:4, pop:4 },
  { id:"ricky-80s",   name:"Ricky Pierce",            decade:"1980s", pos:"SG", positions:["SG"],          team:"Bucks",           pts:18.8, reb:3.0,  ast:2.7,  stl:1.0, blk:0.2 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:4, pop:3 },
  { id:"buck-80s",    name:"Buck Williams",           decade:"1980s", pos:"PF", positions:["PF","C"],      team:"Nets",            pts:16.4, reb:12.5, ast:1.3,  stl:0.9, blk:1.3 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:2, an3:1, ad1:0, ad2:2, win:5, pop:5 },
  { id:"chambers-80s",name:"Tom Chambers",           decade:"1980s", pos:"PF", positions:["PF","SF"],     team:"Suns",            pts:18.3, reb:6.7,  ast:2.1,  stl:0.8, blk:0.6 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:1, an3:0, ad1:0, ad2:0, win:4, pop:4 },
  { id:"nance-80s",   name:"Larry Nance",             decade:"1980s", pos:"PF", positions:["PF","C"],      team:"Suns",            pts:16.5, reb:7.9,  ast:2.2,  stl:0.9, blk:2.0 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:5, pop:4 },
  { id:"xavier-80s",  name:"Xavier McDaniel",         decade:"1980s", pos:"PF", positions:["PF","SF"],     team:"Sonics",          pts:18.5, reb:7.5,  ast:1.7,  stl:1.0, blk:0.7 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:4, pop:4 },
  { id:"tree-80s",    name:"Tree Rollins",            decade:"1980s", pos:"C",  positions:["C"],           team:"Hawks",           pts:7.5,  reb:6.8,  ast:0.9,  stl:0.7, blk:2.7 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:4, pop:2 },
  { id:"brad-80s",    name:"Brad Daugherty",          decade:"1980s", pos:"C",  positions:["C"],           team:"Cavaliers",       pts:19.0, reb:9.5,  ast:3.4,  stl:0.6, blk:1.0 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:4, pop:3 },
  { id:"james-d-80s", name:"James Donaldson",         decade:"1980s", pos:"C",  positions:["C"],           team:"Mavericks",       pts:8.0,  reb:9.9,  ast:0.9,  stl:0.4, blk:1.3 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:4, pop:2 },
  { id:"mychal-80s",  name:"Mychal Thompson",         decade:"1980s", pos:"C",  positions:["C","PF"],      team:"Blazers/Lakers",  pts:12.0, reb:7.5,  ast:1.8,  stl:0.7, blk:1.2 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:7, pop:3 },
  { id:"benoit-80s",  name:"Benoit Benjamin",         decade:"1980s", pos:"C",  positions:["C"],           team:"Clippers",        pts:13.4, reb:8.5,  ast:1.4,  stl:0.8, blk:2.7 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:3, pop:2 },

  // ─── 1990s additions ───
  { id:"kj-90s",      name:"Kevin Johnson",           decade:"1990s", pos:"PG", positions:["PG"],          team:"Suns",            pts:19.7, reb:3.6,  ast:10.1, stl:1.5, blk:0.3 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:2, an3:2, ad1:0, ad2:0, win:5, pop:6 },
  { id:"timH-90s",    name:"Tim Hardaway",            decade:"1990s", pos:"PG", positions:["PG"],          team:"Warriors/Heat",   pts:20.3, reb:3.8,  ast:9.3,  stl:1.8, blk:0.2 , mvp:0, fmvp:0, dpoy:0, an1:1, an2:1, an3:1, ad1:1, ad2:1, win:4, pop:5 },
  { id:"rod-90s",     name:"Rod Strickland",          decade:"1990s", pos:"PG", positions:["PG"],          team:"Blazers/Bullets", pts:15.5, reb:4.4,  ast:9.0,  stl:1.7, blk:0.2 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:4, pop:4 },
  { id:"avery-90s",   name:"Avery Johnson",           decade:"1990s", pos:"PG", positions:["PG"],          team:"Spurs",           pts:12.8, reb:2.5,  ast:7.2,  stl:1.7, blk:0.1 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:6, pop:4 },
  { id:"van-ex-90s",  name:"Nick Van Exel",           decade:"1990s", pos:"PG", positions:["PG","SG"],     team:"Lakers",          pts:14.8, reb:2.8,  ast:6.9,  stl:1.0, blk:0.2 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:4, pop:4 },
  { id:"mark-p-90s",  name:"Mark Price",              decade:"1990s", pos:"PG", positions:["PG"],          team:"Cavaliers",       pts:17.0, reb:2.8,  ast:8.5,  stl:1.5, blk:0.1 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:1, an3:0, ad1:0, ad2:0, win:4, pop:5 },
  { id:"detlef-90s",  name:"Detlef Schrempf",        decade:"1990s", pos:"SF", positions:["SF","PF"],     team:"Pacers",          pts:19.1, reb:7.5,  ast:4.5,  stl:0.9, blk:0.6 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:1, an3:1, ad1:0, ad2:0, win:5, pop:4 },
  { id:"ced-90s",     name:"Cedric Ceballos",         decade:"1990s", pos:"SF", positions:["SF","PF"],     team:"Suns/Lakers",     pts:17.1, reb:7.0,  ast:1.8,  stl:1.0, blk:0.5 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:4, pop:3 },
  { id:"marion-90s",  name:"Shawn Marion",            decade:"1990s", pos:"SF", positions:["SF","PF"],     team:"Suns",            pts:14.6, reb:9.3,  ast:1.5,  stl:1.6, blk:1.2 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:4, pop:4 },
  { id:"antawn-90s",  name:"Antawn Jamison",          decade:"1990s", pos:"SF", positions:["SF","PF"],     team:"Warriors",        pts:19.1, reb:8.5,  ast:1.7,  stl:0.8, blk:0.5 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:3, pop:3 },
  { id:"vin-b-90s",   name:"Vin Baker",               decade:"1990s", pos:"PF", positions:["PF","C","SF"], team:"Bucks/Sonics",    pts:17.5, reb:8.6,  ast:2.1,  stl:0.8, blk:1.1 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:2, ad1:0, ad2:0, win:4, pop:4 },
  { id:"horace-90s",  name:"Horace Grant",            decade:"1990s", pos:"PF", positions:["PF","SF"],     team:"Bulls/Magic",     pts:11.5, reb:8.6,  ast:2.4,  stl:1.1, blk:0.9 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:8, pop:4 },
  { id:"otis-90s",    name:"Otis Thorpe",             decade:"1990s", pos:"PF", positions:["PF","C"],      team:"Rockets",         pts:14.5, reb:9.2,  ast:2.5,  stl:0.9, blk:0.6 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:5, pop:3 },
  { id:"popeye-90s",  name:"Popeye Jones",            decade:"1990s", pos:"PF", positions:["PF","C"],      team:"Mavericks",       pts:8.5,  reb:10.5, ast:1.5,  stl:0.8, blk:0.5 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:3, pop:2 },
  { id:"hersey-90s",  name:"Hersey Hawkins",          decade:"1990s", pos:"SG", positions:["SG","PG"],     team:"76ers/Sonics",    pts:15.5, reb:3.7,  ast:3.5,  stl:1.7, blk:0.3 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:5, pop:3 },
  { id:"vlade-90s",   name:"Vlade Divac",             decade:"1990s", pos:"C",  positions:["C"],           team:"Lakers/Kings",    pts:11.9, reb:8.6,  ast:3.5,  stl:1.2, blk:1.4 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:4, pop:4 },
  { id:"luc-90s",     name:"Luc Longley",             decade:"1990s", pos:"C",  positions:["C"],           team:"Bulls",           pts:9.1,  reb:6.3,  ast:2.7,  stl:0.5, blk:1.1 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:8, pop:2 },
  { id:"calbert-90s", name:"Calbert Cheaney",         decade:"1990s", pos:"SF", positions:["SF","SG"],     team:"Bullets",         pts:12.5, reb:3.8,  ast:1.5,  stl:0.7, blk:0.3 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:4, pop:2 },

  // ─── 2000s additions ───
  { id:"nash-00s",    name:"Steve Nash",              decade:"2000s", pos:"PG", positions:["PG"],          team:"Suns/Mavericks",  pts:17.9, reb:3.5,  ast:11.5, stl:0.8, blk:0.1 , mvp:2, fmvp:0, dpoy:0, an1:4, an2:2, an3:0, ad1:0, ad2:0, win:4, pop:8 },
  { id:"baron-00s",   name:"Baron Davis",             decade:"2000s", pos:"PG", positions:["PG","SG"],     team:"Hornets/Warriors",pts:18.5, reb:4.3,  ast:7.9,  stl:2.0, blk:0.5 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:1, ad1:0, ad2:0, win:4, pop:5 },
  { id:"marbury-00s", name:"Stephon Marbury",         decade:"2000s", pos:"PG", positions:["PG"],          team:"Nets/Knicks",     pts:19.3, reb:3.3,  ast:8.1,  stl:1.4, blk:0.2 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:1, an3:0, ad1:0, ad2:0, win:3, pop:5 },
  { id:"parker-00s",  name:"Tony Parker",             decade:"2000s", pos:"PG", positions:["PG"],          team:"Spurs",           pts:17.9, reb:2.9,  ast:6.3,  stl:0.8, blk:0.2 , mvp:0, fmvp:1, dpoy:0, an1:0, an2:3, an3:2, ad1:0, ad2:0, win:7, pop:6 },
  { id:"billups-00s", name:"Chauncey Billups",        decade:"2000s", pos:"PG", positions:["PG","SG"],     team:"Pistons",         pts:16.7, reb:3.0,  ast:5.7,  stl:1.3, blk:0.2 , mvp:0, fmvp:1, dpoy:0, an1:0, an2:1, an3:3, ad1:0, ad2:0, win:6, pop:6 },
  { id:"miller-00s",  name:"Andre Miller",            decade:"2000s", pos:"PG", positions:["PG"],          team:"Cavaliers/76ers", pts:13.9, reb:4.2,  ast:8.0,  stl:1.2, blk:0.2 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:3, pop:3 },
  { id:"bibby-00s",   name:"Mike Bibby",              decade:"2000s", pos:"PG", positions:["PG"],          team:"Kings",           pts:15.5, reb:3.1,  ast:6.0,  stl:1.2, blk:0.1 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:4, pop:4 },
  { id:"redd-00s",    name:"Michael Redd",            decade:"2000s", pos:"SG", positions:["SG"],          team:"Bucks",           pts:22.0, reb:4.1,  ast:2.4,  stl:1.0, blk:0.3 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:1, an3:0, ad1:0, ad2:0, win:3, pop:4 },
  { id:"manu-00s",    name:"Manu Ginobili",           decade:"2000s", pos:"SG", positions:["SG","PG"],     team:"Spurs",           pts:16.3, reb:3.7,  ast:3.8,  stl:1.6, blk:0.4 , mvp:0, fmvp:1, dpoy:0, an1:0, an2:1, an3:2, ad1:0, ad2:0, win:7, pop:7 },
  { id:"joe-j-00s",   name:"Joe Johnson",             decade:"2000s", pos:"SG", positions:["SG","SF"],     team:"Hawks",           pts:19.5, reb:4.1,  ast:3.9,  stl:1.0, blk:0.3 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:1, ad1:0, ad2:0, win:3, pop:4 },
  { id:"peja-00s",    name:"Peja Stojakovic",         decade:"2000s", pos:"SF", positions:["SF","SG"],     team:"Kings",           pts:20.2, reb:5.2,  ast:2.2,  stl:1.0, blk:0.4 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:1, an3:2, ad1:0, ad2:0, win:4, pop:4 },
  { id:"lamar-00s",   name:"Lamar Odom",              decade:"2000s", pos:"SF", positions:["SF","PF"],     team:"Heat/Lakers",     pts:15.3, reb:9.8,  ast:3.6,  stl:1.0, blk:0.6 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:5, pop:4 },
  { id:"jamison-00s", name:"Antawn Jamison",          decade:"2000s", pos:"PF", positions:["PF","SF"],     team:"Mavericks/Wizards",pts:19.8,reb:8.7,  ast:1.8,  stl:0.9, blk:0.6 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:3, pop:3 },
  { id:"rashard-00s", name:"Rashard Lewis",           decade:"2000s", pos:"SF", positions:["SF","PF"],     team:"Sonics",          pts:17.9, reb:5.6,  ast:1.9,  stl:0.8, blk:0.7 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:3, pop:3 },
  { id:"marion-00s",  name:"Shawn Marion",            decade:"2000s", pos:"SF", positions:["SF","PF"],     team:"Suns",            pts:17.5, reb:9.9,  ast:1.9,  stl:1.7, blk:1.4 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:2, an3:1, ad1:1, ad2:2, win:4, pop:5 },
  { id:"elton-00s",   name:"Elton Brand",             decade:"2000s", pos:"PF", positions:["PF","C"],      team:"Clippers",        pts:19.6, reb:10.3, ast:2.6,  stl:1.0, blk:1.9 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:2, an3:1, ad1:0, ad2:0, win:3, pop:4 },
  { id:"zach-00s",    name:"Zach Randolph",           decade:"2000s", pos:"PF", positions:["PF","C"],      team:"Blazers",         pts:17.9, reb:9.9,  ast:2.0,  stl:0.6, blk:0.5 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:3, pop:4 },
  { id:"ilg-00s",     name:"Zydrunas Ilgauskas",      decade:"2000s", pos:"C",  positions:["C"],           team:"Cavaliers",       pts:15.0, reb:7.9,  ast:1.6,  stl:0.5, blk:1.8 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:4, pop:3 },
  { id:"okur-00s",    name:"Mehmet Okur",             decade:"2000s", pos:"C",  positions:["C","PF"],      team:"Jazz",            pts:14.5, reb:7.5,  ast:2.0,  stl:0.6, blk:1.1 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:4, pop:2 },
  { id:"dwight-00s",  name:"Dwight Howard",           decade:"2000s", pos:"C",  positions:["C"],           team:"Magic",           pts:17.1, reb:13.3, ast:1.3,  stl:0.9, blk:2.1 , mvp:0, fmvp:0, dpoy:1, an1:1, an2:1, an3:1, ad1:1, ad2:2, win:4, pop:7 },

  // ─── 2010s additions ───
  { id:"rondo-10s",   name:"Rajon Rondo",             decade:"2010s", pos:"PG", positions:["PG"],          team:"Celtics",         pts:10.9, reb:5.0,  ast:9.8,  stl:2.0, blk:0.2 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:2, win:4, pop:5 },
  { id:"conley-10s",  name:"Mike Conley",             decade:"2010s", pos:"PG", positions:["PG"],          team:"Grizzlies",       pts:15.7, reb:3.2,  ast:6.0,  stl:1.5, blk:0.3 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:1, win:4, pop:4 },
  { id:"dj-10s",      name:"DeAndre Jordan",          decade:"2010s", pos:"C",  positions:["C"],           team:"Clippers",        pts:11.4, reb:13.5, ast:0.8,  stl:0.6, blk:2.2 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:1, an3:1, ad1:0, ad2:1, win:3, pop:4 },
  { id:"marc-10s",    name:"Marc Gasol",              decade:"2010s", pos:"C",  positions:["C","PF"],      team:"Grizzlies",       pts:14.8, reb:7.6,  ast:3.3,  stl:1.4, blk:1.5 , mvp:0, fmvp:0, dpoy:1, an1:0, an2:1, an3:1, ad1:1, ad2:1, win:5, pop:5 },
  { id:"hassan-10s",  name:"Hassan Whiteside",        decade:"2010s", pos:"C",  positions:["C"],           team:"Heat",            pts:14.1, reb:11.8, ast:0.7,  stl:0.6, blk:3.0 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:3, pop:4 },

  // ─── 2020s additions ───
  { id:"trae-20s",    name:"Trae Young",              decade:"2020s", pos:"PG", positions:["PG"],          team:"Hawks",           pts:26.2, reb:3.1,  ast:9.7,  stl:1.0, blk:0.1 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:1, an3:1, ad1:0, ad2:0, win:3, pop:6 },
  { id:"fox-20s",     name:"De'Aaron Fox",            decade:"2020s", pos:"PG", positions:["PG","SG"],     team:"Kings/Spurs",     pts:24.5, reb:4.2,  ast:7.0,  stl:1.5, blk:0.4 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:1, an3:0, ad1:0, ad2:0, win:4, pop:5 },
  { id:"og-20s",      name:"OG Anunoby",              decade:"2020s", pos:"SF", positions:["SF","SG","PF"],team:"Raptors/Knicks",  pts:18.3, reb:5.0,  ast:2.0,  stl:1.8, blk:0.7 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:1, ad1:1, ad2:2, win:4, pop:5 },
  { id:"sengun-20s",  name:"Alperen Sengun",          decade:"2020s", pos:"C",  positions:["C","PF"],      team:"Rockets",         pts:21.1, reb:9.0,  ast:5.0,  stl:1.2, blk:1.3 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:3, pop:4 },
  { id:"sabonis-20s", name:"Domantas Sabonis",        decade:"2020s", pos:"C",  positions:["C","PF"],      team:"Kings",           pts:18.5, reb:12.3, ast:6.0,  stl:1.2, blk:0.4 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:1, an3:0, ad1:0, ad2:0, win:4, pop:4 },
  { id:"mitch-r-20s", name:"Mitchell Robinson",       decade:"2020s", pos:"C",  positions:["C"],           team:"Knicks",          pts:9.5,  reb:9.8,  ast:0.8,  stl:0.5, blk:2.4 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:3, pop:3 },
  { id:"walker-k-20s",name:"Walker Kessler",          decade:"2020s", pos:"C",  positions:["C"],           team:"Jazz",            pts:9.2,  reb:8.3,  ast:1.2,  stl:0.5, blk:2.7 , mvp:0, fmvp:0, dpoy:0, an1:0, an2:0, an3:0, ad1:0, ad2:0, win:3, pop:2 },

  // ─── Missing notable players ───────────────────────────────────────────────
  // 1960s
  { id:"cousy-60s",   name:"Bob Cousy",              decade:"1960s", pos:"PG", positions:["PG"],          team:"Celtics",         pts:18.5, reb:5.2,  ast:7.5,  stl:0.0, blk:0.0, mvp:1,  fmvp:0, dpoy:0, an1:6,  an2:4,  an3:0,  ad1:0,  ad2:0,  win:10, pop:8 },
  { id:"sharman-60s", name:"Bill Sharman",           decade:"1960s", pos:"SG", positions:["SG","PG"],     team:"Celtics",         pts:18.1, reb:3.3,  ast:3.4,  stl:0.0, blk:0.0, mvp:0,  fmvp:0, dpoy:0, an1:3,  an2:4,  an3:0,  ad1:0,  ad2:0,  win:10, pop:6 },
  { id:"boozer-60s",  name:"Bob Boozer",             decade:"1960s", pos:"PF", positions:["PF","C"],      team:"Royals",          pts:16.6, reb:9.9,  ast:1.7,  stl:0.0, blk:0.0, mvp:0,  fmvp:0, dpoy:0, an1:1,  an2:0,  an3:0,  ad1:0,  ad2:0,  win:4,  pop:4 },
  // 1980s
  { id:"worthy-80s",  name:"James Worthy",           decade:"1980s", pos:"SF", positions:["SF","PF"],     team:"Lakers",          pts:19.6, reb:6.7,  ast:3.0,  stl:1.4, blk:0.7, mvp:0,  fmvp:1, dpoy:0, an1:0,  an2:2,  an3:3,  ad1:0,  ad2:0,  win:9,  pop:7 },
  { id:"rodman-90s",  name:"Dennis Rodman",          decade:"1990s", pos:"PF", positions:["PF","SF","C"], team:"Pistons/Bulls",   pts:7.3,  reb:13.1, ast:1.8,  stl:0.7, blk:0.5, mvp:0,  fmvp:0, dpoy:2, an1:0,  an2:2,  an3:2,  ad1:4,  ad2:3,  win:10, pop:8 },
  // 2010s entries for players only listed in 2000s
  { id:"dirk-10s",    name:"Dirk Nowitzki",          decade:"2010s", pos:"PF", positions:["PF","C"],      team:"Mavericks",       pts:21.3, reb:6.9,  ast:2.6,  stl:0.7, blk:0.9, mvp:0,  fmvp:1, dpoy:0, an1:2,  an2:3,  an3:2,  ad1:0,  ad2:0,  win:5,  pop:8 },
  { id:"wade-10s",    name:"Dwyane Wade",            decade:"2010s", pos:"SG", positions:["SG","SF"],     team:"Heat",            pts:21.5, reb:4.5,  ast:5.0,  stl:1.5, blk:0.7, mvp:0,  fmvp:0, dpoy:0, an1:1,  an2:4,  an3:1,  ad1:0,  ad2:1,  win:8,  pop:9 },
  { id:"kg-10s",      name:"Kevin Garnett",          decade:"2010s", pos:"PF", positions:["PF","C"],      team:"Celtics",         pts:14.9, reb:8.5,  ast:2.5,  stl:1.0, blk:1.1, mvp:0,  fmvp:0, dpoy:0, an1:0,  an2:1,  an3:2,  ad1:1,  ad2:2,  win:6,  pop:7 },
  { id:"dwight-10s",  name:"Dwight Howard",          decade:"2010s", pos:"C",  positions:["C"],           team:"Magic/Lakers",    pts:17.8, reb:12.7, ast:1.5,  stl:1.0, blk:2.2, mvp:0,  fmvp:0, dpoy:3, an1:3,  an2:1,  an3:0,  ad1:5,  ad2:3,  win:4,  pop:8 },
  { id:"bosh-10s",    name:"Chris Bosh",             decade:"2010s", pos:"PF", positions:["PF","C"],      team:"Heat",            pts:18.0, reb:7.4,  ast:1.7,  stl:0.8, blk:1.2, mvp:0,  fmvp:0, dpoy:0, an1:0,  an2:1,  an3:2,  ad1:0,  ad2:0,  win:8,  pop:6 },
  { id:"pg-10s",      name:"Paul George",            decade:"2010s", pos:"SF", positions:["SF","SG","PF"],team:"Pacers/Thunder",  pts:21.8, reb:6.5,  ast:3.7,  stl:1.8, blk:0.4, mvp:0,  fmvp:0, dpoy:0, an1:2,  an2:4,  an3:2,  ad1:4,  ad2:3,  win:4,  pop:7 },
  { id:"dmitch-10s",  name:"Donovan Mitchell",       decade:"2010s", pos:"PG", positions:["PG","SG"],     team:"Jazz",            pts:23.9, reb:3.8,  ast:4.6,  stl:1.3, blk:0.3, mvp:0,  fmvp:0, dpoy:0, an1:0,  an2:1,  an3:1,  ad1:0,  ad2:0,  win:4,  pop:6 },
  // 2020s
  { id:"jbrown-20s",  name:"Jaylen Brown",           decade:"2020s", pos:"SG", positions:["SG","SF"],     team:"Celtics",         pts:23.0, reb:5.5,  ast:3.5,  stl:1.1, blk:0.4, mvp:0,  fmvp:1, dpoy:0, an1:1,  an2:1,  an3:1,  ad1:0,  ad2:1,  win:6,  pop:7 },
  { id:"pg-20s",      name:"Paul George",            decade:"2020s", pos:"SF", positions:["SF","SG"],     team:"Clippers/76ers",  pts:21.0, reb:6.1,  ast:3.8,  stl:1.5, blk:0.4, mvp:0,  fmvp:0, dpoy:0, an1:0,  an2:1,  an3:2,  ad1:1,  ad2:2,  win:3,  pop:6 },
  { id:"dmitch-20s",  name:"Donovan Mitchell",       decade:"2020s", pos:"PG", positions:["PG","SG"],     team:"Cavaliers",       pts:26.6, reb:4.4,  ast:6.0,  stl:1.4, blk:0.3, mvp:0,  fmvp:0, dpoy:0, an1:1,  an2:1,  an3:0,  ad1:0,  ad2:0,  win:4,  pop:7 },
  { id:"murray-20s",  name:"Jamal Murray",           decade:"2020s", pos:"PG", positions:["PG","SG"],     team:"Nuggets",         pts:21.2, reb:4.1,  ast:6.5,  stl:1.2, blk:0.2, mvp:0,  fmvp:0, dpoy:0, an1:0,  an2:0,  an3:1,  ad1:0,  ad2:0,  win:6,  pop:6 },

];

const DECADES = ["1960s","1970s","1980s","1990s","2000s","2010s","2020s"];
const POSITIONS = ["PG","SG","SF","PF","C"];
const DECADE_COLORS = {
  "1960s":"#7c4dbe","1970s":"#ff6a00","1980s":"#ff0800","1990s":"#1a6bab",
  "2000s":"#fdb927","2010s":"#4a7c59","2020s":"#4a4a4a"
};

function getInitials(n){ return n.split(" ").map(w=>w[0]).join("").slice(0,3); }
function teamStrength(players){
  if(!players.length) return{pts:0,reb:0,ast:0,stl:0,blk:0,total:0};
  const s=players.reduce((a,p)=>({pts:a.pts+p.pts,reb:a.reb+p.reb,ast:a.ast+p.ast,stl:a.stl+p.stl,blk:a.blk+p.blk}),{pts:0,reb:0,ast:0,stl:0,blk:0});

  // 1. Raw stat base
  let raw=s.pts*1.5+s.reb*1.2+s.ast*1.3+s.stl*2.0+s.blk*1.8;

  // 2. Team balance — reward teams with all roles covered
  const hasScorer  =players.some(p=>p.pts>=22);
  const hasPlaymaker=players.some(p=>p.ast>=6);
  const hasRebounder=players.some(p=>p.reb>=8);
  const hasDefender =players.some(p=>(p.stl+p.blk)>=2.8);
  const hasShooter  =players.some(p=>p.pts>=18&&p.ast>=3);
  const balance=[hasScorer,hasPlaymaker,hasRebounder,hasDefender,hasShooter].filter(Boolean).length;
  const balanceBonus=balance*7;

  // 3. Positional diversity — penalise duplicate primary positions (no 2 true Cs, etc)
  const posCnt={};
  players.forEach(p=>{posCnt[p.pos]=(posCnt[p.pos]||0)+1;});
  const dupPenalty=Object.values(posCnt).filter(c=>c>1).reduce((sum,c)=>sum+(c-1)*18,0);

  // 4. Spacing — reward spread scoring (3+ players averaging 18+ pts)
  const spacers=players.filter(p=>p.pts>=18).length;
  const spacingBonus=spacers>=3?spacers*4:0;

  // 5. Defensive versatility — reward teams where multiple players defend
  const defenders=players.filter(p=>(p.stl+p.blk)>=2).length;
  const defBonus=defenders>=2?defenders*5:0;

  // 6. Playmaking depth — penalise teams with zero assist threats (all ball-stoppers)
  const playmakers=players.filter(p=>p.ast>=4).length;
  const pmBonus=playmakers>=2?playmakers*4:-10;

  const total=Math.round(raw+balanceBonus+spacingBonus+defBonus+pmBonus-dupPenalty);
  return {...s,total};
}
function randomTeam(exclude=[], excludeNames=[]){
  // Fill each slot [PG,SG,SF,PF,C] with a position-eligible player.
  // Exclude by ID (already on either team) AND by name (no duplicate player across eras).
  const pool = [...PLAYERS.filter(p=>!exclude.includes(p.id)&&!excludeNames.includes(p.name))].sort(()=>Math.random()-0.5);
  const slots = ["PG","SG","SF","PF","C"];
  const picked = [];
  const usedIds = new Set();
  const usedNames = new Set();

  for (const slot of slots) {
    let candidate = pool.find(p => !usedIds.has(p.id) && !usedNames.has(p.name) && p.positions.includes(slot));
    if (!candidate) candidate = pool.find(p => !usedIds.has(p.id) && !usedNames.has(p.name) && p.pos === slot);
    if (!candidate) candidate = pool.find(p => !usedIds.has(p.id) && !usedNames.has(p.name));
    // Push candidate into its slot position (or null to keep slot alignment)
    if (candidate) { picked.push(candidate); usedIds.add(candidate.id); usedNames.add(candidate.name); }
    else { picked.push(null); }
  }
  return picked;
}

// ── RosterSlot ───────────────────────────────────────────────────────────────
function RosterSlot({player,posLabel,onClick,onRemove,isActive}){
  const dc=player?DECADE_COLORS[player.decade]||"#888":null;
  return(
    <div onClick={!player?onClick:undefined} style={{
      background:player?"#ffffff":isActive?"#e8f4fd":"#faf8f5",
      border:player?`1.5px solid ${dc}55`:isActive?"2px dashed #4b9fc8":"2px dashed #d0cbc4",
      borderRadius:9,padding:"10px 12px",display:"flex",alignItems:"center",gap:8,minHeight:68,
      cursor:!player?"pointer":"default",transition:"all 0.18s",
      boxShadow:player?"0 1px 4px rgba(0,0,0,0.07)":"none"
    }}>
      <div style={{width:26,height:26,borderRadius:"50%",background:player?`${dc}18`:isActive?"#daeef9":"#ede9e4",border:`1px solid ${player?dc+"33":isActive?"#4b9fc8":"#d0cbc4"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:player?dc:isActive?"#4b9fc8":"#a89f94",flexShrink:0}}>
        {posLabel}
      </div>
      {player?(
        <>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:12,fontWeight:700,color:"#1a1612",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{player.name}</div>
            <div style={{fontSize:9,color:dc,fontWeight:600,marginBottom:3}}>{player.decade} · {player.team}</div>
            <div style={{display:"flex",gap:7}}>
              {[["PTS",player.pts],["REB",player.reb],["AST",player.ast],["STL",player.stl],["BLK",player.blk]].map(([k,v])=>(
                <div key={k} style={{textAlign:"center"}}>
                  <div style={{fontSize:10,fontWeight:700,color:k==="PTS"?dc:"#1a1612"}}>{v}</div>
                  <div style={{fontSize:8,color:"#a89f94",fontFamily:"Arial,sans-serif"}}>{k}</div>
                </div>
              ))}
            </div>
          </div>
          <button onClick={e=>{e.stopPropagation();onRemove();}} style={{background:"none",border:"none",color:"#c0392b",cursor:"pointer",fontSize:18,padding:"0 2px",lineHeight:1,opacity:0.5}} onMouseOver={e=>e.target.style.opacity=1} onMouseOut={e=>e.target.style.opacity=0.5}>×</button>
        </>
      ):(
        <div style={{fontSize:11,color:isActive?"#4b9fc8":"#b0a89c",fontStyle:"italic"}}>{isActive?"Tap to pick player…":"Select a player…"}</div>
      )}
    </div>
  );
}

// ── Player Modal ──────────────────────────────────────────────────────────────
function PlayerModal({roster,activePos,allSelected,allSelectedNames,onSelect,onClose}){
  const [search,setSearch]=useState("");
  const [decade,setDecade]=useState("all");
  const [posFilter,setPosFilter]=useState(activePos||"all");
  const rate=p=>(
    (p.pts*1.5+p.reb*1.2+p.ast*1.3+p.stl*2.0+p.blk*1.8) +
    ((p.mvp||0)*30+(p.fmvp||0)*22+(p.dpoy||0)*18) +
    ((p.an1||0)*10+(p.an2||0)*7+(p.an3||0)*4) +
    ((p.ad1||0)*8+(p.ad2||0)*5) +
    ((p.win||5)*5) + ((p.pop||5)*3)
  );
  const eligible=PLAYERS.filter(p=>{
    // posFilter controls position: "all" shows everyone, specific pos filters to that pos
    const posOk=posFilter==="all"?true:p.positions.includes(posFilter);
    const taken=allSelected.includes(p.id)||allSelectedNames.includes(p.name);
    const srch=p.name.toLowerCase().includes(search.toLowerCase())||p.team.toLowerCase().includes(search.toLowerCase());
    const dec=decade==="all"||p.decade===decade;
    return posOk&&srch&&dec&&!taken;
  }).sort((a,b)=>rate(b)-rate(a));
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:1000,display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:60,paddingLeft:12,paddingRight:12}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#faf8f5",borderRadius:16,width:"100%",maxWidth:640,maxHeight:"80vh",display:"flex",flexDirection:"column",boxShadow:"0 24px 80px rgba(0,0,0,0.22)",overflow:"hidden",borderTop:"4px solid #b8860b"}}>
        {/* Modal header */}
        <div style={{padding:"14px 18px",borderBottom:"1px solid #e2ddd6",display:"flex",alignItems:"center",justifyContent:"space-between",background:"#fff"}}>
          <div>
            <div style={{fontSize:11,color:"#a89f94",fontFamily:"Arial,sans-serif",letterSpacing:1}}>SELECT PLAYER{activePos?` · ${activePos}`:""}</div>
            <div style={{fontSize:15,fontWeight:800,color:"#1a1612"}}>{eligible.length} available</div>
          </div>
          <button onClick={onClose} style={{background:"#f0ede8",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",fontSize:18,color:"#6b6258",fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
        </div>
        {/* Filters */}
        <div style={{padding:"10px 14px",borderBottom:"1px solid #e2ddd6",background:"#fff"}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name or team…" autoFocus
            style={{width:"100%",background:"#f5f2ee",border:"1px solid #ddd8d0",borderRadius:8,padding:"8px 12px",color:"#1a1612",fontSize:12,outline:"none",fontFamily:"Arial,sans-serif",boxSizing:"border-box",marginBottom:8}}/>
          <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:6}}>
            <button onClick={()=>setDecade("all")} style={{background:decade==="all"?"#1a1612":"transparent",border:"1.5px solid #a89f94",borderRadius:6,padding:"4px 10px",color:decade==="all"?"#fff":"#6b6258",fontSize:10,cursor:"pointer",fontFamily:"Arial,sans-serif",fontWeight:700}}>ALL</button>
            {DECADES.map(d=>{const dc=DECADE_COLORS[d];return(
              <button key={d} onClick={()=>setDecade(d)} style={{background:decade===d?dc:`${dc}18`,border:`1.5px solid ${dc}`,borderRadius:6,padding:"4px 10px",color:decade===d?"#fff":dc,fontSize:10,cursor:"pointer",fontFamily:"Arial,sans-serif",fontWeight:700}}>{d}</button>
            );})}
          </div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            <button onClick={()=>setPosFilter("all")} style={{background:posFilter==="all"?"#1a1612":"transparent",border:`1px solid ${posFilter==="all"?"#1a1612":"#d0cbc4"}`,borderRadius:6,padding:"3px 9px",color:posFilter==="all"?"#fff":"#6b6258",fontSize:10,cursor:"pointer",fontFamily:"Arial,sans-serif",fontWeight:700}}>ALL POS</button>
            {["PG","SG","SF","PF","C"].map(pos=>(
              <button key={pos} onClick={()=>setPosFilter(pos)} style={{background:posFilter===pos?"#1a1612":"transparent",border:`1px solid ${posFilter===pos?"#1a1612":"#d0cbc4"}`,borderRadius:6,padding:"3px 9px",color:posFilter===pos?"#fff":"#6b6258",fontSize:10,cursor:"pointer",fontFamily:"Arial,sans-serif",fontWeight:700}}>{pos}</button>
            ))}
          </div>
        </div>
        {/* List */}
        <div style={{overflowY:"auto",flex:1,padding:10,display:"flex",flexDirection:"column",gap:6}}>
          {eligible.map(player=>(
            <div key={player.id} onClick={()=>{onSelect(player);onClose();}} style={{background:`${DECADE_COLORS[player.decade]}0a`,border:`1px solid ${DECADE_COLORS[player.decade]}33`,borderRadius:10,padding:"10px 14px",cursor:"pointer",transition:"all 0.12s",display:"flex",alignItems:"center",gap:10}}
              onMouseOver={e=>e.currentTarget.style.background=`${DECADE_COLORS[player.decade]}22`} onMouseOut={e=>e.currentTarget.style.background=`${DECADE_COLORS[player.decade]}0a`}>
              {/* Avatar */}
              <div style={{width:36,height:36,borderRadius:7,background:`${DECADE_COLORS[player.decade]}18`,border:`1.5px solid ${DECADE_COLORS[player.decade]}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:DECADE_COLORS[player.decade],flexShrink:0}}>{getInitials(player.name)}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:700,color:"#1a1612"}}>{player.name}</div>
                <div style={{fontSize:9,marginTop:2,display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
                  {player.positions.map(p=>(
                    <span key={p} style={{background:`${DECADE_COLORS[player.decade]}18`,color:DECADE_COLORS[player.decade],border:`1px solid ${DECADE_COLORS[player.decade]}33`,borderRadius:4,padding:"1px 5px",fontWeight:700,fontSize:9,fontFamily:"Arial,sans-serif"}}>{p}</span>
                  ))}
                  <span style={{color:DECADE_COLORS[player.decade],fontWeight:600}}>{player.decade}</span>
                  <span style={{color:"#a89f94"}}>· {player.team}</span>
                </div>
              </div>
              <div style={{display:"flex",gap:8,flexShrink:0}}>
                {[["PTS",player.pts],["REB",player.reb],["AST",player.ast],["STL",player.stl],["BLK",player.blk]].map(([k,v])=>(
                  <div key={k} style={{textAlign:"center"}}>
                    <div style={{fontSize:11,fontWeight:700,color:k==="PTS"?DECADE_COLORS[player.decade]:"#1a1612"}}>{v}</div>
                    <div style={{fontSize:8,color:"#a89f94",fontFamily:"Arial,sans-serif"}}>{k}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {eligible.length===0&&<div style={{textAlign:"center",padding:"40px 20px",color:"#a89f94",fontSize:13}}>No eligible players found</div>}
        </div>
      </div>
    </div>
  );
}

// ── Results Panel ─────────────────────────────────────────────────────────────
function ResultsPanel({result,myTeam,oppTeam,seriesType,onReset,onRematch,onShare}){
  const winA=result.winner==="Gold"||result.winner==="A";
  return(
    <div style={{animation:"fadeIn 0.5s ease"}}>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{textAlign:"center",marginBottom:24,padding:"28px 20px",background:winA?"linear-gradient(135deg,#fffbe8,#fff8d0)":"linear-gradient(135deg,#e8f4fd,#d6ecfa)",border:`1.5px solid ${winA?"#e6c84a":"#4b9fc8"}`,borderRadius:16,boxShadow:"0 4px 20px rgba(0,0,0,0.1)"}}>
        <div style={{fontSize:10,letterSpacing:4,color:"#6b6258",marginBottom:5,fontFamily:"Arial,sans-serif"}}>WINNER</div>
        <div style={{fontSize:"clamp(26px,6vw,44px)",fontWeight:900,color:winA?"#b8860b":"#1d6fa4",marginBottom:4}}>{winA?"TEAM GOLD":"TEAM BLUE"}</div>
        <div style={{fontSize:20,fontWeight:700,color:"#1a1612",marginBottom:10}}>{seriesType==="single"?"Final Score":"Series Result"}: {result.seriesResult}</div>
        {result.mvp&&(()=>{
          // Roster lookup for decade/team metadata
          const lastName=result.mvp.split(" ").pop();
          const mvpPlayer=[...myTeam,...oppTeam].find(p=>p.name===result.mvp)||
            [...myTeam,...oppTeam].find(p=>p.name.includes(lastName));
          // GAME stats come from the simulated box score (not career averages)
          const allStats=[...(result.teamAStats||[]),...(result.teamBStats||[])];
          const mvpStats=allStats.find(s=>s.name===result.mvp)||
            allStats.find(s=>s.name&&(s.name.includes(lastName)||lastName.includes(s.name.split(" ").pop())));
          const mvpColor=winA?"#b8860b":"#1d6fa4";
          const dcColor=mvpPlayer?DECADE_COLORS[mvpPlayer.decade]:mvpColor;
          const fmt=v=>typeof v==="number"?v.toFixed(1):v;
          return(
            <div style={{display:"inline-block",background:"rgba(255,255,255,0.85)",borderRadius:14,padding:"14px 20px",boxShadow:"0 2px 12px rgba(0,0,0,0.08)",border:`1.5px solid ${mvpColor}33`,textAlign:"left",minWidth:260}}>
              <div style={{fontSize:9,letterSpacing:3,color:mvpColor,fontFamily:"Arial,sans-serif",fontWeight:700,marginBottom:4}}>🏆 {seriesType==="single"?"GAME MVP":"SERIES MVP"}</div>
              <div style={{fontSize:17,fontWeight:900,color:"#1a1612",marginBottom:2}}>{result.mvp}</div>
              {mvpPlayer&&<div style={{fontSize:9,color:dcColor,fontWeight:600,marginBottom:8,fontFamily:"Arial,sans-serif"}}>{mvpPlayer.decade} · {mvpPlayer.team}</div>}
              {mvpStats&&<div style={{display:"flex",gap:14,marginBottom:8}}>
                {[["PTS",mvpStats.pts],["REB",mvpStats.reb],["AST",mvpStats.ast],["STL",mvpStats.stl],["BLK",mvpStats.blk]].map(([k,v])=>(
                  <div key={k} style={{textAlign:"center"}}>
                    <div style={{fontSize:16,fontWeight:800,color:k==="PTS"?mvpColor:"#1a1612"}}>{fmt(v)}</div>
                    <div style={{fontSize:8,color:"#a89f94",fontFamily:"Arial,sans-serif",letterSpacing:1}}>{k}</div>
                  </div>
                ))}
              </div>}
              {result.mvpReason&&<div style={{fontSize:11,color:"#6b6258",lineHeight:1.5,fontStyle:"italic"}}>{result.mvpReason}</div>}
            </div>
          );
        })()}
      </div>
      {result.summary&&<div style={{background:"#fff",border:"1px solid #e2ddd6",borderRadius:12,padding:"16px 18px",marginBottom:18,boxShadow:"0 1px 4px rgba(0,0,0,0.05)"}}>
        <div style={{fontSize:9,letterSpacing:3,color:"#a89f94",marginBottom:6,fontFamily:"Arial,sans-serif"}}>GAME SUMMARY</div>
        <p style={{margin:0,fontSize:13,lineHeight:1.75,color:"#1a1612"}}>{result.summary}</p>
      </div>}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:18}}>
        {[{team:myTeam,stats:result.teamAStats,label:"Team Gold",color:"#b8860b"},{team:oppTeam,stats:result.teamBStats,label:"Team Blue",color:"#1d6fa4"}].map(({team,stats,label,color})=>(
          <div key={label} style={{background:"#fff",border:"1px solid #e2ddd6",borderRadius:12,padding:12,boxShadow:"0 1px 4px rgba(0,0,0,0.05)"}}>
            <div style={{fontSize:11,fontWeight:800,color,marginBottom:8,letterSpacing:1,fontFamily:"Arial,sans-serif"}}>{label}</div>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead><tr>{["PLAYER","PTS","REB","AST","STL","BLK"].map(h=><th key={h} style={{textAlign:h==="PLAYER"?"left":"right",padding:"3px 4px",color:"#a89f94",fontWeight:600,fontFamily:"Arial,sans-serif",fontSize:9}}>{h}</th>)}</tr></thead>
              <tbody>{(stats||team.map(p=>({name:p.name,pts:p.pts,reb:p.reb,ast:p.ast,stl:p.stl,blk:p.blk}))).slice(0,5).map((s,i)=>(
                <tr key={i} style={{borderTop:"1px solid #f0ede8"}}>
                  <td style={{padding:"5px 4px",color:"#1a1612",fontWeight:600,fontSize:10}}>{s.name.split(" ").pop()}</td>
                  {[s.pts,s.reb,s.ast,s.stl,s.blk].map((v,j)=>(
                    <td key={j} style={{textAlign:"right",padding:"5px 4px",color:j===0?color:"#6b6258",fontWeight:j===0?700:400}}>{typeof v==="number"?v.toFixed(1):v}</td>
                  ))}
                </tr>
              ))}</tbody>
            </table>
          </div>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:26}}>
        {[{label:"Team Gold",color:"#b8860b",bg:"#fffbe8",strengths:result.teamAStrengths,weaknesses:result.teamAWeaknesses},{label:"Team Blue",color:"#1d6fa4",bg:"#e8f4fd",strengths:result.teamBStrengths,weaknesses:result.teamBWeaknesses}].map(({label,color,bg,strengths,weaknesses})=>(
          <div key={label} style={{background:bg,border:`1px solid ${color}33`,borderRadius:12,padding:14}}>
            <div style={{fontSize:11,fontWeight:800,color,marginBottom:10,letterSpacing:1,fontFamily:"Arial,sans-serif"}}>{label}</div>
            {strengths?.length>0&&<div style={{marginBottom:8}}>
              <div style={{fontSize:9,color:"#a89f94",marginBottom:4,letterSpacing:2,fontFamily:"Arial,sans-serif"}}>STRENGTHS</div>
              {strengths.map((s,i)=><div key={i} style={{fontSize:11,color:"#1a1612",marginBottom:3,paddingLeft:9,borderLeft:`2px solid ${color}88`}}>{s}</div>)}
            </div>}
            {weaknesses?.length>0&&<div>
              <div style={{fontSize:9,color:"#a89f94",marginBottom:4,letterSpacing:2,fontFamily:"Arial,sans-serif"}}>WEAKNESSES</div>
              {weaknesses.map((w,i)=><div key={i} style={{fontSize:11,color:"#6b6258",marginBottom:3,paddingLeft:9,borderLeft:"2px solid #c0392b88"}}>{w}</div>)}
            </div>}
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:10,justifyContent:"center"}}>
        <button onClick={onShare} style={{background:"#1a1612",border:"none",borderRadius:10,padding:"12px 22px",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",letterSpacing:1,fontFamily:"Arial,sans-serif",display:"flex",alignItems:"center",gap:6}}>⬡ SHARE</button>
        <button onClick={onRematch} style={{background:"#fffbe8",border:"1.5px solid #b8860b",borderRadius:10,padding:"12px 22px",color:"#b8860b",fontSize:12,fontWeight:700,cursor:"pointer",letterSpacing:1,fontFamily:"Arial,sans-serif",boxShadow:"0 2px 8px rgba(184,134,11,0.15)"}}>↻ REMATCH</button>
        <button onClick={onReset} style={{background:"#f0ede8",border:"1px solid #d0cbc4",borderRadius:10,padding:"12px 22px",color:"#6b6258",fontSize:12,fontWeight:700,cursor:"pointer",letterSpacing:1,fontFamily:"Arial,sans-serif"}}>NEW GAME</button>
      </div>
    </div>
  );
}


// ── Login Modal ──────────────────────────────────────────────────────────────
function LoginModal({onClose}){
  const [tab,setTab]=useState("signin");
  const [email,setEmail]=useState("");
  const [pass,setPass]=useState("");
  const [showPass,setShowPass]=useState(false);
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:420,padding:"32px 28px",boxShadow:"0 24px 80px rgba(0,0,0,0.25)",position:"relative"}}>
        <button onClick={onClose} style={{position:"absolute",top:14,right:16,background:"none",border:"none",fontSize:22,color:"#a89f94",cursor:"pointer",lineHeight:1}}>×</button>
        {/* Logo */}
        <div style={{textAlign:"center",marginBottom:20}}>
          <div style={{fontSize:22,fontWeight:900,color:"#1a1612",letterSpacing:"-1px",fontFamily:"Georgia,serif"}}>
            ERA<span style={{background:"linear-gradient(135deg,#b8860b,#e6c84a)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>CLASH</span>
          </div>
          <div style={{fontSize:9,letterSpacing:3,color:"#a89f94",fontFamily:"Arial,sans-serif",marginTop:2}}>BASKETBALL</div>
        </div>
        {/* Tabs */}
        <div style={{display:"flex",background:"#f0ede8",borderRadius:10,padding:3,marginBottom:22}}>
          {[["signin","Sign In"],["signup","Sign Up"]].map(([val,label])=>(
            <button key={val} onClick={()=>setTab(val)} style={{flex:1,background:tab===val?"#fff":"transparent",border:"none",borderRadius:8,padding:"8px 0",fontSize:13,fontWeight:700,color:tab===val?"#1a1612":"#a89f94",cursor:"pointer",transition:"all 0.15s",boxShadow:tab===val?"0 1px 4px rgba(0,0,0,0.08)":"none"}}>{label}</button>
          ))}
        </div>
        {/* SSO Buttons */}
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:18}}>
          {[
            {label:"Continue with Google",bg:"#fff",border:"1.5px solid #e2ddd6",color:"#1a1612",icon:"G"},
            {label:"Continue with Apple",bg:"#1a1612",border:"1.5px solid #1a1612",color:"#fff",icon:""},
          ].map(({label,bg,border,color,icon})=>(
            <button key={label} style={{width:"100%",background:bg,border,borderRadius:10,padding:"11px 16px",fontSize:13,fontWeight:600,color,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10,fontFamily:"Arial,sans-serif",transition:"opacity 0.15s"}}
              onMouseOver={e=>e.currentTarget.style.opacity="0.85"} onMouseOut={e=>e.currentTarget.style.opacity="1"}>
              <span style={{fontSize:16,fontWeight:800}}>{icon}</span>{label}
            </button>
          ))}
        </div>
        {/* Divider */}
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
          <div style={{flex:1,height:1,background:"#e2ddd6"}}/>
          <span style={{fontSize:11,color:"#a89f94",fontFamily:"Arial,sans-serif"}}>or</span>
          <div style={{flex:1,height:1,background:"#e2ddd6"}}/>
        </div>
        {/* Email/Pass */}
        <div style={{marginBottom:14}}>
          <label style={{fontSize:12,fontWeight:700,color:"#1a1612",display:"block",marginBottom:5,fontFamily:"Arial,sans-serif"}}>Email</label>
          <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Enter your email" type="email"
            style={{width:"100%",background:"#faf8f5",border:"1.5px solid #e2ddd6",borderRadius:9,padding:"11px 14px",fontSize:13,color:"#1a1612",outline:"none",boxSizing:"border-box",fontFamily:"Arial,sans-serif"}}/>
        </div>
        <div style={{marginBottom:6}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
            <label style={{fontSize:12,fontWeight:700,color:"#1a1612",fontFamily:"Arial,sans-serif"}}>Password</label>
            {tab==="signin"&&<button style={{background:"none",border:"none",fontSize:12,color:"#a89f94",cursor:"pointer",fontFamily:"Arial,sans-serif"}}>Forgot password?</button>}
          </div>
          <div style={{position:"relative"}}>
            <input value={pass} onChange={e=>setPass(e.target.value)} placeholder="Enter your password" type={showPass?"text":"password"}
              style={{width:"100%",background:"#faf8f5",border:"1.5px solid #e2ddd6",borderRadius:9,padding:"11px 40px 11px 14px",fontSize:13,color:"#1a1612",outline:"none",boxSizing:"border-box",fontFamily:"Arial,sans-serif"}}/>
            <button onClick={()=>setShowPass(!showPass)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:16,color:"#a89f94",lineHeight:1}}>{showPass?"🙈":"👁"}</button>
          </div>
        </div>
        <button style={{width:"100%",background:"linear-gradient(135deg,#b8860b,#e6c84a)",border:"none",borderRadius:10,padding:"13px",fontSize:14,fontWeight:800,color:"#1a1208",cursor:"pointer",marginTop:14,letterSpacing:1,fontFamily:"Arial,sans-serif",boxShadow:"0 4px 16px rgba(184,134,11,0.3)"}}
          onMouseOver={e=>e.currentTarget.style.opacity="0.9"} onMouseOut={e=>e.currentTarget.style.opacity="1"}>
          {tab==="signin"?"Sign In":"Create Account"}
        </button>
        <div style={{textAlign:"center",marginTop:16,fontSize:12,color:"#6b6258",fontFamily:"Arial,sans-serif"}}>
          {tab==="signin"?"Don't have an account? ":"Already have an account? "}
          <button onClick={()=>setTab(tab==="signin"?"signup":"signin")} style={{background:"none",border:"none",fontSize:12,fontWeight:700,color:"#b8860b",cursor:"pointer",fontFamily:"Arial,sans-serif"}}>
            {tab==="signin"?"Sign up":"Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── How To Play Modal ─────────────────────────────────────────────────────────
function HowToPlayModal({onClose}){
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:2000,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"24px 16px",overflowY:"auto"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:620,padding:"32px 28px",boxShadow:"0 24px 80px rgba(0,0,0,0.2)",position:"relative",marginBottom:24}}>
        <button onClick={onClose} style={{position:"absolute",top:14,right:16,background:"none",border:"none",fontSize:22,color:"#a89f94",cursor:"pointer"}}>×</button>
        <div style={{fontSize:10,letterSpacing:4,color:"#b8860b",fontFamily:"Arial,sans-serif",marginBottom:4}}>ERACLASH BASKETBALL</div>
        <h2 style={{fontSize:26,fontWeight:900,color:"#1a1612",margin:"0 0 6px",letterSpacing:"-0.5px"}}>How To Play</h2>
        <p style={{fontSize:13,color:"#6b6258",lineHeight:1.7,marginBottom:24}}>Build the ultimate 5-on-5 all-time NBA squad, clash across eras, and let the AI simulate the outcome.</p>
        {[
          {num:"1",title:"Build Your Team",body:"Select 5 players for Team Gold — your squad. You can pick manually by clicking any position slot, or hit Generate Random Team to let EraClash build a position-correct lineup for you. Players span 7 decades from the 1960s through the 2020s, and many can play multiple positions."},
          {num:"2",title:"Set Your Opponent",body:"Team Blue is your opponent. Set them to Random for a quick AI-generated challenge, or switch to Manual and hand-pick their roster yourself — great for testing dream matchups like 90s Bulls vs 2010s Warriors."},
          {num:"3",title:"Choose Your Format",body:"Pick Single Game for a one-off matchup with a final score, or Best of 7 for a full playoff series with a game-by-game breakdown. The Best of 7 generates a richer narrative and deeper analysis."},
          {num:"4",title:"Run The Simulation",body:"Once both rosters are full, hit \"Run Simulation.\" EraClash AI evaluates each player's peak statistics from their era, factors in position matchups, team synergy, and historical context, then generates a full result — projected box scores, MVP, and a detailed game or series summary."},
          {num:"5",title:"Read The Results",body:"Your results include projected stats for every player, an MVP award with reasoning, a narrative game summary, and a strengths & weaknesses breakdown for both teams. Use it to settle debates, test hypotheticals, or just have fun."},
          {num:"6",title:"Rematch or Start Fresh",body:"Hit Rematch to run the same matchup again — the AI may surprise you with a different outcome. Hit New Game to clear both rosters and start over."},
        ].map(({num,title,body})=>(
          <div key={num} style={{display:"flex",gap:14,marginBottom:20}}>
            <div style={{width:32,height:32,borderRadius:"50%",background:"linear-gradient(135deg,#b8860b,#e6c84a)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:900,color:"#1a1208",flexShrink:0}}>{num}</div>
            <div>
              <div style={{fontSize:14,fontWeight:800,color:"#1a1612",marginBottom:3}}>{title}</div>
              <div style={{fontSize:12,color:"#6b6258",lineHeight:1.7}}>{body}</div>
            </div>
          </div>
        ))}

      </div>
    </div>
  );
}

// ── Privacy Policy Modal ──────────────────────────────────────────────────────
function PrivacyModal({onClose}){
  const Section=({title,children})=>(
    <div style={{marginBottom:20}}>
      <div style={{fontSize:14,fontWeight:800,color:"#1a1612",marginBottom:6}}>{title}</div>
      <div style={{fontSize:12,color:"#6b6258",lineHeight:1.75}}>{children}</div>
    </div>
  );
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:2000,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"24px 16px",overflowY:"auto"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:620,padding:"32px 28px",boxShadow:"0 24px 80px rgba(0,0,0,0.2)",position:"relative",marginBottom:24}}>
        <button onClick={onClose} style={{position:"absolute",top:14,right:16,background:"none",border:"none",fontSize:22,color:"#a89f94",cursor:"pointer"}}>×</button>
        <div style={{fontSize:10,letterSpacing:4,color:"#b8860b",fontFamily:"Arial,sans-serif",marginBottom:4}}>ERACLASH BASKETBALL</div>
        <h2 style={{fontSize:26,fontWeight:900,color:"#1a1612",margin:"0 0 4px",letterSpacing:"-0.5px"}}>Privacy Policy</h2>
        <div style={{fontSize:11,color:"#a89f94",fontFamily:"Arial,sans-serif",marginBottom:24}}>Effective Date: June 5, 2026</div>
        <Section title="1. Introduction">At EraClashBasketball.com, operated by EraClash Sports, one of our main priorities is the privacy of our visitors. This Privacy Policy outlines the types of information collected and recorded by EraClashBasketball.com and how we use it. By using our website, you agree to the terms described here.</Section>
        <Section title="2. Information We Collect">
          <b>Account Information:</b> When you register, we collect your email address and authentication credentials to identify your account and save your game history.<br/><br/>
          <b>Log Data:</b> We collect standard log data including IP addresses, browser type, device type, referring pages, and timestamps. This data is not linked to personally identifiable information.<br/><br/>
          <b>Game Data:</b> We store your simulation history, team configurations, and results to power your personal game history and future leaderboard features.
        </Section>
        <Section title="3. How We Use Your Information">We use collected information to provide and improve EraClashBasketball.com, save your game history, personalize your experience, communicate account-related updates, and prevent fraud and abuse.</Section>
        <Section title="4. Cookies">EraClashBasketball.com uses cookies to store session preferences and improve your experience. You can instruct your browser to refuse cookies, though some features may not function properly without them.</Section>
        <Section title="5. Third-Party Services">We use the following third-party services: <b>Vercel</b> for hosting; <b>Anthropic</b> for AI-powered game simulation (no personal data is sent to Anthropic — only anonymized game data); and <b>Authentication providers</b> (Google, Apple) if you choose SSO login.</Section>
        <Section title="6. Data Protection Rights">You have the right to access, correct, or request deletion of your personal data at any time. To exercise these rights, contact us at privacy@eraclashsports.com.</Section>
        <Section title="7. Children's Privacy">EraClashBasketball.com does not knowingly collect information from children under the age of 13. If you believe your child has provided personal information, contact us immediately and we will remove it promptly.</Section>
        <Section title="8. Changes to This Policy">We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated effective date. Continued use of the site constitutes acceptance of the updated policy.</Section>
        <Section title="9. Contact Us">For questions about this Privacy Policy, contact us at: <b>privacy@eraclashsports.com</b></Section>
      </div>
    </div>
  );
}

// ── Contact Modal ─────────────────────────────────────────────────────────────
function ContactModal({onClose}){
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:420,padding:"32px 28px",boxShadow:"0 24px 80px rgba(0,0,0,0.2)",position:"relative"}}>
        <button onClick={onClose} style={{position:"absolute",top:14,right:16,background:"none",border:"none",fontSize:22,color:"#a89f94",cursor:"pointer"}}>×</button>
        <div style={{fontSize:10,letterSpacing:4,color:"#b8860b",fontFamily:"Arial,sans-serif",marginBottom:4}}>GET IN TOUCH</div>
        <h2 style={{fontSize:26,fontWeight:900,color:"#1a1612",margin:"0 0 6px",letterSpacing:"-0.5px"}}>Contact Us</h2>
        <p style={{fontSize:13,color:"#6b6258",lineHeight:1.7,marginBottom:24}}>Have feedback, questions, or want to report an issue? We'd love to hear from you.</p>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {[
            {label:"General Inquiries",value:"hello@eraclashsports.com"},
            {label:"Privacy & Data",value:"privacy@eraclashsports.com"},
            {label:"Support",value:"support@eraclashsports.com"},
          ].map(({label,value})=>(
            <div key={label} style={{background:"#faf8f5",border:"1px solid #e2ddd6",borderRadius:10,padding:"12px 16px"}}>
              <div style={{fontSize:10,letterSpacing:2,color:"#a89f94",fontFamily:"Arial,sans-serif",marginBottom:2}}>{label.toUpperCase()}</div>
              <div style={{fontSize:13,fontWeight:700,color:"#b8860b"}}>{value}</div>
            </div>
          ))}
        </div>
        <div style={{marginTop:20,padding:"12px 16px",background:"#fffbe8",border:"1px solid #e6c84a33",borderRadius:10,fontSize:12,color:"#6b6258",lineHeight:1.6}}>
          Contact information will be updated soon. Thank you for your patience.
        </div>
      </div>
    </div>
  );
}


// ── Share Modal ───────────────────────────────────────────────────────────────
function ShareModal({result,myTeam,oppTeam,seriesType,onClose}){
  const [copied,setCopied]=useState(false);
  const winA=result.winner==="Gold"||result.winner==="A";
  const winner=winA?"Team Gold":"Team Blue";
  const format=seriesType==="single"?"Single Game":"Best of 7";
  const shareText=`I just simulated ${myTeam.filter(Boolean).map(p=>p.name).join(", ")} vs ${oppTeam.filter(Boolean).map(p=>p.name).join(", ")} on EraClash Basketball. ${winner} won ${result.seriesResult}! Can you build a better squad?`;
  const shareUrl="https://eraclashbasketball.com";
  const encodedText=encodeURIComponent(shareText);
  const encodedUrl=encodeURIComponent(shareUrl);

  function copyLink(){
    navigator.clipboard.writeText(shareUrl).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);});
  }

  const socials=[
    {label:"X / Twitter",bg:"#000",icon:"𝕏",url:`https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`},
    {label:"Facebook",bg:"#1877f2",icon:"f",url:`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`},
    {label:"WhatsApp",bg:"#25d366",icon:"💬",url:`https://wa.me/?text=${encodedText}%20${encodedUrl}`},
    {label:"Reddit",bg:"#ff4500",icon:"👾",url:`https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedText}`},
  ];

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:400,padding:"28px 24px",boxShadow:"0 24px 80px rgba(0,0,0,0.25)",position:"relative"}}>
        <button onClick={onClose} style={{position:"absolute",top:14,right:16,background:"none",border:"none",fontSize:22,color:"#a89f94",cursor:"pointer",lineHeight:1}}>×</button>
        <div style={{fontSize:11,fontWeight:800,color:"#1a1612",letterSpacing:2,fontFamily:"Arial,sans-serif",marginBottom:4}}>SHARE YOUR MATCHUP</div>
        {/* Result card */}
        <div style={{background:"linear-gradient(135deg,#1a1612,#2c2418)",borderRadius:14,padding:"18px 16px",marginBottom:18}}>
          <div style={{fontSize:9,letterSpacing:3,color:"rgba(255,255,255,0.45)",fontFamily:"Arial,sans-serif",marginBottom:8}}>ERACLASH BASKETBALL</div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
            <div>
              <div style={{fontSize:11,color:"rgba(255,255,255,0.45)",fontFamily:"Arial,sans-serif",marginBottom:2}}>{format} Result</div>
              <div style={{fontSize:28,fontWeight:900,color:winA?"#e6c84a":"#4b9fc8",lineHeight:1}}>{result.seriesResult}</div>
              <div style={{fontSize:12,fontWeight:700,color:"#fff",marginTop:3}}>{winner} wins</div>
            </div>
            {result.mvp&&<div style={{textAlign:"right"}}>
              <div style={{fontSize:9,letterSpacing:2,color:"rgba(255,255,255,0.4)",fontFamily:"Arial,sans-serif",marginBottom:2}}>MVP</div>
              <div style={{fontSize:12,fontWeight:700,color:"#e6c84a"}}>{result.mvp}</div>
            </div>}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            {[{label:"GOLD",players:myTeam,color:"#e6c84a"},{label:"BLUE",players:oppTeam,color:"#4b9fc8"}].map(({label,players,color})=>(
              <div key={label}>
                <div style={{fontSize:9,letterSpacing:2,color,fontFamily:"Arial,sans-serif",marginBottom:4}}>{label}</div>
                {players.map(p=>(
                  <div key={p.id} style={{fontSize:10,color:"rgba(255,255,255,0.7)",marginBottom:2}}>{p.name} <span style={{color:"rgba(255,255,255,0.35)",fontSize:9}}>({p.decade})</span></div>
                ))}
              </div>
            ))}
          </div>
          <div style={{marginTop:12,fontSize:9,color:"rgba(255,255,255,0.3)",fontFamily:"Arial,sans-serif",textAlign:"right",letterSpacing:1}}>ERACLASHBASKETBALL.COM</div>
        </div>
        {/* Social buttons */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
          {socials.map(({label,bg,icon,url})=>(
            <a key={label} href={url} target="_blank" rel="noopener noreferrer" style={{background:bg,borderRadius:10,padding:"12px 8px",color:"#fff",fontSize:12,fontWeight:700,textDecoration:"none",display:"flex",alignItems:"center",justifyContent:"center",gap:6,fontFamily:"Arial,sans-serif"}}>
              <span style={{fontSize:14}}>{icon}</span>{label}
            </a>
          ))}
        </div>
        {/* Copy link */}
        <button onClick={copyLink} style={{width:"100%",background:copied?"#e8f8ee":"#faf8f5",border:`1.5px solid ${copied?"#4bb87a":"#e2ddd6"}`,borderRadius:10,padding:"12px",fontSize:13,fontWeight:700,color:copied?"#2e8c58":"#1a1612",cursor:"pointer",fontFamily:"Arial,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:8,transition:"all 0.2s"}}>
          {copied?"✓ Copied!":"⬡ Copy Link"}
        </button>
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App(){
  const [phase,setPhase]=useState("build");
  const EMPTY=[null,null,null,null,null];
  const [myTeam,setMyTeam]=useState(EMPTY);
  const [oppTeam,setOppTeam]=useState(EMPTY);
  const [myMode,setMyMode]=useState("manual");
  const [oppMode,setOppMode]=useState("manual");
  const [seriesType,setSeriesType]=useState("single");
  const [result,setResult]=useState(null);
  const [error,setError]=useState(null);
  // Modal state: { roster:"my"|"opp", slotIndex:0-4, pos:"PG"|... }
  const [modal,setModal]=useState(null);
  const [showShare,setShowShare]=useState(false);
  const [showLogin,setShowLogin]=useState(false);
  const [showHowTo,setShowHowTo]=useState(false);
  const [showPrivacy,setShowPrivacy]=useState(false);
  const [showContact,setShowContact]=useState(false);
  const topRef=useRef(null);

  const myFilled=myTeam.filter(Boolean);
  const oppFilled=oppTeam.filter(Boolean);
  const allSelectedIds=[...myFilled.map(p=>p.id),...oppFilled.map(p=>p.id)];

  function addPlayer(player){
    if(!modal) return;
    // Block same player name on EITHER team (no two MJs across eras or teams)
    const allTeams=[...myFilled,...oppFilled];
    if(allTeams.find(p=>p.name===player.name)) return;
    const idx=modal.slotIndex;
    if(modal.roster==="my"){ const nt=[...myTeam]; nt[idx]=player; setMyTeam(nt); }
    else { const nt=[...oppTeam]; nt[idx]=player; setOppTeam(nt); }
    setModal(null);
  }
  function removePlayer(idx,r){ if(r==="my"){ const nt=[...myTeam]; nt[idx]=null; setMyTeam(nt); } else { const nt=[...oppTeam]; nt[idx]=null; setOppTeam(nt); } }
  function handleRandomizeGold(){ setMyTeam(randomTeam(oppFilled.map(p=>p.id), oppFilled.map(p=>p.name))); }
  function handleRandomize(){ setOppTeam(randomTeam(myFilled.map(p=>p.id), myFilled.map(p=>p.name))); }
  function openSlot(roster,slotIndex){
    // Gold: always open in manual mode; Blue: always open in manual mode
    const pos=POSITIONS[slotIndex];
    setModal({roster,slotIndex,pos});
  }

  const canSimulate=myFilled.length===5&&oppFilled.length===5;

  async function runSimulation(){
    if(!canSimulate) return;
    setError(null); setPhase("simulate");
    try{
      const res=await fetch("/api/simulate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({myTeam:myFilled,oppTeam:oppFilled,seriesType})});
      const data=await res.json();
      if(data.error){throw new Error(data.error||"Simulation error");}
      const text=data.text||"";
      // Extract JSON robustly — find first { and last }
      const jsonStart=text.indexOf("{");
      const jsonEnd=text.lastIndexOf("}");
      if(jsonStart===-1||jsonEnd===-1) throw new Error("No JSON in response");
      const parsed=JSON.parse(text.slice(jsonStart,jsonEnd+1));

      // ── Enforce 100% accuracy: reconcile box scores with final result ──
      const sumPts=arr=>(arr||[]).slice(0,5).reduce((s,p)=>s+(Number(p.pts)||0),0);
      const goldPts=sumPts(parsed.teamAStats);
      const bluePts=sumPts(parsed.teamBStats);

      if(seriesType==="single"){
        // Single game: final score IS the sum of each team's box score points.
        // Derive winner from the higher total — mathematically guaranteed to match.
        let g=goldPts, b=bluePts;
        if(g===b){ // break impossible-tie by nudging the AI's intended winner
          const winnerIsGold=parsed.winner==="Gold"||parsed.winner==="A";
          if(winnerIsGold&&parsed.teamAStats?.[0]){parsed.teamAStats[0].pts=(Number(parsed.teamAStats[0].pts)||0)+3; g+=3;}
          else if(parsed.teamBStats?.[0]){parsed.teamBStats[0].pts=(Number(parsed.teamBStats[0].pts)||0)+3; b+=3;}
        }
        parsed.winner=g>b?"Gold":"Blue";
        parsed.seriesResult=`${Math.max(g,b)}-${Math.min(g,b)}`;
      } else {
        // Best of 7: result is games won (e.g. "4-2"). Ensure winner matches the higher number.
        const m=String(parsed.seriesResult||"").match(/(\d+)\s*[-–]\s*(\d+)/);
        if(m){
          const a=parseInt(m[1],10), bb=parseInt(m[2],10);
          // winner's games should be listed first; if winner=Blue, ensure first number is the larger
          const hi=Math.max(a,bb), lo=Math.min(a,bb);
          parsed.seriesResult=`${hi}-${lo}`;
        }
      }

      setResult(parsed); setPhase("results");
      setTimeout(()=>topRef.current?.scrollIntoView({behavior:"smooth"}),100);
    }catch(e){ console.error("Sim error:",e); setError("Simulation failed. Please try again."); setPhase("build"); }
  }

  function resetGame(){ setPhase("build");setResult(null);setError(null);setMyTeam(EMPTY);setOppTeam(EMPTY); }
  const myS=teamStrength(myFilled); const oppS=teamStrength(oppFilled);

  return(
    <div style={{minHeight:"100vh",background:"#f0ede8",fontFamily:"Georgia,serif",color:"#1a1612"}}>
      <style>{`
        *{box-sizing:border-box;}
        @media(max-width:640px){
          .roster-grid{grid-template-columns:1fr!important;}
          .sim-btn{padding:14px 24px!important;font-size:13px!important;}
          .modal-inner{padding:24px 18px!important;}
          .footer-links{gap:6px!important;}
        }
      `}</style>
      {/* Subtle top accent */}
      <div style={{height:4,background:"linear-gradient(90deg,#b8860b,#e6c84a,#1d6fa4)"}}/>
      {/* Navbar */}
      <div style={{background:"#fff",borderBottom:"1px solid #e2ddd6",padding:"0 20px"}}>
        <div style={{maxWidth:1100,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",height:48}}>
          <div onClick={()=>resetGame()} style={{fontSize:13,fontWeight:900,color:"#1a1612",letterSpacing:"-0.5px",fontFamily:"Georgia,serif",cursor:"pointer",userSelect:"none"}} title="Back to home">
            ERA<span style={{background:"linear-gradient(135deg,#b8860b,#e6c84a)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>CLASH</span>
            <span style={{fontSize:9,fontWeight:700,color:"#a89f94",marginLeft:6,letterSpacing:2,fontFamily:"Arial,sans-serif",verticalAlign:"middle"}}>BASKETBALL</span>
          </div>
          <button onClick={()=>setShowLogin(true)} style={{background:"linear-gradient(135deg,#b8860b,#e6c84a)",border:"none",borderRadius:8,padding:"7px 18px",fontSize:12,fontWeight:800,color:"#1a1208",cursor:"pointer",letterSpacing:1,fontFamily:"Arial,sans-serif",boxShadow:"0 2px 8px rgba(184,134,11,0.25)"}}>Sign In</button>
        </div>
      </div>
      <div ref={topRef} style={{maxWidth:1100,margin:"0 auto",padding:"0 14px 60px"}}>

        {/* Header */}
        <div style={{textAlign:"center",padding:"32px 0 22px"}}>
          <a href="https://eraclashsports.com" target="_blank" rel="noopener noreferrer" style={{fontSize:10,letterSpacing:6,color:"#a89f94",marginBottom:6,fontFamily:"Arial,sans-serif",display:"block",textDecoration:"none"}} onMouseOver={e=>e.currentTarget.style.color="#b8860b"} onMouseOut={e=>e.currentTarget.style.color="#a89f94"}>ERACLASHSPORTS.COM</a>
          <h1 onClick={()=>resetGame()} style={{fontSize:"clamp(38px,7vw,62px)",fontWeight:900,margin:0,lineHeight:1,color:"#1a1612",letterSpacing:"-2px",cursor:"pointer"}} title="Back to home">
            ERA<span style={{background:"linear-gradient(135deg,#b8860b,#e6c84a)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>CLASH</span>
          </h1>
          <div style={{fontSize:13,fontWeight:700,color:"#1a1612",marginTop:4,letterSpacing:2,fontFamily:"Arial,sans-serif"}}>BASKETBALL</div>
          <div style={{fontSize:11,color:"#a89f94",marginTop:6,letterSpacing:3,fontFamily:"Arial,sans-serif"}}>BUILD YOUR SQUAD · CLASH ACROSS ERAS · RUN THE SIM</div>
        </div>

        {/* Loading */}
        {phase==="simulate"&&(
          <div style={{textAlign:"center",padding:"80px 20px"}}>
            <div style={{width:56,height:56,borderRadius:"50%",border:"3px solid #e2ddd6",borderTop:"3px solid #b8860b",margin:"0 auto 24px",animation:"spin 0.85s linear infinite"}}/>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            <div style={{fontSize:18,fontWeight:700,color:"#1a1612",marginBottom:6}}>Running Simulation…</div>
            <div style={{fontSize:12,color:"#a89f94",fontFamily:"Arial,sans-serif"}}>EraClash AI is breaking down the matchup</div>
          </div>
        )}

        {phase==="results"&&result&&<ResultsPanel result={result} myTeam={myFilled} oppTeam={oppFilled} seriesType={seriesType} onReset={resetGame} onRematch={()=>{setResult(null);setPhase("build");}} onShare={()=>setShowShare(true)}/>}

        {phase==="build"&&(
          <div>
            {error&&<div style={{background:"#fde8e8",border:"1px solid #e5b3b3",borderRadius:8,padding:"10px 14px",marginBottom:18,fontSize:12,color:"#c0392b",textAlign:"center",fontFamily:"Arial,sans-serif"}}>{error}</div>}

            {/* Series picker */}
            <div style={{display:"flex",justifyContent:"center",gap:8,marginBottom:22}}>
              {[["single","Single Game"],["series7","Best of 7"]].map(([val,label])=>(
                <button key={val} onClick={()=>setSeriesType(val)} style={{background:seriesType===val?"#1a1612":"#fff",border:seriesType===val?"1.5px solid #1a1612":"1.5px solid #d0cbc4",borderRadius:8,padding:"8px 18px",color:seriesType===val?"#fff":"#6b6258",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"Arial,sans-serif",transition:"all 0.15s"}}>{label}</button>
              ))}
            </div>

            {/* Rosters */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:14,marginBottom:20}}>
              {/* My Team */}
              <div style={{background:"#fff",border:"1.5px solid #e6c84a",borderRadius:14,padding:14,boxShadow:"0 2px 12px rgba(184,134,11,0.1)"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                  <div>
                    <div style={{fontSize:9,letterSpacing:3,color:"#b8860b",fontFamily:"Arial,sans-serif"}}>YOUR SQUAD</div>
                    <div style={{fontSize:16,fontWeight:800,color:"#b8860b"}}>Team Gold</div>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>setMyMode("manual")} style={{background:myMode==="manual"?"#b8860b":"transparent",border:"1.5px solid #b8860b",borderRadius:6,padding:"4px 10px",color:myMode==="manual"?"#fff":"#b8860b",fontSize:10,cursor:"pointer",fontFamily:"Arial,sans-serif",fontWeight:600}}>Manual</button>
                    <button onClick={()=>setMyMode("random")} style={{background:myMode==="random"?"#b8860b":"transparent",border:"1.5px solid #b8860b",borderRadius:6,padding:"4px 10px",color:myMode==="random"?"#fff":"#b8860b",fontSize:10,cursor:"pointer",fontFamily:"Arial,sans-serif",fontWeight:600}}>Random</button>
                    {myFilled.length>0&&<button onClick={()=>setMyTeam(EMPTY)} title="Clear team" style={{background:"transparent",border:"1.5px solid #d0cbc4",borderRadius:6,padding:"3px 7px",color:"#a89f94",fontSize:15,cursor:"pointer",lineHeight:1}} onMouseOver={e=>{e.currentTarget.style.borderColor="#c0392b";e.currentTarget.style.color="#c0392b"}} onMouseOut={e=>{e.currentTarget.style.borderColor="#d0cbc4";e.currentTarget.style.color="#a89f94"}}>↺</button>}
                  </div>
                </div>
                {myMode==="random"&&<button onClick={handleRandomizeGold} style={{width:"100%",background:"#fffbe8",border:"1.5px dashed #b8860b",borderRadius:8,padding:"9px",color:"#b8860b",fontSize:11,cursor:"pointer",marginBottom:8,fontFamily:"Arial,sans-serif",fontWeight:700}}>{myFilled.length?"↻ Re-randomize":"⚡ Generate Random Team"}</button>}
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {Array.from({length:5},(_,i)=>(
                    <RosterSlot key={i} player={myTeam[i]} posLabel={POSITIONS[i]} isActive={myMode==="manual"}
                      onClick={()=>{ if(!myTeam[i]&&myMode==="manual") openSlot("my",i); }}
                      onRemove={()=>removePlayer(i,"my")}/>
                  ))}
                </div>
                {myFilled.length>0&&<div style={{marginTop:10,padding:"8px 12px",background:"#fffbe8",borderRadius:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{fontSize:9,color:"#b8860b",fontFamily:"Arial,sans-serif",fontWeight:700}}>TEAM RATING</div>
                  <div style={{fontSize:20,fontWeight:800,color:"#b8860b"}}>{myS.total.toFixed(0)}</div>
                </div>}
              </div>

              {/* Opp Team */}
              <div style={{background:"#fff",border:"1.5px solid #4b9fc8",borderRadius:14,padding:14,boxShadow:"0 2px 12px rgba(29,111,164,0.1)"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                  <div>
                    <div style={{fontSize:9,letterSpacing:3,color:"#1d6fa4",fontFamily:"Arial,sans-serif"}}>OPPONENT</div>
                    <div style={{fontSize:16,fontWeight:800,color:"#1d6fa4"}}>Team Blue</div>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>setOppMode("manual")} style={{background:oppMode==="manual"?"#1d6fa4":"transparent",border:"1.5px solid #1d6fa4",borderRadius:6,padding:"4px 10px",color:oppMode==="manual"?"#fff":"#1d6fa4",fontSize:10,cursor:"pointer",fontFamily:"Arial,sans-serif",fontWeight:600}}>Manual</button>
                    <button onClick={()=>setOppMode("random")} style={{background:oppMode==="random"?"#1d6fa4":"transparent",border:"1.5px solid #1d6fa4",borderRadius:6,padding:"4px 10px",color:oppMode==="random"?"#fff":"#1d6fa4",fontSize:10,cursor:"pointer",fontFamily:"Arial,sans-serif",fontWeight:600}}>Random</button>
                    {oppFilled.length>0&&<button onClick={()=>setOppTeam(EMPTY)} title="Clear team" style={{background:"transparent",border:"1.5px solid #d0cbc4",borderRadius:6,padding:"3px 7px",color:"#a89f94",fontSize:15,cursor:"pointer",lineHeight:1}} onMouseOver={e=>{e.currentTarget.style.borderColor="#c0392b";e.currentTarget.style.color="#c0392b"}} onMouseOut={e=>{e.currentTarget.style.borderColor="#d0cbc4";e.currentTarget.style.color="#a89f94"}}>↺</button>}
                  </div>
                </div>
                {oppMode==="random"&&<button onClick={handleRandomize} style={{width:"100%",background:"#e8f4fd",border:"1.5px dashed #4b9fc8",borderRadius:8,padding:"9px",color:"#1d6fa4",fontSize:11,cursor:"pointer",marginBottom:8,fontFamily:"Arial,sans-serif",fontWeight:700}}>{oppFilled.length?"↻ Re-randomize":"⚡ Generate Random Team"}</button>}
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {Array.from({length:5},(_,i)=>(
                    <RosterSlot key={i} player={oppTeam[i]} posLabel={POSITIONS[i]} isActive={oppMode==="manual"}
                      onClick={()=>{ if(!oppTeam[i]&&oppMode==="manual") openSlot("opp",i); }}
                      onRemove={()=>removePlayer(i,"opp")}/>
                  ))}
                </div>
                {oppFilled.length>0&&<div style={{marginTop:10,padding:"8px 12px",background:"#e8f4fd",borderRadius:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{fontSize:9,color:"#1d6fa4",fontFamily:"Arial,sans-serif",fontWeight:700}}>TEAM RATING</div>
                  <div style={{fontSize:20,fontWeight:800,color:"#1d6fa4"}}>{oppS.total.toFixed(0)}</div>
                </div>}
              </div>
            </div>

            {/* Simulate CTA */}
            <div style={{textAlign:"center",marginBottom:14}}>
              <button onClick={runSimulation} disabled={!canSimulate}
                style={{background:canSimulate?"#1a1612":"#d0cbc4",border:"none",borderRadius:12,padding:"16px 52px",fontSize:14,fontWeight:800,color:canSimulate?"#fff":"#a89f94",cursor:canSimulate?"pointer":"not-allowed",letterSpacing:2,fontFamily:"Arial,sans-serif",boxShadow:canSimulate?"0 6px 20px rgba(0,0,0,0.2)":"none",transition:"all 0.2s"}}
                onMouseOver={e=>canSimulate&&(e.currentTarget.style.background="#333")} onMouseOut={e=>canSimulate&&(e.currentTarget.style.background="#1a1612")}>
                {canSimulate?"▶ RUN SIMULATION":`SELECT ${(5-myFilled.length)+(5-oppFilled.length)} MORE PLAYER${((5-myFilled.length)+(5-oppFilled.length))!==1?"S":""}`}
              </button>
              {!canSimulate&&<div style={{fontSize:10,color:"#a89f94",marginTop:6,fontFamily:"Arial,sans-serif"}}>Both rosters need 5 players · Click a position slot to pick</div>}
            </div>

          </div>
        )}
      </div>

      {/* Player Modal */}
      {modal&&(
        <PlayerModal
          roster={modal.roster}
          activePos={modal.pos}
          allSelected={allSelectedIds}
          allSelectedNames={[...myFilled,...oppFilled].map(p=>p.name)}
          onSelect={addPlayer}
          onClose={()=>setModal(null)}
        />
      )}

      {/* Footer */}
      <div style={{borderTop:"1px solid #e2ddd6",background:"#faf8f5",padding:"28px 20px",marginTop:40}}>
        <div style={{maxWidth:1100,margin:"0 auto",textAlign:"center"}}>
          <div style={{display:"flex",justifyContent:"center",gap:8,flexWrap:"wrap",marginBottom:14}}>
            <a href="https://ko-fi.com" target="_blank" rel="noopener noreferrer" style={{fontSize:12,color:"#b8860b",fontWeight:700,textDecoration:"none",fontFamily:"Arial,sans-serif",padding:"4px 10px",border:"1px solid #e6c84a",borderRadius:6}} onMouseOver={e=>e.currentTarget.style.background="#fffbe8"} onMouseOut={e=>e.currentTarget.style.background="transparent"}>☕ Help Support Us</a>
            <span style={{color:"#d0cbc4",fontSize:12,alignSelf:"center"}}>|</span>
            <button onClick={()=>setShowHowTo(true)} style={{background:"none",border:"none",fontSize:12,color:"#6b6258",cursor:"pointer",fontFamily:"Arial,sans-serif",padding:"4px 6px",fontWeight:600}} onMouseOver={e=>e.currentTarget.style.color="#1a1612"} onMouseOut={e=>e.currentTarget.style.color="#6b6258"}>How To Play</button>
            <span style={{color:"#d0cbc4",fontSize:12,alignSelf:"center"}}>|</span>
            <button onClick={()=>setShowPrivacy(true)} style={{background:"none",border:"none",fontSize:12,color:"#6b6258",cursor:"pointer",fontFamily:"Arial,sans-serif",padding:"4px 6px",fontWeight:600}} onMouseOver={e=>e.currentTarget.style.color="#1a1612"} onMouseOut={e=>e.currentTarget.style.color="#6b6258"}>Privacy Policy</button>
            <span style={{color:"#d0cbc4",fontSize:12,alignSelf:"center"}}>|</span>
            <button onClick={()=>setShowContact(true)} style={{background:"none",border:"none",fontSize:12,color:"#6b6258",cursor:"pointer",fontFamily:"Arial,sans-serif",padding:"4px 6px",fontWeight:600}} onMouseOver={e=>e.currentTarget.style.color="#1a1612"} onMouseOut={e=>e.currentTarget.style.color="#6b6258"}>Contact Us</button>
          </div>
          <div style={{fontSize:11,color:"#a89f94",lineHeight:1.6,fontFamily:"Arial,sans-serif",maxWidth:640,margin:"0 auto"}}>
            EraClashBasketball.com is an independent project and is not affiliated with, endorsed by, or sponsored by the National Basketball Association (NBA) or any of its teams.
          </div>
          <div style={{fontSize:10,color:"#c8c0b8",marginTop:8,fontFamily:"Arial,sans-serif"}}>© 2026 EraClash Sports. All rights reserved.</div>
        </div>
      </div>

      {/* Overlay Modals */}
      {showShare&&result&&<ShareModal result={result} myTeam={myFilled} oppTeam={oppFilled} seriesType={seriesType} onClose={()=>setShowShare(false)}/>}
      {showLogin&&<LoginModal onClose={()=>setShowLogin(false)}/>}
      {showHowTo&&<HowToPlayModal onClose={()=>setShowHowTo(false)}/>}
      {showPrivacy&&<PrivacyModal onClose={()=>setShowPrivacy(false)}/>}
      {showContact&&<ContactModal onClose={()=>setShowContact(false)}/>}
    </div>
  );
}
