/* MoshPin — chat and ratings.
   Chat: messages are immutable, so the backlog is replayed from the phone and
   only genuinely new ones are fetched. Ratings: a set can only be scored once
   it is halfway through, so nobody rates something they haven't heard. */
import * as C from './core.js';
import * as F from './festival.js';

const BACKLOG = 40;

let gid = null, uid = null, fest = null;
let members = () => ({}), photos = () => ({});
let onChange = () => {};
let msgs = [], seen = {}, reactions = {};
let unread = 0, open = false, ready = false;

const esc = C.esc;

/* ---------- chat ---------- */
export function init(opts) {
  gid = opts.gid; uid = opts.uid; fest = opts.fest;
  members = opts.members; photos = opts.photos; onChange = opts.onChange || (() => {});

  try { msgs = JSON.parse(localStorage.getItem('mp_chat_' + gid) || '[]'); } catch (e) { msgs = []; }
  msgs.forEach(m => seen[m.k] = 1);

  const last = msgs.length ? msgs[msgs.length - 1].k : null;
  let ref;
  try {
    ref = last ? C.ref('groups/' + gid + '/chat').orderByKey().startAt(last)
               : C.ref('groups/' + gid + '/chat').limitToLast(BACKLOG);
  } catch (e) { ref = C.ref('groups/' + gid + '/chat').limitToLast(BACKLOG); }
  ref.on('child_added', s => {
    const m = s.val();
    if (!m || !m.n || seen[s.key]) return;      // startAt re-sends the anchor
    seen[s.key] = 1;
    msgs.push({ k: s.key, u: m.u, n: m.n, x: m.x, ts: m.ts });
    if (msgs.length > 60) msgs = msgs.slice(-60);
    saveLocal();
    if (ready && !open && m.u !== uid) unread++;
    onChange();
  }, () => {});
  setTimeout(() => { ready = true; }, 1200);

  /* reactions only for messages still in view */
  let rref;
  try { rref = C.ref('groups/' + gid + '/reactions').limitToLast(50); }
  catch (e) { rref = C.ref('groups/' + gid + '/reactions'); }
  const touch = (k, v) => { if (v) reactions[k] = v; else delete reactions[k]; onChange(); };
  rref.on('child_added',   s => touch(s.key, s.val()));
  rref.on('child_changed', s => touch(s.key, s.val()));
  rref.on('child_removed', s => touch(s.key, null));
}
const saveLocal = () => {
  try { localStorage.setItem('mp_chat_' + gid, JSON.stringify(msgs.slice(-60))); } catch (e) {}
};

export const unreadCount = () => unread;
export function setOpen(v) { open = v; if (v) unread = 0; }

export async function send(text) {
  const x = String(text || '').trim();
  if (!x || !uid) return false;
  const n = (members()[uid] || {}).name || 'Someone';
  try {
    await C.ref('groups/' + gid + '/chat').push({ u: uid, n, x: x.slice(0, 300), ts: Date.now() });
    return true;
  } catch (e) { C.toast("Couldn't send — " + (e.message || '')); return false; }
}
export async function react(msgId, emoji) {
  if (!uid) return;
  const cur = (reactions[msgId] || {})[uid];
  reactions[msgId] = reactions[msgId] || {};
  if (cur === emoji) delete reactions[msgId][uid]; else reactions[msgId][uid] = emoji;
  onChange();
  const r = C.ref('groups/' + gid + '/reactions/' + msgId + '/' + uid);
  try { if (cur === emoji) await r.remove(); else await r.set(emoji); } catch (e) {}
}

export const EMOJI = ['👍','🔥','😂','😍','🥳','🙌','💚','👀','🤯','😭','🕺','💃','🎧','🔊','⚡','✨',
  '🍺','🍷','☕','🌞','🌙','⭐','💀','👽','🦄','🤝','👏','🙏','😴','🥴','📍','⏰','✅','❌','❓','💬'];

function avatar(name, size) {
  const s = size || 28;
  const u = Object.keys(members()).find(k => members()[k].name === name);
  const p = u && photos()[u];
  return p ? `<img class="av" src="${p}" alt="" style="width:${s}px;height:${s}px">`
    : `<span class="av fb" style="width:${s}px;height:${s}px;background:${C.colorFor(name)};font-size:${Math.round(s / 2.6)}px">${esc(C.initials(name))}</span>`;
}
const linkify = t => esc(t).replace(/(https?:\/\/[^\s<]+)/g, u => {
  const l = u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
  return `<a href="${u}" target="_blank" rel="noopener">${l.length > 34 ? l.slice(0, 33) + '…' : l} ↗</a>`;
});

export function renderChat(log) {
  const near = log.scrollHeight - log.scrollTop - log.clientHeight < 90;
  log.innerHTML = msgs.map(m => {
    const d = new Date(m.ts || Date.now());
    const rx = reactions[m.k] || {};
    const counts = {}, who = {};
    for (const [u, e] of Object.entries(rx)) {
      counts[e] = (counts[e] || 0) + 1;
      (who[e] = who[e] || []).push((members()[u] || {}).name || '?');
    }
    const chips = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).map(e =>
      `<button class="rx${rx[uid] === e ? ' mine' : ''}" data-r="${m.k}" data-e="${e}" title="${esc(who[e].join(', '))}">${e}<span>${counts[e]}</span></button>`
    ).join('');
    return `<div class="msg">${avatar(m.n)}
      <div class="mb"><div class="mn">${esc(m.n)}<span class="mt">${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}</span></div>
      <div class="mx">${linkify(m.x)}</div>
      <div class="rxrow">${chips}<button class="rx add" data-add="${m.k}">☺+</button></div></div></div>`;
  }).join('') || '<p class="hint">Nothing said yet. Say hello.</p>';
  if (near) log.scrollTop = log.scrollHeight;
}

/* ---------- ratings ----------
   Stored on the member record as "actId:score", same compact shape as picks. */
export const encRatings = o => Object.keys(o || {}).map(k => k + ':' + o[k]).join(' ');
export function decRatings(v) {
  if (!v) return {};
  if (typeof v === 'object') return v;
  const out = {};
  for (const p of String(v).split(' ')) {
    if (!p) continue;
    const i = p.lastIndexOf(':');
    if (i > 0) out[p.slice(0, i)] = +p.slice(i + 1) || 0;
  }
  return out;
}
/* halfway through, and open forever after — so you can catch up the next morning */
export function ratingOpen(actId) {
  const a = fest.acts[actId];
  if (!a) return false;
  const day = F.currentDay(fest);
  if (day) {
    if (day.idx > a.d) return true;
    if (day.idx < a.d) return false;
    return day.into >= (F.offset(fest, a) + F.endOffset(fest, a)) / 2;
  }
  return F.isOver(fest);
}
export function halfwayAt(actId) {
  const a = fest.acts[actId];
  if (!a) return '';
  const mid = Math.round((F.offset(fest, a) + F.endOffset(fest, a)) / 2);
  return C.minToHhmm(fest.days[a.d].start * 60 + mid);
}
export function scoreOf(actId) {
  let sum = 0, votes = 0;
  for (const m of Object.values(members())) {
    const r = decRatings(m.ratings)[actId];
    if (r) { sum += r; votes++; }
  }
  /* deliberately NOT called `n`: acts use `n` for their name, and these objects
     get merged. That collision silently replaced artist names with vote counts. */
  return { avg: votes ? sum / votes : 0, votes };
}
export function ratersOf(actId) {
  const out = [];
  for (const [u, m] of Object.entries(members())) {
    const r = decRatings(m.ratings)[actId];
    if (r) out.push({ uid: u, name: m.name || '?', r });
  }
  return out.sort((a, b) => b.r - a.r);
}

/* ---------- leaderboard ---------- */
export function ranked() {
  return Object.keys(fest.acts)
    .map(id => Object.assign({ id }, fest.acts[id], scoreOf(id)))
    .filter(x => x.votes > 0)
    .sort((a, b) => b.avg - a.avg || b.votes - a.votes);
}
export function mostDivisive() {
  let best = null;
  for (const id of Object.keys(fest.acts)) {
    const rs = ratersOf(id).map(r => r.r);
    if (rs.length < 3) continue;
    const spread = Math.max(...rs) - Math.min(...rs);
    if (!best || spread > best.spread) best = Object.assign({ id, spread }, fest.acts[id], scoreOf(id), { n: fest.acts[id].n });
  }
  return best && best.spread >= 2 ? best : null;
}

/* ---------- the wrap ----------
   Everything is computed on the phone from data already synced. The award
   mechanics are generic; the labels interpolate the festival's own venue names,
   so "UFO II zombie" writes itself at any festival. */
export function wrapData(tallies) {
  const T = tallies || {};
  const people = Object.entries(members()).map(([u, m]) => ({ uid: u, name: m.name || '?', m }));
  const decP = v => { const o = {}; if (typeof v === 'string') { for (const k of v.split(' ')) if (k) o[k] = 1; } else if (v) return v; return o; };
  const top = ranked().slice(0, 10).map(x => x.id);

  const rows = people.map(p => {
    const picks = Object.keys(decP(p.m.picks));
    const rs = Object.values(decRatings(p.m.ratings));
    const t = T[p.uid] || {};
    const seenActs = String(t.a || '').split(' ').filter(Boolean);
    const venueCount = {};
    for (const id of seenActs) { const a = fest.acts[id]; if (a) venueCount[a.v] = (venueCount[a.v] || 0) + 1; }
    let homeV = null, homeN = 0;
    for (const [v, n] of Object.entries(venueCount)) if (n > homeN) { homeV = v; homeN = n; }
    let spotV = null, spotN = 0;
    for (const [v, n] of Object.entries(t.s || {})) if (n > spotN) { spotV = v; spotN = n; }
    return {
      p, picks: picks.length, rated: rs.length,
      avg: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
      msgs: t.m || 0, booth: t.b || 0, checkins: seenActs.length,
      venues: Object.keys(venueCount).length,
      homeV, homeN, spotV, spotN,
      prophet: seenActs.filter(id => top.indexOf(id) >= 0).length,
      lone: picks.filter(id => ratersOfPick(id).length === 1).length,
      early: t.e || null, late: t.l || null
    };
  });
  function ratersOfPick(id) {
    return Object.values(members()).filter(m => decP(m.picks)[id]);
  }
  const best = (fn, min) => {
    let w = null;
    for (const r of rows) { const v = fn(r); if (v == null || v < (min || 1)) continue; if (!w || v > w.v) w = { r, v }; }
    return w;
  };
  const byAvg = dir => {
    let w = null;
    for (const r of rows) { if (r.rated < 3 || r.avg == null) continue; if (!w || (dir > 0 ? r.avg > w.v : r.avg < w.v)) w = { r, v: r.avg }; }
    return w;
  };
  const vname = id => { const v = F.venue(fest, id); return v ? v.name : ''; };

  const awards = [
    { i: '🔮', t: 'The Prophet — checked in at the most top-rated sets', w: best(r => r.prophet), f: v => v + ' of the top 10', hero: 1 },
    { i: '🧟', w: best(r => r.homeN, 2), f: v => v + '×',
      tf: r => `${vname(r.homeV)} zombie — most check-ins at one stage` },
    { i: '🦋', t: 'Social butterfly — visited the most different venues', w: best(r => r.venues, 2), f: v => v + ' venues' },
    { i: '👑', t: 'Booth invader — most check-ins inside the DJ booth', w: best(r => r.booth), f: v => v + '×' },
    { i: '🧊', t: 'Toughest critic — lowest average score', w: byAvg(-1), f: v => v.toFixed(1) + '★' },
    { i: '🥰', t: 'Easiest to please — highest average score', w: byAvg(1), f: v => v.toFixed(1) + '★' },
    { i: '💚', t: 'Most favourites — sets tagged', w: best(r => r.picks), f: v => v },
    { i: '⭐', t: 'The completist — most sets rated', w: best(r => r.rated), f: v => v },
    { i: '🏃', t: 'Iron legs — most check-ins overall', w: best(r => r.checkins, 2), f: v => v },
    { i: '🍷', w: best(r => r.spotN), f: v => v + '×', tf: r => `${vname(r.spotV)} regular` },
    { i: '👻', t: 'The ghost — tagged a lot, turned up for little',
      w: best(r => (r.picks >= 5 && r.checkins < r.picks / 3) ? r.picks - r.checkins : 0, 2), f: v => v + ' missed' },
    { i: '🐺', t: 'Lone wolf — sets nobody else picked', w: best(r => r.lone), f: v => v },
    { i: '💬', t: 'Group chat MVP — messages sent', w: best(r => r.msgs), f: v => v }
  ].filter(a => a.w).map(a => Object.assign(a, { t: a.tf ? a.tf(a.w.r) : a.t }));

  const totals = rows.reduce((a, r) => ({
    picks: a.picks + r.picks, rated: a.rated + r.rated,
    checkins: a.checkins + r.checkins, msgs: a.msgs + r.msgs
  }), { picks: 0, rated: 0, checkins: 0, msgs: 0 });

  return { rows, awards, totals, top: ranked().slice(0, 3), divisive: mostDivisive() };
}

/* the highest-voted note across the whole festival */
export function bestNote() {
  let best = null;
  for (const [u, m] of Object.entries(members())) {
    for (const [id, text] of Object.entries(m.notes || {})) {
      const a = fest.acts[id];
      if (!a || !text) continue;
      const score = ratersOf(id).length;
      if (!best || score > best.score) best = { who: m.name || '?', act: a, text, score };
    }
  }
  return best;
}
