/* MoshPin — check-ins.
   Drop a pin on where you are: which stage, and whereabouts on the floor.
   Pins fade and then vanish after two hours, so the list is always current.
   Spots (camping, the lake, a food court) are checkable too — they just have
   no dancefloor, so it's a single tap. */
import * as C from './core.js';
import * as F from './festival.js';

const TTL = 2 * 60 * 60 * 1000;

/* the room, as a 3-wide plan: behind the booth, the booth row, then the floor */
export const ZONES = [
  ['bl', 'behind<br>left', 'behind'], ['bb', 'behind<br>booth', 'behind'], ['br', 'behind<br>right', 'behind'],
  ['tl', 'booth<br>left', ''], ['dj', 'DJ<br>BOOTH', 'booth'], ['tr', 'booth<br>right', ''],
  ['fl', 'front<br>left', ''], ['fc', 'front<br>middle', ''], ['fr', 'front<br>right', ''],
  ['ml', 'middle<br>left', ''], ['mc', 'middle<br>centre', ''], ['mr', 'middle<br>right', ''],
  ['kl', 'back<br>left', ''], ['kc', 'back<br>middle', ''], ['kr', 'back<br>right', '']
];
const ZL = {};
ZONES.forEach(([k, l]) => ZL[k] = l.replace('<br>', ' '));
ZL.dj = 'in the booth 👑';
ZL.here = 'here';

export const zoneLabel = z => ZL[z] || z;

/* ---------- state ---------- */
let gid = null, uid = null, fest = null, members = () => ({}), photos = () => ({});
let checkins = {};
let onChange = () => {};
let mode = 'list';          // list | venues | floor
let target = null;          // {venueId, actId|null}

export function init(opts) {
  gid = opts.gid; uid = opts.uid; fest = opts.fest;
  members = opts.members; photos = opts.photos; onChange = opts.onChange || (() => {});
  const r = C.ref('groups/' + gid + '/checkins');
  const touch = (k, v) => { if (v) checkins[k] = v; else delete checkins[k]; onChange(); prune(); };
  r.on('child_added',   s => touch(s.key, s.val()));
  r.on('child_changed', s => touch(s.key, s.val()));
  r.on('child_removed', s => touch(s.key, null));
}

export function active() {
  const now = Date.now();
  return Object.entries(checkins)
    .filter(([, c]) => c && c.ts && c.n && (now - c.ts) < TTL)
    .map(([u, c]) => Object.assign({ uid: u }, c))
    .sort((a, b) => b.ts - a.ts);
}
export const mine = () => active().find(c => c.uid === uid) || null;
export const countAt = venueId => active().filter(c => c.v === venueId).length;

/* an expired pin of our own is dead weight every phone downloads — tidy it */
let pruned = false;
function prune() {
  if (pruned || !uid) return;
  const raw = checkins[uid];
  if (!raw || !raw.ts || Date.now() - raw.ts < TTL) return;
  pruned = true;
  delete checkins[uid];
  C.ref('groups/' + gid + '/checkins/' + uid).remove().catch(() => {});
}

export function ago(ts) {
  const m = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  return (m < 60 ? m + ' min' : Math.floor(m / 60) + 'h ' + (m % 60) + 'm') + ' ago';
}

/* ---------- when may you check in ----------
   From an hour before a set until it ends. Spots, and stages with nothing on,
   are open for as long as the festival is running. Checking OUT is never
   blocked — that was a real bug in the old app. */
export function windowFor(venueId, actId) {
  const day = F.currentDay(fest);
  if (!actId) return { open: !!day, ended: false, why: day ? '' : 'Check-in opens when the festival does.' };
  const a = fest.acts[actId];
  if (!a || !day) return { open: false, ended: false, why: 'Check-in opens when the festival does.' };
  if (a.d !== day.idx) return { open: false, ended: day.idx > a.d, why: 'That set is on another day.' };
  const s = F.offset(fest, a), e = F.endOffset(fest, a);
  if (day.into > e) return { open: false, ended: true, why: '' };
  if (day.into < s - 60) return { open: false, ended: false, why: `Opens an hour before, at ${C.minToHhmm(fest.days[a.d].start * 60 + s - 60)}.` };
  return { open: true, ended: false, why: '' };
}

export async function checkIn(venueId, actId, zone, label, note) {
  if (!uid) return;
  const rec = { n: nameOf(uid), v: venueId, z: zone, ts: Date.now() };
  if (actId) rec.a = actId;
  if (label) rec.l = String(label).slice(0, 40);
  if (note) rec.t = String(note).slice(0, 60);
  checkins[uid] = rec;                     // optimistic
  onChange();
  try { await C.ref('groups/' + gid + '/checkins/' + uid).set(rec); }
  catch (e) { C.toast("Couldn't check in — " + (e.message || '')); }
}
export async function checkOut() {
  if (!uid) return;
  delete checkins[uid];
  onChange();
  try { await C.ref('groups/' + gid + '/checkins/' + uid).remove(); }
  catch (e) { C.toast("Couldn't leave — " + (e.message || '')); }
}
const nameOf = u => { const m = members()[u]; return (m && m.name) || 'Someone'; };

/* ---------- rendering ---------- */
const esc = C.esc;
function avatar(name, size) {
  const s = size || 26;
  const u = Object.keys(members()).find(k => members()[k].name === name);
  const p = u && photos()[u];
  return p ? `<img class="av" src="${p}" alt="" style="width:${s}px;height:${s}px">`
    : `<span class="av fb" style="width:${s}px;height:${s}px;background:${C.colorFor(name)};font-size:${Math.round(s / 2.6)}px">${esc(C.initials(name))}</span>`;
}

export function render(head, body, foot) {
  if (mode === 'floor') return renderFloor(head, body, foot);
  if (mode === 'venues') return renderVenues(head, body, foot);
  return renderList(head, body, foot);
}

function renderList(head, body, foot) {
  head.innerHTML = `<b>📍 Who's where</b><span class="hint">fades after 2h</span>
    <button class="btn sm" id="ciX" style="margin-left:auto">✕</button>`;
  foot.innerHTML = '';
  const list = active();
  const own = mine();
  let html = own ? `<button class="btn danger wide" id="ciLeave" style="margin-bottom:12px">Leave my check-in</button>` : '';

  if (!list.length) {
    html += `<p class="hint">Nobody has checked in yet.</p>`;
  } else {
    const groups = {};
    for (const c of list) (groups[c.v + '|' + (c.a || '')] = groups[c.v + '|' + (c.a || '')] || []).push(c);
    for (const key of Object.keys(groups)) {
      const [vid, aid] = key.split('|');
      const v = F.venue(fest, vid);
      const a = aid ? fest.acts[aid] : null;
      const ended = aid ? windowFor(vid, aid).ended : false;
      html += `<div class="cistage" data-v="${vid}" data-a="${aid}">
          <div style="flex:1;min-width:0">
            <div class="ct">${esc((v ? v.name : 'Somewhere').toUpperCase())}</div>
            <div class="cs">${a ? esc(a.n) : 'no set on'} · ${groups[key].length} here${v && v.type === 'stage' ? ' · tap for the floor' : ''}</div>
            ${ended ? `<div class="cs" style="color:var(--danger)">⏱ that set has finished — they may have moved on</div>` : ''}
          </div>${v && v.type === 'stage' ? '<span style="color:var(--edge)">›</span>' : ''}</div>`;
      for (const c of groups[key]) {
        const mins = (Date.now() - c.ts) / 60000;
        const dim = mins > 60 ? ' style="opacity:.5"' : mins > 40 ? ' style="opacity:.75"' : '';
        html += `<div class="cirow"${dim}>${avatar(c.n)}
          <div style="flex:1;min-width:0"><div class="nm">${esc(c.n)}</div>
            <div class="pos${c.l ? ' custom' : ''}">${esc(c.l || zoneLabel(c.z))}</div>
            ${c.t ? `<div class="cinote">${esc(c.t)}</div>` : ''}</div>
          <div class="ciago${mins < 20 ? ' fresh' : ''}">${mins < 20 ? '<span class="dot"></span>' : ''}${ago(c.ts)}</div></div>`;
      }
    }
  }
  html += `<button class="btn primary wide" id="ciStart" style="margin-top:14px;padding:12px">📍 Check in somewhere</button>`;
  body.innerHTML = html;

  const lv = body.querySelector('#ciLeave'); if (lv) lv.onclick = () => checkOut();
  body.querySelector('#ciStart').onclick = () => { mode = 'venues'; onChange(); };
  body.querySelectorAll('.cistage').forEach(el => el.onclick = () => {
    const v = F.venue(fest, el.dataset.v);
    if (!v || v.type !== 'stage') return;
    target = { venueId: el.dataset.v, actId: el.dataset.a || null };
    mode = 'floor'; onChange();
  });
}

function renderVenues(head, body, foot) {
  head.innerHTML = `<button class="btn sm" id="ciBack">‹</button>
    <div style="flex:1;min-width:0"><b>Where are you?</b><div class="hint">pick a stage or a spot</div></div>
    <button class="btn sm" id="ciX">✕</button>`;
  foot.innerHTML = '';
  const rows = fest.venues.map(v => {
    const live = v.type === 'stage' ? F.nowOn(fest, v.id) : null;
    const n = countAt(v.id);
    return `<div class="cistage" data-v="${v.id}" data-a="${live ? live.id : ''}">
      <div style="flex:1;min-width:0">
        <div class="ct">${esc(v.name.toUpperCase())}</div>
        <div class="cs">${v.type === 'spot' ? 'anytime' : (live ? '♪ ' + esc(live.n) : 'nothing on right now')}${n ? ' · ' + n + ' here' : ''}</div>
      </div><span style="color:var(--edge)">›</span></div>`;
  }).join('');
  body.innerHTML = rows;
  body.querySelectorAll('.cistage').forEach(el => el.onclick = () => {
    target = { venueId: el.dataset.v, actId: el.dataset.a || null };
    const v = F.venue(fest, el.dataset.v);
    if (v && v.type === 'spot') { checkIn(v.id, null, 'here'); mode = 'list'; onChange(); return; }
    mode = 'floor'; onChange();
  });
  head.querySelector('#ciBack').onclick = () => { mode = 'list'; onChange(); };
}

function renderFloor(head, body, foot) {
  const v = F.venue(fest, target.venueId);
  const a = target.actId ? fest.acts[target.actId] : null;
  const w = windowFor(target.venueId, target.actId);
  const own = mine();
  const here = own && own.v === target.venueId;

  head.innerHTML = `<button class="btn sm" id="ciBack">‹</button>
    <div style="flex:1;min-width:0"><b>${esc(v ? v.name : '')}</b>
      <div class="hint">${a ? esc(a.n) + ' · ' + esc(a.s) + '–' + esc(a.e) : 'nothing on right now'}</div></div>
    <button class="btn sm" id="ciX">✕</button>`;

  const at = {};
  for (const c of active()) if (c.v === target.venueId) (at[c.z] = at[c.z] || []).push(c);

  const cell = ([key, label, cls]) => {
    const pp = at[key] || [];
    const isMine = own && own.v === target.venueId && own.z === key;
    return `<div class="zone ${cls}${pp.length ? ' taken' : ''}${isMine ? ' mine' : ''}${w.open ? '' : ' shut'}" data-z="${key}">
      <div class="zl">${label}</div>
      ${pp.length ? `<div class="zpp">${pp.map(c => avatar(c.n, 20)).join('')}</div>` : ''}
      ${key === 'dj' && pp.length ? `<div class="alleg">${esc(pp[0].n)}, allegedly</div>` : ''}</div>`;
  };
  let msg = '';
  if (w.ended) msg = `<div class="lockmsg">⏱ This set has finished, so you can't check in anymore. The pins are from during the set — people may well still be around.</div>`;
  else if (!w.open && w.why) msg = `<div class="lockmsg">${esc(w.why)}</div>`;

  body.innerHTML = msg
    + `<div class="zgrid">${ZONES.slice(0, 3).map(cell).join('')}</div>`
    + `<div class="zgrid" style="margin-top:5px">${ZONES.slice(3, 6).map(cell).join('')}</div>`
    + `<div class="zsplit"></div>`
    + `<div class="zgrid">${ZONES.slice(6).map(cell).join('')}</div>`
    + `<p class="hint" style="text-align:center;margin-top:8px">left / right as you face the booth${w.open ? ' — tap a spot' : ''}</p>`;

  foot.innerHTML = `<input type="text" id="ciLabel" maxlength="40" placeholder="own label — e.g. by the sound desk">
    <input type="text" id="ciNote" maxlength="60" placeholder="note — e.g. staying till the end">
    ${here ? '<button class="btn danger" id="ciOut">Leave</button>' : ''}`;
  if (here) {
    if (own.l) foot.querySelector('#ciLabel').value = own.l;
    if (own.t) foot.querySelector('#ciNote').value = own.t;
    foot.querySelector('#ciOut').onclick = () => { checkOut(); mode = 'list'; onChange(); };
  }
  if (w.open) body.querySelectorAll('.zone').forEach(z => z.onclick = () => {
    checkIn(target.venueId, target.actId, z.dataset.z,
      foot.querySelector('#ciLabel').value.trim(), foot.querySelector('#ciNote').value.trim());
  });
  head.querySelector('#ciBack').onclick = () => { mode = 'venues'; onChange(); };
}

export const reset = () => { mode = 'list'; target = null; };
export const goFloor = (venueId, actId) => { target = { venueId, actId }; mode = 'floor'; };
