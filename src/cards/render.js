// ── Clash Cards V1: deterministic canvas rendering ───────────────────────────
// One 1080×1350 PNG drawn from the structured model (src/cards/contract.js)
// with the Canvas 2D API. Text is drawn with fillText — a display name can
// never become markup here. Assets are same-origin only (the approved logo),
// so the canvas stays untainted and exportable. No DOM capture, no remote
// image, no image-generation call. The same model always draws the same card.
import { CARD_WIDTH, CARD_HEIGHT, CARD_KINDS } from "./contract.js";

// Light Court palette for the export: warm ivory, navy/charcoal text,
// restrained gold and cobalt. Hex, not CSS variables — the PNG has no theme.
export const PALETTE = Object.freeze({
  ivory: "#F6F1E7", ivoryDeep: "#EDE5D6", navy: "#0F1C2E", charcoal: "#2B3442", muted: "#6B7382",
  gold: "#C9961A", goldSoft: "#F3E3B5", cobalt: "#2457C5", cobaltSoft: "#DCE6FA", win: "#1F7A4D", loss: "#B23A3A", rule: "#D9CFBD",
});
const DISPLAY = '"Arial Narrow", "Helvetica Neue Condensed", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif';
const BODY = '"Helvetica Neue", Arial, "Segoe UI", system-ui, sans-serif';
const font = (weight, px, family = DISPLAY) => `${weight} ${px}px ${family}`;

export const LOGO_SRC = "/brand/eraclash-logo-mk1.png";
let logoPromise = null;
/** The approved logo, loaded once, same origin. Resolves null when unavailable (the card then shows the wordmark alone). */
export const loadLogo = () => {
  if (logoPromise) return logoPromise;
  logoPromise = new Promise((resolve) => {
    if (typeof Image === "undefined") return resolve(null);
    const img = new Image(); img.decoding = "async";
    img.onload = () => resolve(img); img.onerror = () => resolve(null);
    img.src = LOGO_SRC;
  });
  return logoPromise;
};

/** Shrink a font until the text fits `maxWidth` (never below `minPx`); returns the px used. */
const fitText = (ctx, text, { weight, px, minPx, maxWidth, family = DISPLAY }) => {
  let size = px;
  ctx.font = font(weight, size, family);
  while (size > minPx && ctx.measureText(text).width > maxWidth) { size -= 2; ctx.font = font(weight, size, family); }
  return size;
};
/** Ellipsis-truncate to a width at the current font. */
const clip = (ctx, text, maxWidth) => {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxWidth) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
};
/** Greedy word wrap at the current font; returns at most `maxLines` lines, the last clipped. */
const wrap = (ctx, text, maxWidth, maxLines) => {
  const words = String(text).split(/\s+/).filter(Boolean); const lines = []; let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width <= maxWidth || !cur) cur = next; else { lines.push(cur); cur = w; }
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  if (lines.length === maxLines && words.join(" ") !== lines.join(" ")) lines[maxLines - 1] = clip(ctx, lines[maxLines - 1], maxWidth);
  return lines;
};
const roundRect = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
const outcomeColor = (o) => (o === "win" ? PALETTE.win : o === "loss" ? PALETTE.loss : PALETTE.charcoal);

const drawFrame = (ctx, logo, model) => {
  const W = CARD_WIDTH, H = CARD_HEIGHT;
  ctx.fillStyle = PALETTE.ivory; ctx.fillRect(0, 0, W, H);
  // a quiet court arc, cobalt at low alpha — brand texture, never a screenshot
  ctx.save(); ctx.globalAlpha = 0.08; ctx.strokeStyle = PALETTE.cobalt; ctx.lineWidth = 10;
  ctx.beginPath(); ctx.arc(W / 2, H + 120, 520, Math.PI, 2 * Math.PI); ctx.stroke();
  ctx.beginPath(); ctx.arc(W / 2, H + 120, 380, Math.PI, 2 * Math.PI); ctx.stroke(); ctx.restore();
  // gold rule top
  ctx.fillStyle = PALETTE.gold; ctx.fillRect(0, 0, W, 14);
  // masthead: logo + wordmark
  let x = 72;
  if (logo) { const h = 72, w = Math.round((logo.width / logo.height) * h) || h; ctx.drawImage(logo, x, 64, w, h); x += w + 22; }
  ctx.fillStyle = PALETTE.navy; ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
  ctx.font = font(900, 44); ctx.fillText(model.brand || "ERACLASH", x, 116);
  ctx.font = font(700, 20, BODY); ctx.fillStyle = PALETTE.muted; ctx.fillText("BASKETBALL", x + 2, 144);
  // era pill, right
  if (model.era) {
    ctx.font = font(800, 22, BODY);
    const tw = ctx.measureText(model.era).width, pw = tw + 48, px = W - 72 - pw;
    ctx.fillStyle = PALETTE.cobaltSoft; roundRect(ctx, px, 78, pw, 50, 25); ctx.fill();
    ctx.fillStyle = PALETTE.cobalt; ctx.textAlign = "center"; ctx.fillText(model.era, px + pw / 2, 111); ctx.textAlign = "left";
  }
  // footer
  ctx.fillStyle = PALETTE.rule; ctx.fillRect(72, H - 132, W - 144, 2);
  ctx.fillStyle = PALETTE.muted; ctx.font = font(700, 20, BODY); ctx.textAlign = "left";
  ctx.fillText(clip(ctx, model.footer || "", W - 144), 72, H - 84);
};

const drawScoreBlock = (ctx, model, top, { label }) => {
  const W = CARD_WIDTH, cx = W / 2;
  ctx.textAlign = "center";
  if (label) { ctx.fillStyle = PALETTE.muted; ctx.font = font(800, 24, BODY); ctx.fillText(label, cx, top); top += 40; }
  const score = `${model.score.gold}–${model.score.blue}`;
  const px = fitText(ctx, score, { weight: 900, px: 280, minPx: 160, maxWidth: W - 144 });
  ctx.fillStyle = PALETTE.navy; ctx.fillText(score, cx, top + px * 0.78);
  top += px * 0.78 + 44;
  // outcome tag + margin line
  ctx.font = font(900, 26, BODY);
  const tag = model.outcomeWord, tw = ctx.measureText(tag).width + 44;
  ctx.fillStyle = outcomeColor(model.outcome); roundRect(ctx, cx - tw / 2, top, tw, 52, 12); ctx.fill();
  ctx.fillStyle = "#FFFFFF"; ctx.fillText(tag, cx, top + 36);
  top += 84;
  ctx.fillStyle = PALETTE.charcoal; fitText(ctx, model.marginLine, { weight: 800, px: 40, minPx: 28, maxWidth: W - 144 });
  ctx.fillText(model.marginLine, cx, top + 30);
  return top + 70;
};

/** Draw the model onto a 1080×1350 canvas. Pure: same model + same logo → same pixels. */
export const drawCard = (canvas, model, { logo = null } = {}) => {
  if (!canvas || !model) return false;
  canvas.width = CARD_WIDTH; canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  drawFrame(ctx, logo, model);
  const W = CARD_WIDTH, cx = W / 2;
  if (model.kind === CARD_KINDS.INVITATION) {
    ctx.textAlign = "left";
    ctx.fillStyle = PALETTE.gold; ctx.font = font(900, 30, BODY); ctx.fillText(model.kicker, 72, 262);
    ctx.fillStyle = PALETTE.navy; const hp = fitText(ctx, model.headline, { weight: 900, px: 84, minPx: 56, maxWidth: W - 144 });
    const hl = wrap(ctx, model.headline, W - 144, 2); hl.forEach((l, i) => ctx.fillText(l, 72, 350 + i * (hp + 6)));
    let y = 350 + hl.length * (hp + 6) + 40;
    ctx.fillStyle = PALETTE.charcoal; ctx.font = font(500, 30, BODY);
    wrap(ctx, model.body, W - 144, 3).forEach((l, i) => ctx.fillText(l, 72, y + i * 44)); y += 3 * 44 + 30;
    // the result to beat
    ctx.fillStyle = PALETTE.ivoryDeep; roundRect(ctx, 72, y, W - 144, 372, 24); ctx.fill();
    const who = model.attribution ? `${model.attribution.toUpperCase()}'S RESULT` : "THE RESULT TO BEAT";
    ctx.textAlign = "center"; ctx.fillStyle = PALETTE.muted; ctx.font = font(800, 22, BODY); ctx.fillText(clip(ctx, who, W - 200), cx, y + 52);
    const score = `${model.score.gold}–${model.score.blue}`; const sp = fitText(ctx, score, { weight: 900, px: 168, minPx: 110, maxWidth: W - 220 });
    ctx.fillStyle = PALETTE.navy; ctx.fillText(score, cx, y + 60 + sp * 0.86);
    ctx.font = font(900, 24, BODY); const tag = model.outcomeWord, tw = ctx.measureText(tag).width + 40;
    ctx.fillStyle = outcomeColor(model.outcome); roundRect(ctx, cx - tw / 2 - 120, y + 286, tw, 46, 10); ctx.fill();
    ctx.fillStyle = "#FFFFFF"; ctx.fillText(tag, cx - 120, y + 318);
    ctx.fillStyle = PALETTE.charcoal; ctx.font = font(800, 26, BODY); ctx.textAlign = "left"; ctx.fillText(clip(ctx, model.marginLine, 420), cx - 120 + tw / 2 + 24, y + 318);
    y += 372 + 44;
    // code box + link
    ctx.textAlign = "left"; ctx.fillStyle = PALETTE.muted; ctx.font = font(800, 20, BODY); ctx.fillText("CHALLENGE CODE", 72, y);
    ctx.fillStyle = PALETTE.gold; ctx.font = font(900, 56); ctx.fillText(model.code, 72, y + 62);
    if (model.url) { ctx.fillStyle = PALETTE.cobalt; ctx.font = font(600, 24, BODY); ctx.fillText(clip(ctx, model.url.replace(/^https?:\/\//, ""), W - 144), 72, y + 106); }
  } else {
    ctx.textAlign = "center";
    ctx.fillStyle = PALETTE.gold; ctx.font = font(900, 30, BODY); ctx.fillText(model.kicker, cx, 300);
    let top = 340;
    if (model.attribution) { ctx.fillStyle = PALETTE.navy; fitText(ctx, model.attribution, { weight: 900, px: 60, minPx: 36, maxWidth: W - 144 }); ctx.fillText(model.attribution, cx, top + 50); top += 96; }
    drawScoreBlock(ctx, model, top + 40, { label: null });
    ctx.fillStyle = PALETTE.charcoal; ctx.font = font(600, 26, BODY); ctx.textAlign = "center";
    ctx.fillText("CHAOS CLASH · A FIVE ROLLED FROM EVERY ERA", cx, CARD_HEIGHT - 190);
  }
  return true;
};

/** Wait for fonts, load the logo, then draw. */
export const renderCard = async (canvas, model) => {
  try { if (typeof document !== "undefined" && document.fonts?.ready) await document.fonts.ready; } catch { /* draw anyway */ }
  const logo = await loadLogo();
  return drawCard(canvas, model, { logo });
};
