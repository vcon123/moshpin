/* MoshPin — the timetable.
   Four independent panes: corner, stage headers, time column, and the grid.
   Only the grid scrolls; the headers follow it horizontally, the times follow
   it vertically. Anything sticky inside a scroller misbehaves on iOS, which is
   why none of this uses position:sticky for the panes themselves. */
import * as C from './core.js';
import * as F from './festival.js';

const $ = id => document.getElementById(id);
const esc = C.esc;
const ROW = 13;                 // pixels per 15 minutes
const SLOT = 15;

let crew = null, uid = null, fest = null;
let members = {}, photos = {}, admins = {};
let myPicks = {};               // actId -> 1 or {note}
let dayIdx = 0;
let saveTimer = null;

const pickNote = v => (v && typeof v === 'object' && v.note) ? v.note : '';
const encPicks = o => Object.keys(o || {}).join(' ');
const decPicks = v => {
  if (!v) return {};
  if (typeof v === 'object') return v;
  const out = {}; for (const k of String(v).split(' ')) if (k) out[k] = 1;
  return out;
};

/* ---------- boot ---------- */
function boom(msg, detail) {
  $('app').innerHTML = `<div class="card"><h2>Something went wrong</h2>
    <p class="hint" style="margin-top:8px">${esc(msg)}</p>
    ${detail ? `<p class="hint" style="opacity:.7;margin-top:6px">${esc(detail)}</p>` : ''}
    <div style="margin-top:16px"><a class="btn wide" href="app.html">Back to the crew</a></div></div>`;
  $('app').hidden = false;
}
window.addEventListener('error', e => {
  if (!$('app').innerHTML.includes('Something went wrong')) boom('A script failed.', e.message);
});

(async function () {
  crew = C.currentGroup();
  if (!crew) { location.href = 'index.html'; return; }
  if (typeof firebase === 'undefined') return boom('Could not load Firebase.');
  try { C.init(); uid = await C.signIn(); }
  catch (e) { return boom("Couldn't sign in.", e && (e.code || e.message)); }

  try { photos = JSON.parse(localStorage.getItem('mp_photos_' + crew.gid) || '{}'); } catch (e) {}

  fest = await F.load(crew.gid);
  if (!fest || !fest.days.length || !F.stages(fest).length) {
    return boom('This crew has no timetable yet.',
      'An admin needs to set up the festival first.');
  }
  $('festName').textContent = `${fest.name} ${fest.year}`;

  const mref = C.ref('groups/' + crew.gid + '/members');
  mref.on('child_added',   s => { takeMember(s.key, s.val()); draw(); });
  mref.on('child_changed', s => { takeMember(s.key, s.val()); draw(); });
  mref.on('child_removed', s => { delete members[s.key]; draw(); });
  C.ref('groups/' + crew.gid + '/admins')
    .on('child_added', s => { admins[s.key] = true; });

  const cur = F.currentDay(fest);
  dayIdx = cur ? cur.idx : 0;

  $('app').hidden = false;
  drawTabs();
  draw();
  setInterval(() => { if (!document.hidden) drawNow(); }, 60000);
})();

function takeMember(u, v) {
  members[u] = v || {};
  if (u === uid) myPicks = decPicks(v && v.picks);
}

/* ---------- saving picks ----------
   Coalesced: tagging five sets in a row is one write, not five. */
function saveSoon() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(savePicks, 500);
}
async function savePicks() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  const notes = {};
  for (const k of Object.keys(myPicks)) { const t = pickNote(myPicks[k]); if (t) notes[k] = t; }
  try {
    await C.ref('groups/' + crew.gid + '/members/' + uid)
      .update({ picks: encPicks(myPicks), notes: Object.keys(notes).length ? notes : null });
  } catch (e) { C.toast("Couldn't save that — " + (e.message || '')); }
}
window.addEventListener('pagehide', () => { if (saveTimer) savePicks(); });

/* Who tagged this set. Our own entry comes from local state rather than the
   synced copy, so tags and notes appear the instant you make them instead of
   waiting for the round trip. */
function pickers(actId) {
  const out = [];
  for (const [u, m] of Object.entries(members)) {
    if (u === uid) continue;
    const p = decPicks(m.picks);
    if (p[actId]) out.push({ uid: u, name: m.name || '?', note: (m.notes || {})[actId] || '' });
  }
  out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  if (myPicks[actId]) {
    const nm = (members[uid] && members[uid].name) || (C.myProfile() || {}).name || 'You';
    out.unshift({ uid, name: nm, note: pickNote(myPicks[actId]) });
  }
  return out;
}

/* ---------- day tabs ---------- */
function drawTabs() {
  $('dayTabs').innerHTML = fest.days.map((d, i) =>
    `<button class="btn sm ${i === dayIdx ? 'primary' : ''}" data-d="${i}">${esc(F.dayLabel(d))}</button>`
  ).join('');
  $('dayTabs').querySelectorAll('[data-d]').forEach(b =>
    b.onclick = () => { dayIdx = +b.dataset.d; drawTabs(); draw(); });
}

/* ---------- the grid ---------- */
function draw() {
  const day = fest.days[dayIdx];
  if (!day) return;
  const stages = F.stages(fest);
  const rows = Math.ceil(day.hours * 60 / SLOT);

  /* header pane */
  $('gHead').style.gridTemplateColumns = `repeat(${stages.length}, minmax(118px,1fr))`;
  $('gHead').innerHTML = stages.map(v => `<div class="sh">${esc(v.name)}</div>`).join('');

  /* time column */
  let tc = '';
  for (let m = 0; m <= day.hours * 60; m += 60) {
    const clock = C.minToHhmm(day.start * 60 + m);
    tc += `<div class="tl" style="top:${(m / SLOT) * ROW - 6}px">${clock}</div>`;
  }
  $('gTime').innerHTML = tc;
  $('gTime').style.height = (rows * ROW) + 'px';

  /* grid */
  const g = $('gGrid');
  g.style.gridTemplateColumns = `repeat(${stages.length}, minmax(118px,1fr))`;
  g.style.gridAutoRows = ROW + 'px';
  g.style.height = (rows * ROW) + 'px';

  let html = '';
  for (let m = 0; m <= day.hours * 60; m += 60)
    html += `<div class="hl" style="top:${(m / SLOT) * ROW}px"></div>`;

  stages.forEach((v, col) => {
    for (const a of F.actsOf(fest, dayIdx, v.id)) {
      const o = F.offset(fest, a), e = F.endOffset(fest, a);
      const r1 = Math.round(o / SLOT) + 1, r2 = Math.max(r1 + 1, Math.round(e / SLOT) + 1);
      const mine = !!myPicks[a.id];
      const pk = pickers(a.id);
      html += `<div class="act${mine ? ' mine' : ''}${pk.length ? ' b' + Math.min(3, pk.length) : ''}"
          data-a="${a.id}" style="grid-column:${col + 1};grid-row:${r1} / ${r2}">
          <div class="t">${esc(a.n)}</div>
          <div class="tm">${esc(a.s)}–${esc(a.e)}</div>
          ${pk.length ? `<div class="bb">${pk.slice(0, 3).map(p =>
              `<span class="bu" style="background:${C.colorFor(p.name)}" title="${esc(p.name)}">${esc(C.initials(p.name))}</span>`
            ).join('')}${pk.length > 3 ? `<span class="bu more">+${pk.length - 3}</span>` : ''}</div>` : ''}
          ${pk.some(p => p.note) ? '<div class="nd">✎</div>' : ''}
        </div>`;
    }
  });
  g.innerHTML = html;
  g.querySelectorAll('.act').forEach(el => el.onclick = () => openAct(el.dataset.a));
  drawNow();
  $('picked').textContent = Object.keys(myPicks).length + ' tagged';
}

/* the line showing where we are, in festival-local time */
function drawNow() {
  const old = document.querySelector('.nowline');
  if (old) old.remove();
  const cur = F.currentDay(fest);
  if (!cur || cur.idx !== dayIdx) return;
  const el = document.createElement('div');
  el.className = 'nowline';
  el.style.top = ((cur.into / SLOT) * ROW) + 'px';
  el.innerHTML = `<span>${C.minToHhmm(fest.days[dayIdx].start * 60 + cur.into)}</span>`;
  $('gGrid').appendChild(el);
}

/* header follows the grid sideways; nothing is position:sticky */
$('gWrap').addEventListener('scroll', () => {
  $('gHeadWrap').scrollLeft = $('gWrap').scrollLeft;
}, { passive: true });

/* ---------- one set ---------- */
let openId = null;
function openAct(id) {
  const a = Object.assign({ id }, fest.acts[id]);
  if (!a.n) return;
  openId = id;
  const v = F.venue(fest, a.v);
  const mine = !!myPicks[id];
  const others = pickers(id).filter(p => p.uid !== uid);
  $('actBody').innerHTML = `
    <div class="phead"><b>${esc(a.n)}</b><button class="btn sm" id="acClose">✕</button></div>
    <p class="hint">${esc(v ? v.name : '')} · ${esc(F.dayLabel(fest.days[a.d]))} · ${esc(a.s)}–${esc(a.e)}</p>
    ${a.u ? `<div class="row" style="margin-top:12px"><a class="btn wide" href="${esc(a.u)}" target="_blank" rel="noopener">Listen ↗</a></div>` : ''}
    <button class="btn ${mine ? 'danger' : 'primary'} wide" id="acTog" style="margin-top:12px">
      ${mine ? 'Remove from my lineup' : '★ Add to my lineup'}</button>
    ${mine ? `<label for="acNote">Your note (everyone sees it)</label>
      <textarea id="acNote" rows="2" maxlength="200" placeholder="e.g. must see for me">${esc(pickNote(myPicks[id]))}</textarea>
      <button class="btn wide" id="acNoteSave" style="margin-top:8px">Save note</button>` : ''}
    ${others.length ? `<p class="hint" style="margin-top:14px">Also going:</p>` +
      others.map(p => `<div class="mrow"><span class="bu" style="background:${C.colorFor(p.name)}">${esc(C.initials(p.name))}</span>
        <div class="mname">${esc(p.name)}${p.note ? ` <span class="hint">— ${esc(p.note)}</span>` : ''}</div></div>`).join('')
      : `<p class="hint" style="margin-top:14px">Nobody else has tagged this yet.</p>`}
  `;
  $('actSheet').classList.add('on');
  $('acClose').onclick = () => $('actSheet').classList.remove('on');
  $('acTog').onclick = () => {
    if (myPicks[id]) delete myPicks[id]; else myPicks[id] = 1;
    saveSoon(); draw(); openAct(id);
  };
  const ns = $('acNoteSave');
  if (ns) ns.onclick = () => {
    const t = $('acNote').value.trim();
    myPicks[id] = t ? { note: t } : 1;
    saveSoon(); draw(); C.toast('Saved');
  };
}
$('actSheet').onclick = e => { if (e.target.id === 'actSheet') $('actSheet').classList.remove('on'); };

/* ---------- my lineup ---------- */
$('mineBtn').onclick = () => {
  const list = Object.keys(myPicks)
    .map(id => Object.assign({ id }, fest.acts[id]))
    .filter(a => a.n)
    .sort((x, y) => x.d - y.d || F.offset(fest, x) - F.offset(fest, y));
  $('mineBody').innerHTML = `
    <div class="phead"><b>My lineup</b><button class="btn sm" id="mnClose">✕</button></div>
    ${list.length ? list.map(a => {
      const v = F.venue(fest, a.v);
      return `<div class="mrow"><div class="mname">${esc(a.n)}
        <div class="hint">${esc(F.dayLabel(fest.days[a.d]))} · ${esc(v ? v.name : '')} · ${esc(a.s)}–${esc(a.e)}</div></div></div>`;
    }).join('') : '<p class="hint">Nothing tagged yet. Tap any set on the timetable.</p>'}`;
  $('mineSheet').classList.add('on');
  $('mnClose').onclick = () => $('mineSheet').classList.remove('on');
};
$('mineSheet').onclick = e => { if (e.target.id === 'mineSheet') $('mineSheet').classList.remove('on'); };
