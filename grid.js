/* MoshPin — the timetable.
   Four independent panes: corner, stage headers, time column, and the grid.
   Only the grid scrolls; the headers follow it horizontally, the times follow
   it vertically. Anything sticky inside a scroller misbehaves on iOS, which is
   why none of this uses position:sticky for the panes themselves. */
import * as C from './core.js';
import * as F from './festival.js';
import * as CI from './checkin.js';
import * as S from './social.js';
import * as T from './transport.js';

const $ = id => document.getElementById(id);
const esc = C.esc;
const ROW = 13;                 // pixels per 15 minutes
const SLOT = 15;

let crew = null, uid = null, fest = null;
let members = {}, photos = {}, admins = {};
let myPicks = {};               // actId -> 1 or {note}
let dayIdx = 0;
let saveTimer = null;
let hidden = {};            // venueId -> true, for the stage filter
let meta = null;
const isAdmin = () => !!admins[uid];

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
    /* title bar: the crew's own name, then the festival */

  try { meta = (await C.ref('groups/' + crew.gid + '/meta').get()).val(); } catch (e) {}
  try { hidden = JSON.parse(localStorage.getItem('mp_hide_' + crew.gid) || '{}'); } catch (e) {}
  C.ref('groups/' + crew.gid + '/admins').on('child_added', s => { admins[s.key] = true; drawTop(); });
  C.ref('groups/' + crew.gid + '/admins').on('child_removed', s => { delete admins[s.key]; drawTop(); });

  const mref = C.ref('groups/' + crew.gid + '/members');
  mref.on('child_added',   s => { takeMember(s.key, s.val()); draw(); });
  mref.on('child_changed', s => { takeMember(s.key, s.val()); draw(); });
  mref.on('child_removed', s => { delete members[s.key]; draw(); });
  C.ref('groups/' + crew.gid + '/admins')
    .on('child_added', s => { admins[s.key] = true; });

  const cur = F.currentDay(fest);
  dayIdx = cur ? cur.idx : 0;

  CI.init({
    gid: crew.gid, uid, fest,
    members: () => members, photos: () => photos,
    onChange: () => { drawCI(); draw(); }
  });
  S.init({
    gid: crew.gid, uid, fest,
    members: () => members, photos: () => photos,
    onChange: () => drawChat()
  });
  T.init({
    gid: crew.gid, uid,
    members: () => members, photos: () => photos,
    onChange: () => { if ($('trSheet').classList.contains('on')) showTransport(); }
  });
  if ('serviceWorker' in navigator)
    navigator.serviceWorker.register('sw.js').catch(() => {});

  $('app').hidden = false;
  $('dock').hidden = false;
  drawTop();
  drawTabs();
  drawStageTabs();
  draw();
  drawCI();
  setInterval(() => { if (!document.hidden) { drawNow(); drawCI(); } }, 60000);
})();

/* ---------- check-in dock ---------- */
let ciOpen = false;
function drawCI() {
  const n = CI.active().length;
  const c = $('ciCount');
  c.textContent = n > 9 ? '9+' : n;
  c.classList.toggle('show', n > 0);
  $('ciFab').classList.toggle('live', !!CI.mine());
  if (ciOpen) {
    CI.render($('ciHead'), $('ciBody'), $('ciFoot'));
    const x = $('ciHead').querySelector('#ciX');
    if (x) x.onclick = () => toggleCI(false);
  }
}
function toggleCI(open) {
  ciOpen = open === undefined ? !ciOpen : open;
  $('ciPanel').classList.toggle('open', ciOpen);
  if (ciOpen) { CI.reset(); drawCI(); }
}
$('ciFab').onclick = () => toggleCI();

/* ---------- chat ---------- */
let chOpen = false;
function drawChat() {
  const n = S.unreadCount();
  const c = $('chCount');
  c.textContent = n > 9 ? '9+' : n;
  c.classList.toggle('show', n > 0 && !chOpen);
  if (chOpen) {
    S.renderChat($('chLog'));
    $('chLog').querySelectorAll('[data-r]').forEach(b =>
      b.onclick = () => S.react(b.dataset.r, b.dataset.e));
    $('chLog').querySelectorAll('[data-add]').forEach(b =>
      b.onclick = e => openRx(b.dataset.add, b, e));
  }
}
function toggleChat(open) {
  chOpen = open === undefined ? !chOpen : open;
  $('chPanel').classList.toggle('open', chOpen);
  S.setOpen(chOpen);
  if (chOpen) { $('ciPanel').classList.remove('open'); drawChat(); setTimeout(() => { $('chLog').scrollTop = $('chLog').scrollHeight; }, 30); }
  else closeRx();
}
$('chFab').onclick = () => toggleChat();
$('chX').onclick = () => toggleChat(false);
$('chSend').onclick = doSend;
$('chInput').addEventListener('keydown', e => { if (e.key === 'Enter') doSend(); });
async function doSend() {
  const v = $('chInput').value;
  if (!v.trim()) return;
  $('chInput').value = '';
  closeEmoji();
  if (!(await S.send(v))) $('chInput').value = v;
}

/* emoji for the message box */
let emojiBuilt = false;
function buildEmoji(el, pick) {
  el.innerHTML = '';
  for (const e of S.EMOJI) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = e;
    b.onclick = () => pick(e);
    el.appendChild(b);
  }
}
function closeEmoji() { $('chEmoji').classList.remove('open'); $('chEmojiBtn').classList.remove('on'); }
$('chEmojiBtn').onclick = () => {
  const p = $('chEmoji');
  const show = !p.classList.contains('open');
  if (show && !emojiBuilt) {
    emojiBuilt = true;
    buildEmoji(p, e => {
      const i = $('chInput');
      const s = i.selectionStart ?? i.value.length, t = i.selectionEnd ?? i.value.length;
      i.value = i.value.slice(0, s) + e + i.value.slice(t);
      i.focus(); try { i.setSelectionRange(s + e.length, s + e.length); } catch (err) {}
    });
  }
  p.classList.toggle('open', show);
  $('chEmojiBtn').classList.toggle('on', show);
};

/* emoji for reacting to a message */
let rxBuilt = false;
function openRx(msgId, anchor, ev) {
  if (ev) { ev.preventDefault(); ev.stopPropagation(); }
  const p = $('rxPick');
  if (!rxBuilt) { rxBuilt = true; buildEmoji(p, e => { S.react(p.dataset.m, e); closeRx(); }); }
  p.dataset.m = msgId;
  p.classList.add('open');
  const r = anchor.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  const pw = Math.min(300, vw - 24), ph = p.offsetHeight || 200;
  p.style.left = Math.round(Math.min(Math.max(8, r.left - 40), vw - pw - 8)) + 'px';
  p.style.top = Math.round(r.top - ph - 8 < 8 ? Math.min(r.bottom + 8, vh - ph - 8) : r.top - ph - 8) + 'px';
}
function closeRx() { $('rxPick').classList.remove('open'); }
document.addEventListener('click', e => {
  const p = $('rxPick');
  if (p.classList.contains('open') && !p.contains(e.target) && !(e.target.dataset && e.target.dataset.add)) closeRx();
}, true);

function takeMember(u, v) {
  members[u] = v || {};
  if (u === uid) {
    myPicks = decPicks(v && v.picks);
    myRatings = S.decRatings(v && v.ratings);
  }
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

/* ---------- top bar ---------- */
function drawTop() {
  $('evTitle').textContent = (meta && meta.name) || (crew && crew.name) || 'My crew';
  $('evSub').textContent = `${fest.name} ${fest.year}`;
  $('crewN').textContent = Object.keys(members).length;
}

/* stage filter — hide the stages you're never going to */
function drawStageTabs() {
  const st = F.stages(fest);
  $('stageTabs').innerHTML =
    `<button class="chip${Object.keys(hidden).length ? '' : ' on'}" data-all="1">All stages</button>`
    + st.map(v => `<button class="chip${hidden[v.id] ? '' : ' on'}" data-v="${v.id}">${esc(v.name)}</button>`).join('');
  $('stageTabs').querySelector('[data-all]').onclick = () => {
    hidden = {}; saveHidden(); drawStageTabs(); draw();
  };
  $('stageTabs').querySelectorAll('[data-v]').forEach(b => b.onclick = () => {
    const id = b.dataset.v;
    if (hidden[id]) delete hidden[id]; else hidden[id] = 1;
    if (F.stages(fest).every(v => hidden[v.id])) hidden = {};   // never hide everything
    saveHidden(); drawStageTabs(); draw();
  });
}
const saveHidden = () => { try { localStorage.setItem('mp_hide_' + crew.gid, JSON.stringify(hidden)); } catch (e) {} };
const shownStages = () => F.stages(fest).filter(v => !hidden[v.id]);

/* ---------- day tabs ---------- */
function drawTabs() {
  $('dayTabs').innerHTML = fest.days.map((d, i) =>
    `<button class="chip day${i === dayIdx ? ' on' : ''}" data-d="${i}">${esc(F.dayLabel(d))}</button>`
  ).join('');
  $('dayTabs').querySelectorAll('[data-d]').forEach(b =>
    b.onclick = () => { dayIdx = +b.dataset.d; drawTabs(); draw(); });
}

/* ---------- the grid ---------- */
function draw() {
  const day = fest.days[dayIdx];
  if (!day) return;
  const stages = shownStages();
  const rows = Math.ceil(day.hours * 60 / SLOT);

  /* header pane */
  const cols = stages.length + (isAdmin() ? 1 : 0);
  $('gHead').style.gridTemplateColumns = `repeat(${cols}, minmax(118px,1fr))`;
  $('gHead').innerHTML = stages.map(v => `<div class="sh">${esc(v.name)}</div>`).join('')
    + (isAdmin() ? '<div class="sh" style="color:var(--dim)">add</div>' : '');

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
  g.style.gridTemplateColumns = `repeat(${cols}, minmax(118px,1fr))`;
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
          ${liveHere(a) ? `<div class="here">📍 ${liveHere(a)}</div>` : ''}
          ${(() => { const s = S.scoreOf(a.id); return s.votes ? `<div class="score">★ ${s.avg.toFixed(1)}</div>` : ''; })()}
        </div>`;
    }
  });
  if (isAdmin())
    html += `<div class="addcol" style="grid-column:${stages.length + 1};grid-row:1 / 6">
      <button id="addStage">+ add a stage</button></div>`;
  g.innerHTML = html;
  const as = $('addStage');
  if (as) as.onclick = addStage;
  g.querySelectorAll('.act').forEach(el => el.onclick = () => openAct(el.dataset.a));
  drawNow();
  
}

const liveHere = a => CI.active().filter(c => c.a === a.id).length;

/* An admin can add a stage the official lineup missed. It gets one all-day
   block per day so people can favourite it and check in — deliberately no act
   editing, because nobody wants to type a lineup. */
async function addStage() {
  const name = prompt('Name of the stage or area');
  if (!name || !name.trim()) return;
  const v = F.addVenue(fest, name.trim(), 'stage');
  fest.days.forEach((d, i) => {
    F.addAct(fest, { d: i, v: v.id, s: C.minToHhmm(d.start * 60),
      e: C.minToHhmm((d.start + d.hours) * 60), n: v.name });
  });
  try { await F.save(crew.gid, fest); C.toast(v.name + ' added'); }
  catch (e) { return C.toast("Couldn't add it — " + (e.message || '')); }
  drawStageTabs(); draw();
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
    ${F.currentDay(fest) ? `<button class="btn wide" id="acHere" style="margin-top:10px">📍 Check in here</button>` : ''}
    <button class="btn ${mine ? 'danger' : 'primary'} wide" id="acTog" style="margin-top:12px">
      ${mine ? 'Remove from my lineup' : '★ Add to my lineup'}</button>
    ${mine ? `<label for="acNote">Your note (everyone sees it)</label>
      <textarea id="acNote" rows="2" maxlength="200" placeholder="e.g. must see for me">${esc(pickNote(myPicks[id]))}</textarea>
      <button class="btn wide" id="acNoteSave" style="margin-top:8px">Save note</button>` : ''}
    ${ratingBlock(id)}
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
  const hb = $('acHere');
  if (hb) hb.onclick = () => {
    $('actSheet').classList.remove('on');
    CI.goFloor(a.v, id);
    ciOpen = true; $('ciPanel').classList.add('open'); drawCI();
  };
  wireStars(id);
  const ns = $('acNoteSave');
  if (ns) ns.onclick = () => {
    const t = $('acNote').value.trim();
    myPicks[id] = t ? { note: t } : 1;
    saveSoon(); draw(); C.toast('Saved');
  };
}


/* ---------- ratings ---------- */
let myRatings = {};
function ratingBlock(id) {
  if (!S.ratingOpen(id)) return '';
  const mineR = myRatings[id] || 0;
  const agg = S.scoreOf(id);
  return `<p class="hint" style="margin-top:14px">Rate this set:</p>
    <div class="stars" id="acStars">
      ${[1,2,3,4,5].map(n => `<button class="star${n <= mineR ? ' on' : ''}" data-s="${n}">★</button>`).join('')}
      ${mineR ? `<button class="btn sm" id="acClear" style="margin-left:8px">clear</button>` : ''}
    </div>
    ${agg.n ? `<p class="hint">Crew average <b style="color:var(--edge)">${agg.avg.toFixed(1)}</b> from ${agg.n} — ${
      S.ratersOf(id).map(r => esc(r.name) + ' ' + r.r + '★').join(', ')}</p>`
      : '<p class="hint">No ratings yet — be the first.</p>'}`;
}
function wireStars(id) {
  const box = $('acStars');
  if (!box) return;
  box.querySelectorAll('.star').forEach(b => b.onclick = () => {
    myRatings[id] = +b.dataset.s; saveRatings(); draw(); openAct(id);
  });
  const c = $('acClear');
  if (c) c.onclick = () => { delete myRatings[id]; saveRatings(); draw(); openAct(id); };
}
let rTimer = null;
function saveRatings() {
  if (rTimer) clearTimeout(rTimer);
  rTimer = setTimeout(async () => {
    rTimer = null;
    try { await C.ref('groups/' + crew.gid + '/members/' + uid).update({ ratings: S.encRatings(myRatings) }); }
    catch (e) { C.toast("Couldn't save that rating"); }
  }, 500);
}

/* ---------- leaderboard ---------- */
function showBoard() {
  const list = S.ranked();
  const dv = S.mostDivisive();
  const medal = ['🥇','🥈','🥉'];
  $('boardBody').innerHTML = `
    <div class="phead"><b>🏆 Best sets</b><button class="btn sm" id="bdClose">✕</button></div>
    ${list.length ? list.slice(0, 20).map((x, i) => {
      const v = F.venue(fest, x.v);
      return `<div class="lbrow"><div class="lbrank">${i < 3 ? medal[i] : i + 1}</div>
        <div class="lbmain"><div class="lbname">${esc(x.n)}</div>
          <div class="hint">${esc(F.dayLabel(fest.days[x.d]))} · ${esc(v ? v.name : '')} · ${x.votes} vote${x.votes === 1 ? '' : 's'}</div></div>
        <div class="lbscore">${x.avg.toFixed(1)}</div></div>`;
    }).join('') : '<p class="hint">Nothing rated yet. Sets can be rated once they are halfway through.</p>'}
    ${dv ? `<div class="lbrow"><div class="lbrank">💥</div>
      <div class="lbmain"><div class="lbname">${esc(dv.n)}</div>
        <div class="hint">Most divisive — scores ${dv.spread} apart</div></div>
      <div class="lbscore">${dv.avg.toFixed(1)}</div></div>` : ''}`;
  $('boardSheet').classList.add('on');
  $('bdClose').onclick = () => $('boardSheet').classList.remove('on');
}


/* ---------- the wrap ---------- */
async function showWrap() {
  let tallies = {};
  try { tallies = (await C.ref('groups/' + crew.gid + '/tally').get()).val() || {}; } catch (e) {}
  const D = S.wrapData(tallies);
  const note = S.bestNote();
  const medal = ['🥇','🥈','🥉'];
  const k = n => n > 999 ? (n / 1000).toFixed(1) + 'k' : n;
  $('wrapBody').innerHTML = `
    <div class="phead"><b>🎁 The wrap</b><button class="btn sm" id="wpClose">✕</button></div>
    <div style="text-align:center;padding:6px 0 2px">
      <div style="font-size:19px;font-weight:700">${esc(fest.name)} ${fest.year}</div>
      <div class="hint">${D.rows.length} in the crew</div></div>
    <div class="wstats">
      <div class="wstat"><b>${k(D.totals.picks)}</b><span>TAGGED</span></div>
      <div class="wstat"><b>${k(D.totals.rated)}</b><span>RATINGS</span></div>
      <div class="wstat"><b>${k(D.totals.checkins)}</b><span>CHECK-INS</span></div>
      <div class="wstat"><b>${k(D.totals.msgs)}</b><span>MESSAGES</span></div>
    </div>
    <p class="wsec">The awards</p>
    ${D.awards.map(a => `<div class="wcard${a.hero ? ' hero' : ''}">
      <div class="wico">${a.i}</div>
      <div style="flex:1;min-width:0"><div class="hint">${esc(a.t)}</div>
        <div class="wn">${esc(a.w.r.p.name)}</div></div>
      <div class="wv">${esc(String(a.f(a.w.v)))}</div></div>`).join('')}
    ${D.top.length ? `<p class="wsec">Sets of the weekend</p>` + D.top.map((x, i) =>
      `<div class="lbrow"><div class="lbrank">${medal[i]}</div>
        <div class="lbmain"><div class="lbname">${esc(x.n)}</div>
        <div class="hint">${esc(F.dayLabel(fest.days[x.d]))} · ${x.votes} votes</div></div>
        <div class="lbscore">${x.avg.toFixed(1)}</div></div>`).join('') : ''}
    ${note ? `<p class="wsec">Best tip</p><div class="wquote">${esc(note.text)}
      <div class="hint" style="margin-top:6px">${esc(note.who)}, on ${esc(note.act.n)}</div></div>` : ''}
    <button class="btn primary wide" id="wpCopy" style="margin-top:18px">Copy as text</button>`;
  $('wrapSheet').classList.add('on');
  $('wpClose').onclick = () => $('wrapSheet').classList.remove('on');
  $('wpCopy').onclick = async () => {
    const L = [`${fest.name} ${fest.year} — THE WRAP`, '',
      `${D.totals.picks} tagged · ${D.totals.rated} ratings · ${D.totals.checkins} check-ins · ${D.totals.msgs} messages`, '', 'AWARDS'];
    D.awards.forEach(a => L.push(`${a.i} ${a.t.split(' — ')[0]}: ${a.w.r.p.name} (${a.f(a.w.v)})`));
    if (D.top.length) { L.push('', 'BEST SETS'); D.top.forEach((x, i) => L.push(`${medal[i]} ${x.n} — ${x.avg.toFixed(1)}`)); }
    if (note) L.push('', `BEST TIP — ${note.who} on ${note.act.n}:`, `"${note.text}"`);
    try { await navigator.clipboard.writeText(L.join('\n')); C.toast('Copied'); } catch (e) {}
  };
}


/* ---------- menu ---------- */
const closeSheet = id => $(id).classList.remove('on');
['menuSheet','crewSheet','trSheet','boardSheet','wrapSheet','actSheet','mineSheet','profSheet']
  .forEach(id => $(id).onclick = e => { if (e.target.id === id) closeSheet(id); });

$('menuBtn').onclick = () => {
  const others = C.allGroups().filter(g => g.gid !== crew.gid);
  $('menuBody').innerHTML = `
    <div class="phead"><b>Menu</b><button class="btn sm" id="mxClose">✕</button></div>
    <div class="menugrid">
      <button class="btn" id="mProfile">🙂 My profile</button>
      <button class="btn" id="mMine">★ My lineup</button>
      <button class="btn" id="mTransport">🚗 Getting there</button>
      <button class="btn" id="mInvite">✉ Invite someone</button>
      ${F.hasStarted(fest) ? '<button class="btn" id="mBoard">🏆 Best sets</button>' : ''}
      ${F.isOver(fest) ? '<button class="btn" id="mWrap">🎁 The wrap</button>' : ''}
    </div>
    ${others.length ? `<div class="tgroup">Switch crew</div>` + others.map(g =>
      `<button class="btn wide" style="margin-bottom:6px" data-sw="${esc(g.gid)}">${esc(g.name)}</button>`).join('') : ''}
    <div class="tgroup">This crew</div>
    <button class="btn wide" id="mNew" style="margin-bottom:6px">Join or create another crew</button>
    <button class="btn danger wide" id="mLeave">Leave ${esc((meta && meta.name) || 'this crew')}</button>`;
  $('menuSheet').classList.add('on');
  $('mxClose').onclick = () => closeSheet('menuSheet');
  $('mProfile').onclick = () => { closeSheet('menuSheet'); showProfile(); };
  $('mMine').onclick = () => { closeSheet('menuSheet'); showMine(); };
  $('mTransport').onclick = () => { closeSheet('menuSheet'); showTransport(); };
  $('mInvite').onclick = () => { closeSheet('menuSheet'); showCrew(true); };
  const bb = $('mBoard'); if (bb) bb.onclick = () => { closeSheet('menuSheet'); showBoard(); };
  const wb = $('mWrap'); if (wb) wb.onclick = () => { closeSheet('menuSheet'); showWrap(); };
  $('mNew').onclick = () => { location.href = 'index.html?add=1'; };
  $('mLeave').onclick = async () => {
    if (!confirm(`Leave ${(meta && meta.name) || 'this crew'}? You'll need the invite and passcode to come back.`)) return;
    try { await C.ref('groups/' + crew.gid + '/members/' + uid).remove(); } catch (e) {}
    C.forgetGroup(crew.gid);
    location.href = 'index.html';
  };
  $('menuBody').querySelectorAll('[data-sw]').forEach(b => b.onclick = () => {
    const g = C.allGroups().find(x => x.gid === b.dataset.sw);
    if (g) { C.setCurrentGroup(g); location.reload(); }
  });
};

/* ---------- the crew ---------- */
$('crewBtn').onclick = () => showCrew(false);
function showCrew(inviteFirst) {
  const link = location.origin + location.pathname.replace(/[^/]*$/, '') + 'index.html?g=' + crew.gid;
  const order = Object.keys(members).sort((a, b) =>
    a === uid ? -1 : b === uid ? 1 : String(members[a].name || '').localeCompare(String(members[b].name || '')));
  $('crewBody').innerHTML = `
    <div class="phead"><b>👥 ${esc((meta && meta.name) || 'The crew')}</b><button class="btn sm" id="cwClose">✕</button></div>
    <div class="mlist">${order.map(u => `<div class="mrow">${avatarFor(u)}
      <div class="mname">${esc(members[u].name || '?')}
        ${u === uid ? '<span class="tag">you</span>' : ''}${admins[u] ? '<span class="tag adm">admin</span>' : ''}</div>
      ${isAdmin() && u !== uid ? `<button class="mini" data-adm="${u}">${admins[u] ? 'Unadmin' : 'Make admin'}</button>
        <button class="mini danger" data-kick="${u}">Remove</button>` : ''}
    </div>`).join('')}</div>
    <label for="cwLink">Invite link</label>
    <input type="text" id="cwLink" readonly value="${esc(link)}">
    <p class="hint" style="margin-top:6px">They'll need the passcode too — send that separately.</p>
    <div class="row" style="margin-top:10px">
      <button class="btn" id="cwCopy">Copy link</button>
      <button class="btn" id="cwShare">Share</button>
    </div>`;
  $('crewSheet').classList.add('on');
  $('cwClose').onclick = () => closeSheet('crewSheet');
  $('cwCopy').onclick = async () => {
    try { await navigator.clipboard.writeText(link); C.toast('Link copied'); } catch (e) { $('cwLink').select(); }
  };
  $('cwShare').onclick = async () => {
    const t = `Join ${(meta && meta.name) || 'my crew'} on MoshPin\n${link}`;
    if (navigator.share) { try { await navigator.share({ text: t }); } catch (e) {} }
    else { try { await navigator.clipboard.writeText(t); C.toast('Copied'); } catch (e) {} }
  };
  $('crewBody').querySelectorAll('[data-adm]').forEach(b => b.onclick = async () => {
    const u = b.dataset.adm;
    try {
      if (admins[u]) {
        if (Object.keys(admins).length < 2) return C.toast('A crew needs one admin');
        await C.ref('groups/' + crew.gid + '/admins/' + u).remove();
      } else await C.ref('groups/' + crew.gid + '/admins/' + u).set(true);
      setTimeout(() => showCrew(false), 150);
    } catch (e) { C.toast("Couldn't change that"); }
  });
  $('crewBody').querySelectorAll('[data-kick]').forEach(b => b.onclick = async () => {
    const u = b.dataset.kick;
    if (!confirm(`Remove ${members[u].name}?`)) return;
    try {
      await C.ref('groups/' + crew.gid + '/members/' + u).remove();
      await C.ref('groups/' + crew.gid + '/admins/' + u).remove().catch(() => {});
    } catch (e) {}
    setTimeout(() => showCrew(false), 150);
  });
  if (inviteFirst) setTimeout(() => $('cwLink').select(), 60);
}
function avatarFor(u, size) {
  const s = size || 32, nm = (members[u] || {}).name || '?';
  return photos[u]
    ? `<img class="av" src="${photos[u]}" alt="" style="width:${s}px;height:${s}px">`
    : `<span class="av fb" style="width:${s}px;height:${s}px;background:${C.colorFor(nm)};font-size:${Math.round(s / 2.6)}px">${esc(C.initials(nm))}</span>`;
}

/* ---------- profile ---------- */
let pendingPhoto = null;
function showProfile() {
  $('profBody').innerHTML = `
    <div class="phead"><b>My profile</b><button class="btn sm" id="pfClose">✕</button></div>
    <div style="text-align:center;margin:8px 0" id="pfPrev">${avatarFor(uid, 76)}</div>
    <label for="pfFile">Photo</label><input type="file" id="pfFile" accept="image/*">
    <label for="pfName">Name</label>
    <input type="text" id="pfName" maxlength="24" value="${esc((members[uid] || {}).name || '')}">
    <button class="btn primary wide" id="pfSave" style="margin-top:14px">Save</button>`;
  $('profSheet').classList.add('on');
  $('pfClose').onclick = () => closeSheet('profSheet');
  $('pfFile').onchange = e => {
    const f = e.target.files && e.target.files[0]; e.target.value = '';
    if (!f) return;
    shrink(f, 96, 0.7).then(dd => {
      if (!dd) return C.toast("Couldn't read that image");
      pendingPhoto = dd;
      $('pfPrev').innerHTML = `<img class="av" src="${dd}" alt="" style="width:76px;height:76px">`;
    });
  };
  $('pfSave').onclick = async () => {
    const nm = $('pfName').value.trim();
    if (!nm) return C.toast('Enter a name');
    try {
      await C.ref('groups/' + crew.gid + '/members/' + uid).update({ name: nm, t: crew.token });
      if (pendingPhoto) {
        await C.ref('groups/' + crew.gid + '/photos/' + uid).set(pendingPhoto);
        photos[uid] = pendingPhoto;
        try { localStorage.setItem('mp_photos_' + crew.gid, JSON.stringify(photos)); } catch (e) {}
        pendingPhoto = null;
      }
      C.setMyProfile({ name: nm, photo: null });
      closeSheet('profSheet'); draw(); C.toast('Saved');
    } catch (e) { C.toast("Couldn't save — " + (e.message || '')); }
  };
}
function shrink(file, px, q) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(img.width, img.height);
      const c = document.createElement('canvas'); c.width = c.height = px;
      try { c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, px, px);
            res(c.toDataURL('image/jpeg', q)); } catch (e) { res(null); }
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => res(null);
    img.src = URL.createObjectURL(file);
  });
}

/* ---------- transport ---------- */
function showTransport() {
  T.render($('trBody'), isAdmin());
  $('trSheet').classList.add('on');
  $('trX').onclick = () => closeSheet('trSheet');
  $('trMine').onclick = () => openTravel(uid);
  $('trBody').querySelectorAll('[data-ed]').forEach(b => b.onclick = () => openTravel(b.dataset.ed));
}
function openTravel(forUid) {
  T.renderForm($('trBody'), forUid, () => showTransport());
  $('trX').onclick = () => closeSheet('trSheet');
}

/* ---------- my lineup ---------- */
function showMine() {
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
  $('mnClose').onclick = () => closeSheet('mineSheet');
}

