/* MoshPin — the timetable.
Four independent panes: corner, stage headers, time column, and the grid.
Only the grid scrolls; the headers follow it horizontally, the times follow
it vertically. Anything sticky inside a scroller misbehaves on iOS, which is
why none of this uses position:sticky for the panes themselves. */
import * as C from ‘./core.js’;
import * as F from ‘./festival.js’;
import * as CI from ‘./checkin.js’;
import * as S from ‘./social.js’;
import * as T from ‘./transport.js’;
import { svg as qrSvg } from ‘./qr.js’;

const $ = id => document.getElementById(id);
const esc = C.esc;
const ROW = 13;                 // pixels per 15 minutes
const GAP = 6;                  // must match the CSS column gap
const SLOT = 15;

let crew = null, uid = null, fest = null;
let members = {}, photos = {}, admins = {};
let myPicks = {};               // actId -> 1 or {note}
let dayIdx = 0;
let saveTimer = null;
let meta = null;
let cfg = {};                       // crew settings — currently just the lock
let pending = {};                   // people waiting to be let in
const isAdmin = () => !!admins[uid];

const pickNote = v => (v && typeof v === ‘object’ && v.note) ? v.note : ‘’;
const encPicks = o => Object.keys(o || {}).join(’ ‘);
const decPicks = v => {
if (!v) return {};
if (typeof v === ‘object’) return v;
const out = {}; for (const k of String(v).split(’ ’)) if (k) out[k] = 1;
return out;
};

/* ––––– boot ––––– */
function boom(msg, detail) {
$(‘app’).innerHTML = `<div class="card"><h2>Something went wrong</h2> <p class="hint" style="margin-top:8px">${esc(msg)}</p> ${detail ? `<p class="hint" style="opacity:.7;margin-top:6px">${esc(detail)}</p>` : ''} <div style="margin-top:16px"><a class="btn wide" href="app.html">Back to the crew</a></div></div>`;
$(‘app’).hidden = false;
}
window.addEventListener(‘error’, e => {
if (!$(‘app’).innerHTML.includes(‘Something went wrong’)) boom(‘A script failed.’, e.message);
});

(async function () {
crew = C.currentGroup();
if (!crew) { location.href = ‘index.html’; return; }
if (typeof firebase === ‘undefined’) return boom(‘Could not load Firebase.’);
try { C.init(); await C.signIn(); }
catch (e) { return boom(“Couldn’t sign in.”, e && (e.code || e.message)); }
/* identity inside a crew is name + personal pin, not the device */
uid = crew.key;
/* Crews joined before accounts were keyed by name+pin have no key stored.
Send them to sign in again rather than bouncing silently — that looked
like the app was broken. */
if (!uid) { location.href = ‘index.html?g=’ + encodeURIComponent(crew.gid) + ‘&again=1’; return; }
/* make sure this device is registered against the person — devices that
joined before this existed, and any second phone, land here */
/* Register this device against the person. Without it the rules treat you as
a stranger: the crew reads as empty and every edit is refused. Try with the
passcode if we have it, otherwise the person key alone — which only someone
who knows that member’s name and pin can produce. */
let registered = false;
try {
const rec = { k: uid };
if (crew.token) rec.t = crew.token;
await C.ref(‘groups/’ + crew.gid + ‘/uidmap/’ + C.myUid()).set(rec);
registered = true;
} catch (e) {}

try { photos = JSON.parse(localStorage.getItem(‘mp_photos_’ + crew.gid) || ‘{}’); } catch (e) {}

fest = await F.load(crew.gid);
if (!fest || !fest.days.length || !F.stages(fest).length) {
return boom(‘This crew has no timetable yet.’,
‘An admin needs to set up the festival first.’);
}
/* title bar: the crew’s own name, then the festival */

try { meta = (await C.ref(‘groups/’ + crew.gid + ‘/meta’).get()).val(); } catch (e) {}
C.ref(‘groups/’ + crew.gid + ‘/config’).on(‘value’, s => { cfg = s.val() || {}; }, () => {});
/* only admins can read this, so the listener simply stays empty for everyone else */
C.ref(‘groups/’ + crew.gid + ‘/pending’).on(‘value’, s => {
pending = s.val() || {}; drawTop();
}, () => {});
C.ref(‘groups/’ + crew.gid + ‘/admins’).on(‘child_added’, s => { admins[s.key] = true; drawTop(); });
C.ref(‘groups/’ + crew.gid + ‘/admins’).on(‘child_removed’, s => { delete admins[s.key]; drawTop(); });

/* Picks, ratings and notes live apart from the member record. Tagging a set
used to rebroadcast your name, join token, every rating and every note to
the whole crew; now it sends just the picks string. */
/* Photos are only ever cached locally, so a face taken on someone else’s
phone never arrived. Fetch each one exactly once, then keep it — they never
change, so this costs nothing after the first visit. */
const fetching = {};
function fetchPhotos() {
for (const u of Object.keys(members)) {
if (photos[u] !== undefined || fetching[u]) continue;
fetching[u] = 1;
C.ref(‘groups/’ + crew.gid + ‘/photos/’ + u).get()
.then(s => {
photos[u] = s.val() || null;
try { localStorage.setItem(‘mp_photos_’ + crew.gid, JSON.stringify(photos)); } catch (e) {}
draw();
if ($(‘crewSheet’).classList.contains(‘on’)) showCrew();
})
.catch(() => { delete fetching[u]; });
}
}
window.__photos = fetchPhotos;

const mref = C.ref(‘groups/’ + crew.gid + ‘/members’);
/* A denied read used to fail silently, which is exactly what made a full crew
look empty. Say so instead. */
const denied = e => {
if (!String(e && e.message || ‘’).includes(‘PERMISSION’)) return;
if (document.querySelector(’.updbar.err’)) return;
const bar = document.createElement(‘div’);
bar.className = ‘updbar err’;
bar.innerHTML = ‘<span>This device isn't recognised by the crew, so nothing will load or save. ’
+ ‘Sign in again with your name and pin.</span>’
+ ‘<button class="btn sm primary" id="reGo">Sign in again</button>’;
document.querySelector(’.topbar’).after(bar);
bar.querySelector(’#reGo’).onclick = () =>
location.href = ‘index.html?g=’ + encodeURIComponent(crew.gid) + ‘&again=1’;
};
mref.on(‘child_added’,   s => { takeMember(s.key, s.val()); fetchPhotos(); draw(); }, denied);
mref.on(‘child_changed’, s => { takeMember(s.key, s.val()); fetchPhotos(); draw(); }, denied);
mref.on(‘child_removed’, s => { delete members[s.key]; delete picksOf[s.key]; draw(); });

for (const [node, bag] of [[‘pk’, picksOf], [‘rt’, ratesOf], [‘nt’, notesOf]]) {
const r = C.ref(‘groups/’ + crew.gid + ‘/’ + node);
const set = (k, v) => { if (v == null) delete bag[k]; else bag[k] = v;
if (k === uid) syncMine(); draw(); };
r.on(‘child_added’,   s => set(s.key, s.val()));
r.on(‘child_changed’, s => set(s.key, s.val()));
r.on(‘child_removed’, s => set(s.key, null));
}

/* a join token only proves the passcode once — drop it so it stops riding
along on every broadcast */
try {
const meRec = C.ref(‘groups/’ + crew.gid + ‘/members/’ + uid);
if (((await meRec.get()).val() || {}).t) await meRec.child(‘t’).remove();
} catch (e) {}
C.ref(‘groups/’ + crew.gid + ‘/admins’)
.on(‘child_added’, s => { admins[s.key] = true; });

const cur = F.currentDay(fest);
dayIdx = cur ? cur.idx : 0;

CI.init({
gid: crew.gid, uid, fest,
members: () => members, photos: () => photos,
onChange: () => { drawCI(); draw(); }
});
S.useRatings(() => ratesOf);
S.init({
gid: crew.gid, uid, fest,
members: () => members, photos: () => photos,
onChange: () => drawChat()
});
T.init({
gid: crew.gid, uid,
members: () => members, photos: () => photos,
onChange: () => { if ($(‘trSheet’).classList.contains(‘on’)) showTransport(); }
});
if (‘serviceWorker’ in navigator)
navigator.serviceWorker.register(‘sw.js’).catch(() => {});

$(‘app’).hidden = false;
$(‘dock’).hidden = false;
drawTop();
checkForUpdate();
drawTabs();
draw();
drawCI();
setInterval(() => { if (!document.hidden) { drawNow(); drawCI(); } }, 60000);
})();

/* ––––– check-in dock ––––– */
let ciOpen = false;
function drawCI() {
const n = CI.active().length;
const c = $(‘ciCount’);
c.textContent = n > 9 ? ‘9+’ : n;
c.classList.toggle(‘show’, n > 0);
$(‘ciFab’).classList.toggle(‘live’, !!CI.mine());
if (ciOpen) {
CI.render($(‘ciHead’), $(‘ciBody’), $(‘ciFoot’));
const x = $(‘ciHead’).querySelector(’#ciX’);
if (x) x.onclick = () => toggleCI(false);
}
}
function toggleCI(open) {
ciOpen = open === undefined ? !ciOpen : open;
$(‘ciPanel’).classList.toggle(‘open’, ciOpen);
if (ciOpen) { CI.reset(); drawCI(); }
}
$(‘ciFab’).onclick = () => toggleCI();

/* ––––– chat ––––– */
let chOpen = false;
function drawChat() {
const n = S.unreadCount();
const c = $(‘chCount’);
c.textContent = n > 9 ? ‘9+’ : n;
c.classList.toggle(‘show’, n > 0 && !chOpen);
if (chOpen) {
S.renderChat($(‘chLog’));
$(‘chLog’).querySelectorAll(’[data-r]’).forEach(b =>
b.onclick = () => S.react(b.dataset.r, b.dataset.e));
$(‘chLog’).querySelectorAll(’[data-add]’).forEach(b =>
b.onclick = e => openRx(b.dataset.add, b, e));
}
}
function toggleChat(open) {
chOpen = open === undefined ? !chOpen : open;
$(‘chPanel’).classList.toggle(‘open’, chOpen);
S.setOpen(chOpen);
if (chOpen) { $(‘ciPanel’).classList.remove(‘open’); drawChat(); setTimeout(() => { $(‘chLog’).scrollTop = $(‘chLog’).scrollHeight; }, 30); }
else closeRx();
}
$(‘chFab’).onclick = () => toggleChat();
$(‘chX’).onclick = () => toggleChat(false);
$(‘chSend’).onclick = doSend;
$(‘chInput’).addEventListener(‘keydown’, e => { if (e.key === ‘Enter’) doSend(); });
async function doSend() {
const v = $(‘chInput’).value;
if (!v.trim()) return;
$(‘chInput’).value = ‘’;
closeEmoji();
if (!(await S.send(v))) $(‘chInput’).value = v;
}

/* emoji for the message box */
let emojiBuilt = false;
function buildEmoji(el, pick) {
el.innerHTML = ‘’;
for (const e of S.EMOJI) {
const b = document.createElement(‘button’);
b.type = ‘button’; b.textContent = e;
b.onclick = () => pick(e);
el.appendChild(b);
}
}
function closeEmoji() { $(‘chEmoji’).classList.remove(‘open’); $(‘chEmojiBtn’).classList.remove(‘on’); }
$(‘chEmojiBtn’).onclick = () => {
const p = $(‘chEmoji’);
const show = !p.classList.contains(‘open’);
if (show && !emojiBuilt) {
emojiBuilt = true;
buildEmoji(p, e => {
const i = $(‘chInput’);
const s = i.selectionStart ?? i.value.length, t = i.selectionEnd ?? i.value.length;
i.value = i.value.slice(0, s) + e + i.value.slice(t);
i.focus(); try { i.setSelectionRange(s + e.length, s + e.length); } catch (err) {}
});
}
p.classList.toggle(‘open’, show);
$(‘chEmojiBtn’).classList.toggle(‘on’, show);
};

/* emoji for reacting to a message */
let rxBuilt = false;
function openRx(msgId, anchor, ev) {
if (ev) { ev.preventDefault(); ev.stopPropagation(); }
const p = $(‘rxPick’);
if (!rxBuilt) { rxBuilt = true; buildEmoji(p, e => { S.react(p.dataset.m, e); closeRx(); }); }
p.dataset.m = msgId;
p.classList.add(‘open’);
const r = anchor.getBoundingClientRect();
const vw = window.innerWidth, vh = window.innerHeight;
const pw = Math.min(300, vw - 24), ph = p.offsetHeight || 200;
p.style.left = Math.round(Math.min(Math.max(8, r.left - 40), vw - pw - 8)) + ‘px’;
p.style.top = Math.round(r.top - ph - 8 < 8 ? Math.min(r.bottom + 8, vh - ph - 8) : r.top - ph - 8) + ‘px’;
}
function closeRx() { $(‘rxPick’).classList.remove(‘open’); }
document.addEventListener(‘click’, e => {
const p = $(‘rxPick’);
if (p.classList.contains(‘open’) && !p.contains(e.target) && !(e.target.dataset && e.target.dataset.add)) closeRx();
}, true);

let picksOf = {}, ratesOf = {}, notesOf = {};
function takeMember(u, v) {
members[u] = v || {};
/* older records kept everything inline — keep reading those */
if (v && v.picks && picksOf[u] === undefined) picksOf[u] = v.picks;
if (v && v.ratings && ratesOf[u] === undefined) ratesOf[u] = v.ratings;
if (v && v.notes && notesOf[u] === undefined) notesOf[u] = v.notes;
if (u === uid) syncMine();
}
function syncMine() {
myPicks = decPicks(picksOf[uid]);
myRatings = S.decRatings(ratesOf[uid]);
const n = notesOf[uid] || {};
for (const k of Object.keys(n)) if (myPicks[k]) myPicks[k] = { note: n[k] };
}
const picksFor = u => decPicks(picksOf[u]);
const notesFor = u => notesOf[u] || {};

/* ––––– saving picks –––––
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
await C.ref(‘groups/’ + crew.gid + ‘/pk/’ + uid).set(encPicks(myPicks));
await C.ref(‘groups/’ + crew.gid + ‘/nt/’ + uid).set(Object.keys(notes).length ? notes : null);
} catch (e) { C.toast(“Couldn’t save that — “ + (e.message || ‘’)); }
}
window.addEventListener(‘pagehide’, () => { if (saveTimer) savePicks(); });

/* Who tagged this set. Our own entry comes from local state rather than the
synced copy, so tags and notes appear the instant you make them instead of
waiting for the round trip. */
function pickers(actId) {
const out = [];
for (const u of Object.keys(members)) {
if (u === uid) continue;
if (picksFor(u)[actId]) out.push({ uid: u, name: members[u].name || ‘?’,
note: notesFor(u)[actId] || ‘’ });
}
out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
if (myPicks[actId]) {
const nm = (members[uid] && members[uid].name) || (C.myProfile() || {}).name || ‘You’;
out.unshift({ uid, name: nm, note: pickNote(myPicks[actId]) });
}
return out;
}

/* ––––– keeping an existing crew up to date –––––
A crew takes its own copy of the timetable, which is what stops one crew’s
edits disturbing another. The cost is that corrections never arrive. So we
compare against the library’s version stamp — a few bytes — and offer the
update. Stages the crew added themselves are carried across, and act ids are
derived from the act itself, so tagged sets survive the swap. */
async function checkForUpdate() {
if (!meta || !meta.slug) return;
let entry = null;
try { entry = (await C.ref(‘library_index/’ + meta.slug).get()).val(); } catch (e) { return; }
if (!entry || !entry.updatedAt) return;
if (fest.updatedAt && fest.updatedAt >= entry.updatedAt) return;

const bar = document.createElement(‘div’);
bar.className = ‘updbar’;
bar.innerHTML = `<span>An updated timetable is available for ${esc(fest.name)}.</span>`
+ (isAdmin() ? ‘<button class="btn sm primary" id="updGo">Update</button>’ : ‘’)
+ ‘<button class="btn sm" id="updNo">Dismiss</button>’;
document.querySelector(’.topbar’).after(bar);
bar.querySelector(’#updNo’).onclick = () => bar.remove();
const go = bar.querySelector(’#updGo’);
if (go) go.onclick = async () => {
go.disabled = true; go.textContent = ‘Updating…’;
try {
const lib = (await C.ref(‘library/’ + meta.slug).get()).val();
if (!lib) throw new Error(‘not found’);
const fresh = F.normalise(lib);
/* keep anything this crew added itself */
const mine = fest.venues.filter(v => v.added);
for (const v of mine) if (!fresh.venues.some(x => x.id === v.id)) fresh.venues.push(v);
for (const [id, a] of Object.entries(fest.acts))
if (mine.some(v => v.id === a.v) && !fresh.acts[id]) fresh.acts[id] = a;
fresh.updatedAt = entry.updatedAt;
await F.save(crew.gid, fresh);
C.toast(‘Timetable updated’);
location.reload();
} catch (e) {
go.disabled = false; go.textContent = ‘Update’;
C.toast(“Couldn’t update — “ + (e.message || ‘’));
}
};
}

/* Admins can rename the crew and the line under it. The subtitle defaults to
the festival name, but a crew doing two weekends may want something else. */
async function renameCrew() {
const cur = (meta && meta.name) || ‘’;
const nu = (prompt(‘Name of this crew’, cur) || ‘’).trim();
if (nu && nu !== cur) {
try {
await C.ref(‘groups/’ + crew.gid + ‘/meta/name’).set(nu.slice(0, 40));
meta.name = nu.slice(0, 40);
crew.name = meta.name; C.setCurrentGroup(crew);
drawTop();
} catch (e) {
return C.toast(String(e.message || ‘’).includes(‘PERMISSION’)
? ‘Only admins can rename this crew.’ : “Couldn’t rename it.”);
}
}
}

/* ––––– top bar ––––– */
function drawTop() {
$(‘evTitle’).textContent = (meta && meta.name) || (crew && crew.name) || ‘My crew’;
$(‘evSub’).textContent = `${fest.name} ${fest.year}`;   // fixed — it is the festival
const box = document.querySelector(’.evname’);
box.classList.toggle(‘editable’, isAdmin());
box.title = isAdmin() ? ‘Tap to rename’ : ‘’;
box.onclick = isAdmin() ? renameCrew : null;
$(‘crewN’).textContent = Object.keys(members).length;
const waiting = isAdmin() ? Object.keys(pending).length : 0;
$(‘crewBtn’).classList.toggle(‘nudge’, waiting > 0);
$(‘crewBtn’).title = waiting ? `${waiting} waiting to be let in` : ‘The crew’;
}

/* ––––– day tabs ––––– */
function drawTabs() {
$(‘dayTabs’).innerHTML = fest.days.map((d, i) =>
`<button class="chip day${i === dayIdx ? ' on' : ''}" data-d="${i}">${esc(F.dayLabel(d))}</button>`
).join(’’);
$(‘dayTabs’).querySelectorAll(’[data-d]’).forEach(b =>
b.onclick = () => { dayIdx = +b.dataset.d; drawTabs(); draw(); });
}

/* ––––– the grid ––––– */
function draw() {
const day = fest.days[dayIdx];
if (!day) return;
const stages = F.stages(fest);
const rows = Math.ceil(day.hours * 60 / SLOT);

/* header pane */
const cols = stages.length + (isAdmin() ? 1 : 0);
/* Pin both panes to one identical pixel width. Left to `1fr` they resolve
differently — the header has no blocks in it — and the header ends up with
no scroll range, so it sits still while the grid moves underneath. */
const tt = document.querySelector(’.tt’);
const top = tt.getBoundingClientRect().top;
tt.style.height = Math.max(240, window.innerHeight - top) + ‘px’;
const avail = Math.max(240, $(‘gWrap’).clientWidth || 320);
const colW = Math.max(118, Math.floor((avail - (cols - 1) * GAP) / cols));
const totalW = cols * colW + (cols - 1) * GAP;
const track = `repeat(${cols}, ${colW}px)`;

$(‘gHead’).style.gridTemplateColumns = track;
$(‘gHead’).style.width = totalW + ‘px’;
$(‘gHead’).innerHTML = stages.map(v =>
`<div class="sh">${esc(v.name)}${(v.added && isAdmin()) ? `<button class="del" data-delv="${v.id}" title="Remove this stage">✕</button>` : ''}</div>`).join(’’)
+ (isAdmin() ? ‘<div class="sh" style="color:var(--dim)">add</div>’ : ‘’);
$(‘gHead’).querySelectorAll(’[data-delv]’).forEach(b => b.onclick = e => {
e.stopPropagation(); removeStage(b.dataset.delv);
});

/* time column */
let tc = ‘’;
for (let m = 0; m <= day.hours * 60; m += 60) {
const clock = C.minToHhmm(day.start * 60 + m);
tc += `<div class="tl" style="top:${(m / SLOT) * ROW - 6}px">${clock}</div>`;
}
$(‘gTime’).innerHTML = tc;
$(‘gTime’).style.height = (rows * ROW) + ‘px’;

/* grid */
const g = $(‘gGrid’);
g.style.gridTemplateColumns = track;
g.style.width = totalW + ‘px’;
g.style.gridAutoRows = ROW + ‘px’;
g.style.height = (rows * ROW) + ‘px’;

let html = ‘’;
for (let m = 0; m <= day.hours * 60; m += 60)
html += `<div class="hl" style="top:${(m / SLOT) * ROW}px"></div>`;

stages.forEach((v, col) => {
const acts = F.actsOf(fest, dayIdx, v.id);
if (!acts.length) {                       // a stage with no lineup: hourly slots
for (let h = 0; h < day.hours; h++) {
const hhmm = C.minToHhmm(day.start * 60 + h * 60);
const id = synId(v.id, dayIdx, hhmm);
const r1 = Math.round(h * 60 / SLOT) + 1;
const pk = pickers(id);
const mine = !!myPicks[id];
html += `<div class="act slot${mine ? ' mine' : ''}${pk.length ? ' b' + Math.min(3, pk.length) : ''}" data-a="${id}" style="grid-column:${col + 1};grid-row:${r1} / ${r1 + 4}"> <div class="t">${pk.length ? esc(hhmm) : '+'}</div> ${pk.length ? `<div class="tm">${esc(hhmm)}</div>`: ''} ${pk.length ?`<div class="bb">${pk.slice(0, 3).map(p =>
`<span class="bu" style="background:${C.colorFor(p.name)}" title="${esc(p.name)}">${esc(C.initials(p.name))}</span>`
).join(’’)}${pk.length > 3 ? `<span class="bu more">+${pk.length - 3}</span>` : ‘’}</div>` : ''} </div>`;
}
return;
}
for (const a of acts) {
const o = F.offset(fest, a), e = F.endOffset(fest, a);
const r1 = Math.round(o / SLOT) + 1, r2 = Math.max(r1 + 1, Math.round(e / SLOT) + 1);
const mine = !!myPicks[a.id];
const pk = pickers(a.id);
html += `<div class="act${mine ? ' mine' : ''}${pk.length ? ' b' + Math.min(3, pk.length) : ''}" data-a="${a.id}" style="grid-column:${col + 1};grid-row:${r1} / ${r2}"> <div class="t">${esc(a.n)}</div> <div class="tm">${esc(a.s)}–${esc(a.e)}</div> ${pk.length ? `<div class="bb">${pk.slice(0, 3).map(p =>
`<span class="bu" style="background:${C.colorFor(p.name)}" title="${esc(p.name)}">${esc(C.initials(p.name))}</span>`
).join(’’)}${pk.length > 3 ? `<span class="bu more">+${pk.length - 3}</span>` : ‘’}</div>`: ''} ${pk.some(p => p.note) ? '<div class="nd">✎</div>' : ''} ${liveHere(a) ?`<div class="here">📍 ${liveHere(a)}</div>`: ''} ${(() => { const s = S.scoreOf(a.id); return s.votes ?`<div class="score">★ ${s.avg.toFixed(1)}</div>` : ''; })()} </div>`;
}
});
if (isAdmin())
html += `<div class="addcol" style="grid-column:${stages.length + 1};grid-row:1 / 6"> <button id="addStage">+ add stage<br>or hangout</button></div>`;
g.innerHTML = html;
const as = $(‘addStage’);
if (as) as.onclick = addStage;
g.querySelectorAll(’.act’).forEach(el => el.onclick = () => openAct(el.dataset.a));
drawNow();

}

const liveHere = a => CI.active().filter(c => c.a === a.id).length;

/* An admin can add a stage the official lineup missed. It gets one all-day
block per day so people can favourite it and check in — deliberately no act
editing, because nobody wants to type a lineup. */
async function addStage() {
const name = prompt(‘Name of the stage or area’);
if (!name || !name.trim()) return;
/* No acts — inventing a lineup would be wrong. The column stays empty and
shows hourly slots people can pin (“I’ll be here then”) and check in to. */
const v = F.addVenue(fest, name.trim(), ‘stage’);
v.open = true;                       // no lineup — show pinnable hours
v.added = true;                      // and it can be removed again
try { await F.save(crew.gid, fest); }
catch (e) {
F.removeVenue(fest, v.id);            // don’t leave it on screen if it didn’t save
draw();
return C.toast(String(e.message || ‘’).includes(‘PERMISSION’)
? “Not saved — only admins can add stages, and this device may need signing in again.”
: “Couldn’t add it — “ + (e.message || ‘’));
}
draw();
}

/* only stages someone added by hand can be removed — never the real lineup */
async function removeStage(vid) {
const v = F.venue(fest, vid);
if (!v || !v.added) return;          // never the official lineup, never Armadillow
if (!confirm(`Remove ${v.name}? Anything pinned there goes with it.`)) return;
F.removeVenue(fest, vid);
try { await F.save(crew.gid, fest); } catch (e) { return C.toast(“Couldn’t remove it”); }
draw();
}

/* ––––– pinnable slots on a stage with no lineup –––––
A pin is stored like any other favourite, under a synthetic id that encodes
the venue, the day and the hour — so notes, bubbles and the crew list all
work unchanged. */
const SYN = /^s|([^|]+)|(\d+)|(\d{2}:\d{2})$/;
const synId = (v, d, hhmm) => `s|${v}|${d}|${hhmm}`;
function actInfo(id) {
const m = SYN.exec(id);
if (m) {
const v = F.venue(fest, m[1]);
const endM = C.hhmmToMin(m[3]) + 60;
return { id, syn: true, v: m[1], d: +m[2], s: m[3], e: C.minToHhmm(endM),
n: (v ? v.name : ‘Stage’) + ’ · ’ + m[3] };
}
const a = fest.acts[id];
return a ? Object.assign({ id }, a) : null;
}

/* the line showing where we are, in festival-local time */
function drawNow() {
const old = document.querySelector(’.nowline’);
if (old) old.remove();
const cur = F.currentDay(fest);
if (!cur || cur.idx !== dayIdx) return;
const el = document.createElement(‘div’);
el.className = ‘nowline’;
el.style.top = ((cur.into / SLOT) * ROW) + ‘px’;
el.innerHTML = `<span>${C.minToHhmm(fest.days[dayIdx].start * 60 + cur.into)}</span>`;
$(‘gGrid’).appendChild(el);
}

/* header follows the grid sideways; nothing is position:sticky */
/* The stage row and the time column are sticky inside the one scroller now, so
the browser keeps them in place — no JS syncing, and no fighting the gesture. */
let rz = null;
window.addEventListener(‘resize’, () => {
clearTimeout(rz);
rz = setTimeout(() => { if (fest) draw(); }, 150);
});
/* the visual viewport changes when the keyboard opens or the URL bar hides */
if (window.visualViewport)
window.visualViewport.addEventListener(‘resize’, () => {
clearTimeout(rz);
rz = setTimeout(() => { if (fest) draw(); }, 200);
});

/* ––––– one set ––––– */
let openId = null;
function openAct(id) {
const a = actInfo(id);
if (!a || !a.n) return;
openId = id;
const v = F.venue(fest, a.v);
const mine = !!myPicks[id];
const others = pickers(id).filter(p => p.uid !== uid);
$(‘actBody’).innerHTML = `<div class="phead"><b>${esc(a.n)}</b><button class="btn sm" id="acClose">✕</button></div> <p class="hint">${esc(v ? v.name : '')} · ${esc(F.dayLabel(fest.days[a.d]))} · ${esc(a.s)}–${esc(a.e)}</p> ${a.syn ? '<p class="hint" style="margin-top:8px">No lineup here — pin the hours you plan to be around.</p>' : ''} ${a.d_ ?`<p class="actdesc">${esc(a.d_)}</p>`: ''} ${a.u ?`<div class="row" style="margin-top:12px"><a class="btn wide" href="${esc(a.u)}" target="_blank" rel="noopener">Listen ↗</a></div>`: ''} ${F.currentDay(fest) ?`<button class="btn wide" id="acHere" style="margin-top:10px">📍 Check in here</button>`: ''} <button class="btn ${mine ? 'danger' : 'primary'} wide" id="acTog" style="margin-top:12px"> ${mine ? (a.syn ? 'Unpin this hour' : 'Remove from my lineup') : (a.syn ? '📌 I\'ll be here' : '★ Add to my lineup')}</button> ${mine ?`<label for="acNote">Your note (everyone sees it)</label>
<textarea id="acNote" rows="2" maxlength="200" placeholder="e.g. must see for me">${esc(pickNote(myPicks[id]))}</textarea>
<button class="btn wide" id="acNoteSave" style="margin-top:8px">Save note</button>`: ''} ${a.syn ? '' : ratingBlock(id)} ${others.length ?`<p class="hint" style="margin-top:14px">Also going:</p>`+ others.map(p =>`<div class="mrow"><span class="bu" style="background:${C.colorFor(p.name)}">${esc(C.initials(p.name))}</span>
<div class="mname">${esc(p.name)}${p.note ? ` <span class="hint">— ${esc(p.note)}</span>` : ‘’}</div></div>`).join('') : `<p class="hint" style="margin-top:14px">Nobody else has tagged this yet.</p>`} `;
$(‘actSheet’).classList.add(‘on’);
$(‘acClose’).onclick = () => $(‘actSheet’).classList.remove(‘on’);
$(‘acTog’).onclick = () => {
if (myPicks[id]) delete myPicks[id]; else myPicks[id] = 1;
saveSoon(); draw(); openAct(id);
};
const hb = $(‘acHere’);
if (hb) hb.onclick = () => {
$(‘actSheet’).classList.remove(‘on’);
CI.goFloor(a.v, id);
ciOpen = true; $(‘ciPanel’).classList.add(‘open’); drawCI();
};
if (!a.syn) wireStars(id);
const ns = $(‘acNoteSave’);
if (ns) ns.onclick = () => {
const t = $(‘acNote’).value.trim();
myPicks[id] = t ? { note: t } : 1;
saveSoon(); draw(); C.toast(‘Saved’);
};
}

/* ––––– ratings ––––– */
let myRatings = {};
function ratingBlock(id) {
if (!S.ratingOpen(id)) return ‘’;
const mineR = myRatings[id] || 0;
const agg = S.scoreOf(id);
return `<p class="hint" style="margin-top:14px">Rate this set:</p> <div class="stars" id="acStars"> ${[1,2,3,4,5].map(n => `<button class="star${n <= mineR ? ' on' : ''}" data-s="${n}">★</button>`).join('')} ${mineR ? `<button class="btn sm" id="acClear" style="margin-left:8px">clear</button>`: ''} </div> ${agg.n ?`<p class="hint">Crew average <b style="color:var(--edge)">${agg.avg.toFixed(1)}</b> from ${agg.n} — ${
S.ratersOf(id).map(r => esc(r.name) + ’ ’ + r.r + ‘★’).join(’, ‘)}</p>` : '<p class="hint">No ratings yet — be the first.</p>'}`;
}
function wireStars(id) {
const box = $(‘acStars’);
if (!box) return;
box.querySelectorAll(’.star’).forEach(b => b.onclick = () => {
myRatings[id] = +b.dataset.s; saveRatings(); draw(); openAct(id);
});
const c = $(‘acClear’);
if (c) c.onclick = () => { delete myRatings[id]; saveRatings(); draw(); openAct(id); };
}
let rTimer = null;
function saveRatings() {
if (rTimer) clearTimeout(rTimer);
rTimer = setTimeout(async () => {
rTimer = null;
try { await C.ref(‘groups/’ + crew.gid + ‘/rt/’ + uid).set(S.encRatings(myRatings)); }
catch (e) { C.toast(“Couldn’t save that rating”); }
}, 500);
}

/* ––––– leaderboard ––––– */
function showBoard() {
const list = S.ranked();
const dv = S.mostDivisive();
const medal = [‘🥇’,‘🥈’,‘🥉’];
$(‘boardBody’).innerHTML = `<div class="phead"><b>🏆 Best sets</b><button class="btn sm" id="bdClose">✕</button></div> ${list.length ? list.slice(0, 20).map((x, i) => { const v = F.venue(fest, x.v); return`<div class="lbrow"><div class="lbrank">${i < 3 ? medal[i] : i + 1}</div>
<div class="lbmain"><div class="lbname">${esc(x.n)}</div>
<div class="hint">${esc(F.dayLabel(fest.days[x.d]))} · ${esc(v ? v.name : ‘’)} · ${x.votes} vote${x.votes === 1 ? ‘’ : ‘s’}</div></div>
<div class="lbscore">${x.avg.toFixed(1)}</div></div>`; }).join('') : '<p class="hint">Nothing rated yet. Sets can be rated once they are halfway through.</p>'} ${dv ? `<div class="lbrow"><div class="lbrank">💥</div>
<div class="lbmain"><div class="lbname">${esc(dv.n)}</div>
<div class="hint">Most divisive — scores ${dv.spread} apart</div></div>
<div class="lbscore">${dv.avg.toFixed(1)}</div></div>` : ''}`;
$(‘boardSheet’).classList.add(‘on’);
$(‘bdClose’).onclick = () => $(‘boardSheet’).classList.remove(‘on’);
}

/* ––––– the wrap ––––– */
async function showWrap() {
let tallies = {};
try { tallies = (await C.ref(‘groups/’ + crew.gid + ‘/tally’).get()).val() || {}; } catch (e) {}
const D = S.wrapData(tallies);
const note = S.bestNote();
const medal = [‘🥇’,‘🥈’,‘🥉’];
const k = n => n > 999 ? (n / 1000).toFixed(1) + ‘k’ : n;
$(‘wrapBody’).innerHTML = `<div class="phead"><b>🎁 The wrap</b><button class="btn sm" id="wpClose">✕</button></div> <div style="text-align:center;padding:6px 0 2px"> <div style="font-size:19px;font-weight:700">${esc(fest.name)} ${fest.year}</div> <div class="hint">${D.rows.length} in the crew</div></div> <div class="wstats"> <div class="wstat"><b>${k(D.totals.picks)}</b><span>TAGGED</span></div> <div class="wstat"><b>${k(D.totals.rated)}</b><span>RATINGS</span></div> <div class="wstat"><b>${k(D.totals.checkins)}</b><span>CHECK-INS</span></div> <div class="wstat"><b>${k(D.totals.msgs)}</b><span>MESSAGES</span></div> </div> <p class="wsec">The awards</p> ${D.awards.map(a =>`<div class="wcard${a.hero ? ' hero' : ''}">
<div class="wico">${a.i}</div>
<div style="flex:1;min-width:0"><div class="hint">${esc(a.t)}</div>
<div class="wn">${esc(a.w.r.p.name)}</div></div>
<div class="wv">${esc(String(a.f(a.w.v)))}</div></div>`).join('')} ${D.top.length ? `<p class="wsec">Sets of the weekend</p>`+ D.top.map((x, i) =>`<div class="lbrow"><div class="lbrank">${medal[i]}</div>
<div class="lbmain"><div class="lbname">${esc(x.n)}</div>
<div class="hint">${esc(F.dayLabel(fest.days[x.d]))} · ${x.votes} votes</div></div>
<div class="lbscore">${x.avg.toFixed(1)}</div></div>`).join('') : ''} ${note ? `<p class="wsec">Best tip</p><div class="wquote">${esc(note.text)}
<div class="hint" style="margin-top:6px">${esc(note.who)}, on ${esc(note.act.n)}</div></div>` : ''} <button class="btn primary wide" id="wpCopy" style="margin-top:18px">Copy as text</button>`;
$(‘wrapSheet’).classList.add(‘on’);
$(‘wpClose’).onclick = () => $(‘wrapSheet’).classList.remove(‘on’);
$(‘wpCopy’).onclick = async () => {
const L = [`${fest.name} ${fest.year} — THE WRAP`, ‘’,
`${D.totals.picks} tagged · ${D.totals.rated} ratings · ${D.totals.checkins} check-ins · ${D.totals.msgs} messages`, ‘’, ‘AWARDS’];
D.awards.forEach(a => L.push(`${a.i} ${a.t.split(' — ')[0]}: ${a.w.r.p.name} (${a.f(a.w.v)})`));
if (D.top.length) { L.push(’’, ‘BEST SETS’); D.top.forEach((x, i) => L.push(`${medal[i]} ${x.n} — ${x.avg.toFixed(1)}`)); }
if (note) L.push(’’, `BEST TIP — ${note.who} on ${note.act.n}:`, `"${note.text}"`);
try { await navigator.clipboard.writeText(L.join(’\n’)); C.toast(‘Copied’); } catch (e) {}
};
}

/* ––––– the site map –––––
The festival’s own plattegrond with a translucent tap target over each stage:
visibly pressable, but you can still read the map underneath. */
function showMap() {
const m = fest.map || {};
const pinned = F.stages(fest).filter(v => v.x != null && v.y != null);
$(‘mapBody’).innerHTML = `<div class="phead"><b>🗺 The site</b><button class="btn sm" id="mpClose">✕</button></div> ${m.img ?`<div class="mapwrap"><img class="mapimg" src="${esc(m.img)}" alt="Festival map">
${pinned.map(v => {
const n = CI.active().filter(c => c.v === v.id).length;
const live = F.nowOn(fest, v.id);
/* Most maps already print the stage name, so the pin stays out of the
way. Anything the map doesn’t name — the boats share one pier icon —
carries its own label. */
const named = !!v.label;
/* Size the tap target to the name printed on the map, so it looks
deliberate and lands identically on a phone and a laptop — a fixed
pixel size drifted as the image scaled. */
const box = (v.w && v.h)
? `width:${v.w}%;height:${v.h}%;`
: ‘min-width:12%;min-height:5%;’;
return `<button class="mappin${named ? '' : ' bare'}${n ? ' busy' : ''}" data-v="${v.id}" style="left:${v.x}%;top:${v.y}%;${box}" title="${esc(v.name)}"> ${named ? `<span class="mpn">${esc(v.name)}</span>`: ''} ${n ?`<span class="mpc">${n}</span>`: ''} ${live ?`<span class="mpl">${esc(live.n.length > 18 ? live.n.slice(0, 17) + ‘…’ : live.n)}</span>` : ''} </button>`;
}).join(’’)}</div>
<p class="hint" style="margin-top:10px">Tap a stage to see who’s there and check in.</p>` : '<p class="hint">No map for this festival yet.</p>'}`;
$(‘mapSheet’).classList.add(‘on’);
$(‘mpClose’).onclick = () => closeSheet(‘mapSheet’);
$(‘mapBody’).querySelectorAll(’[data-v]’).forEach(b => b.onclick = () => {
const vid = b.dataset.v, live = F.nowOn(fest, vid);
closeSheet(‘mapSheet’);
CI.goFloor(vid, live ? live.id : null);
ciOpen = true; $(‘ciPanel’).classList.add(‘open’); drawCI();
});
}
$(‘mapFab’).onclick = showMap;

/* ––––– menu ––––– */
const closeSheet = id => $(id).classList.remove(‘on’);
[‘menuSheet’,‘crewSheet’,‘trSheet’,‘boardSheet’,‘wrapSheet’,‘actSheet’,‘mineSheet’,‘profSheet’,‘mapSheet’,‘personSheet’,‘inviteSheet’]
.forEach(id => $(id).onclick = e => { if (e.target.id === id) closeSheet(id); });

$(‘menuBtn’).onclick = () => {
const others = C.allGroups().filter(g => g.gid !== crew.gid);
$(‘menuBody’).innerHTML = `<div class="phead"><b>Menu</b><button class="btn sm" id="mxClose">✕</button></div> <div class="menugrid"> <button class="btn" id="mProfile">🙂 My profile</button> <button class="btn" id="mMine">★ My lineup</button> ${F.hasStarted(fest) ? '<button class="btn" id="mBoard">🏆 Best sets</button>' : ''} ${F.isOver(fest) ? '<button class="btn" id="mWrap">🎁 The wrap</button>' : ''} <button class="btn" id="mFeedback">💡 Feedback</button> </div> ${others.length ?`<div class="tgroup">Switch crew</div>`+ others.map(g =>`<button class="btn wide" style="margin-bottom:6px" data-sw="${esc(g.gid)}">${esc(g.name)}</button>`).join('') : ''} <div class="tgroup">This crew</div> <button class="btn wide" id="mNew" style="margin-bottom:6px">Join or create another crew</button> <button class="btn danger wide" id="mLeave">Leave ${esc((meta && meta.name) || 'this crew')}</button>`;
$(‘menuSheet’).classList.add(‘on’);
$(‘mxClose’).onclick = () => closeSheet(‘menuSheet’);
$(‘mProfile’).onclick = () => { closeSheet(‘menuSheet’); showProfile(); };
$(‘mMine’).onclick = () => { closeSheet(‘menuSheet’); showMine(); };
$(‘mFeedback’).onclick = () => { closeSheet(‘menuSheet’); showFeedback(); };
const bb = $(‘mBoard’); if (bb) bb.onclick = () => { closeSheet(‘menuSheet’); showBoard(); };
const wb = $(‘mWrap’); if (wb) wb.onclick = () => { closeSheet(‘menuSheet’); showWrap(); };
$(‘mNew’).onclick = () => { location.href = ‘index.html?add=1’; };
$(‘mLeave’).onclick = async () => {
if (!confirm(`Leave ${(meta && meta.name) || 'this crew'}? You'll need the invite and passcode to come back.`)) return;
try { await C.ref(‘groups/’ + crew.gid + ‘/members/’ + uid).remove(); } catch (e) {}
C.forgetGroup(crew.gid);
location.href = ‘index.html’;
};
$(‘menuBody’).querySelectorAll(’[data-sw]’).forEach(b => b.onclick = () => {
const g = C.allGroups().find(x => x.gid === b.dataset.sw);
if (g) { C.setCurrentGroup(g); location.reload(); }
});
};

/* ––––– the crew ––––– */
$(‘crewBtn’).onclick = () => showCrew();
$(‘trBtn’).onclick = () => showTransport();
$(‘invBtn’).onclick = () => showInvite();
let crewCode = null;
let codeErr = ‘’;
async function loadCode() {
if (crewCode !== null) return crewCode;
try { crewCode = (await C.ref(‘groups/’ + crew.gid + ‘/code’).get()).val() || ‘’; codeErr = ‘’; }
catch (e) { crewCode = ‘’; codeErr = String(e && e.message || ‘’); }
return crewCode;
}

/* Changing it writes a new hash and drops the old one, so a leaked invite stops
working. */
async function changeCode() {
const nu = (prompt(‘New passcode — four numbers’) || ‘’).trim().replace(/\D/g, ‘’);
if (!nu) return;
if (!/^\d{4}$/.test(nu)) return C.toast(‘Four numbers, e.g. 4821’);
try {
const token = await C.joinToken(crew.gid, nu);
await C.ref(‘groups/’ + crew.gid + ‘/join’).set({ [token]: true });
await C.ref(‘groups/’ + crew.gid + ‘/code’).set(nu);
crewCode = nu;
crew.token = token; C.setCurrentGroup(crew);
C.toast(‘Passcode changed’);
showCrew();
} catch (e) { C.toast(“Couldn’t change it - “ + (e.message || ‘’)); }
}

/* ––––– who is in the crew ––––– */
function showCrew() {
const order = Object.keys(members).sort((x, y) =>
x === uid ? -1 : y === uid ? 1 : String(members[x].name || ‘’).localeCompare(String(members[y].name || ‘’)));
$(‘crewBody’).innerHTML = `<div class="phead"><b>👥 ${esc((meta && meta.name) || 'The crew')}</b> <span class="hint">${order.length} of 50${cfg.lock ? ' · 🔒 locked' : ''}</span> <button class="btn sm" id="cwClose" style="margin-left:auto">✕</button></div> ${isAdmin() && Object.keys(pending).length ?`<div class="pendbox">
<div class="psec" style="margin-top:0">Asking to join</div>
${Object.entries(pending).map(([k, p]) => `<div class="mrow"> ${p.photo ? `<img class="av" src="${p.photo}" alt="" style="width:32px;height:32px">`:`<span class="av fb" style="width:32px;height:32px;background:${C.colorFor(p.n || '?')}">${esc(C.initials(p.n || ‘?’))}</span>`} <div class="mname">${esc(p.n || '?')}</div> <button class="mini" data-admit="${k}">Let in</button> <button class="mini danger" data-deny="${k}">No</button> </div>`).join(’’)}</div>`: ''} <p class="hint">Tap someone to see where they are, how they're travelling and what they've tagged.</p> <div class="mlist" style="margin-top:8px">${order.map(u =>`
<div class="mrow" data-who="${u}" style="cursor:pointer">${avatarFor(u)}
<div class="mname">${esc(members[u].name || ‘?’)}
${u === uid ? ‘<span class="tag">you</span>’ : ‘’}${admins[u] ? ‘<span class="tag adm">admin</span>’ : ‘’}
</div>
${isAdmin() && u !== uid ? `<button class="mini" data-adm="${u}">${admins[u] ? 'Unadmin' : 'Make admin'}</button> <button class="mini danger" data-kick="${u}">Remove</button>` : ‘’}
<span style="color:var(--edge)">›</span>
</div>`).join('')}</div> ${order.length >= 50 ? '<p class="hint" style="margin-top:12px;color:var(--danger)">This crew is full. Start a second one and use the same festival — everyone still gets the same timetable.</p>' : ''} <button class="btn wide" id="cwToShare" style="margin-top:14px">✉ Invite someone</button>`;
$(‘crewSheet’).classList.add(‘on’);
$(‘cwClose’).onclick = () => closeSheet(‘crewSheet’);
$(‘cwToShare’).onclick = () => { closeSheet(‘crewSheet’); showInvite(); };
$(‘crewBody’).querySelectorAll(’[data-admit]’).forEach(b => b.onclick = async () => {
const k = b.dataset.admit, p = pending[k] || {};
b.disabled = true;
try {
await C.ref(‘groups/’ + crew.gid + ‘/members/’ + k).set({ name: p.n || ‘?’, joined: Date.now() });
if (p.photo) await C.ref(‘groups/’ + crew.gid + ‘/photos/’ + k).set(p.photo);
await C.ref(‘groups/’ + crew.gid + ‘/pending/’ + k).remove();
C.toast((p.n || ‘They’) + ’ are in’);
} catch (e) { b.disabled = false; C.toast(“Couldn’t let them in”); }
});
$(‘crewBody’).querySelectorAll(’[data-deny]’).forEach(b => b.onclick = async () => {
if (!confirm(‘Turn down this request?’)) return;
try { await C.ref(‘groups/’ + crew.gid + ‘/pending/’ + b.dataset.deny).remove(); } catch (e) {}
});
$(‘crewBody’).querySelectorAll(’[data-who]’).forEach(row => row.onclick = e => {
if (e.target.closest(‘button’)) return;
showPerson(row.dataset.who);
});
$(‘crewBody’).querySelectorAll(’[data-adm]’).forEach(b => b.onclick = async () => {
const u = b.dataset.adm;
try {
if (admins[u]) {
if (Object.keys(admins).length < 2) return C.toast(‘A crew needs one admin’);
await C.ref(‘groups/’ + crew.gid + ‘/admins/’ + u).remove();
} else await C.ref(‘groups/’ + crew.gid + ‘/admins/’ + u).set(true);
setTimeout(showCrew, 150);
} catch (e) { C.toast(“Couldn’t change that”); }
});
$(‘crewBody’).querySelectorAll(’[data-kick]’).forEach(b => b.onclick = async () => {
const u = b.dataset.kick;
if (!confirm(`Remove ${members[u].name}?`)) return;
try {
await C.ref(‘groups/’ + crew.gid + ‘/members/’ + u).remove();
await C.ref(‘groups/’ + crew.gid + ‘/admins/’ + u).remove().catch(() => {});
} catch (e) {}
setTimeout(showCrew, 150);
});
}

/* ––––– inviting people –––––
The link is the invitation. A locked crew adds a gate: an admin lets people
in, or hands out the passcode to skip the queue. */
function showInvite() {
const link = location.origin + location.pathname.replace(/[^/]*$/, ‘’) + ‘index.html?g=’ + crew.gid;
$(‘invBody’).innerHTML = `
<div class="phead"><b>✉ Invite someone</b><button class="btn sm" id="ivClose">✕</button></div>
<p class="hint">${cfg.lock
? ‘This crew is locked — whoever you send it to waits for an admin to let them in.’
: ‘Anyone with this link can join. No passcode needed.’}</p>

```
<label style="margin-top:14px">Scan this</label>
<div class="qrbox" style="margin:6px auto 0">${qrSvg(link, 200)}</div>

<label for="ivLink">Or send the link</label>
<input type="text" id="ivLink" readonly value="${esc(link)}">
<div class="row" style="margin-top:10px">
  <button class="btn" id="ivCopy">Copy link</button>
  <button class="btn primary" id="ivShare">Share</button>
</div>

${isAdmin() ? `
  <div class="psec">Admin only</div>
  <div class="row">
    <button class="btn sm" id="ivLock">${cfg.lock ? '🔓 Unlock' : '🔒 Lock crew'}</button>
    <button class="btn sm" id="ivSetCode">New passcode</button>
  </div>
  <p class="hint" style="margin-top:8px">${cfg.lock
    ? 'Give someone this passcode and they skip the queue.'
    : 'Lock the crew and new joiners wait for you — or use the passcode to skip that.'}</p>
  <div class="codebox" style="margin-top:8px"><span id="ivCode">…</span>
    <button class="btn sm" id="ivCodeCopy">Copy</button></div>` : ''}`;
```

$(‘inviteSheet’).classList.add(‘on’);
$(‘ivClose’).onclick = () => closeSheet(‘inviteSheet’);
$(‘ivCopy’).onclick = async () => {
try { await navigator.clipboard.writeText(link); C.toast(‘Link copied’); } catch (e) { $(‘ivLink’).select(); }
};
$(‘ivShare’).onclick = async () => {
const t = `Join ${(meta && meta.name) || 'my crew'} on MoshPin\n${link}`;
if (navigator.share) { try { await navigator.share({ text: t }); } catch (e) {} }
else { try { await navigator.clipboard.writeText(t); C.toast(‘Copied’); } catch (e) {} }
};

if (!isAdmin()) return;
loadCode().then(code => { $(‘ivCode’).textContent = code || ‘none set’; });
$(‘ivCodeCopy’).onclick = async () => {
try { await navigator.clipboard.writeText($(‘ivCode’).textContent); C.toast(‘Passcode copied’); } catch (e) {}
};
$(‘ivSetCode’).onclick = changeCode;
$(‘ivLock’).onclick = async () => {
const on = !cfg.lock;
if (on && !confirm(‘Lock the crew?\n\nNew joiners will wait for an admin to let them in. ’
+ ‘The passcode is replaced, so any code already passed around stops working.’)) return;
try {
if (on) {
const nu = String(Math.floor(Math.random() * 9000) + 1000);
const token = await C.joinToken(crew.gid, nu);
await C.ref(‘groups/’ + crew.gid + ‘/join’).set({ [token]: true });
await C.ref(‘groups/’ + crew.gid + ‘/code’).set(nu);
crewCode = nu; crew.token = token; C.setCurrentGroup(crew);
await C.ref(‘groups/’ + crew.gid + ‘/uidmap/’ + C.myUid()).set({ k: uid, t: token });
}
await C.ref(‘groups/’ + crew.gid + ‘/config/lock’).set(on ? true : null);
cfg.lock = on;
C.toast(on ? ‘Locked — you let people in from the crew list’ : ‘Unlocked — the link is enough again’);
showInvite();
} catch (e) { C.toast(“Couldn’t change that — “ + (e.message || ‘’)); }
};
}

/* Faces, wherever a member is shown. Falls back to initials on a colour
derived from the name, so it is stable and never blank. */
function avatarFor(u, size) {
const s = size || 32, nm = (members[u] || {}).name || ‘?’;
return photos[u]
? `<img class="av" src="${photos[u]}" alt="" style="width:${s}px;height:${s}px">`
: `<span class="av fb" style="width:${s}px;height:${s}px;background:${C.colorFor(nm)};font-size:${Math.round(s / 2.6)}px">${esc(C.initials(nm))}</span>`;
}

/* ––––– one person –––––
Everything here is already synced for the timetable, so opening someone’s
page costs nothing extra. */
function showPerson(who) {
const m = members[who] || {};
const picks = picksFor(who);
const rts = S.decRatings(ratesOf[who]);
const list = Object.keys(picks).map(actInfo).filter(a => a && a.n)
.sort((x, y) => x.d - y.d || F.offset(fest, x) - F.offset(fest, y));
const rated = Object.entries(rts).map(([id, r]) => ({ a: actInfo(id), r }))
.filter(x => x.a && x.a.n).sort((x, y) => y.r - x.r);
const ride = T.forUser(who);
const pin = CI.active().find(c => c.uid === who);
const md = ride ? (T.MODES[ride.mode] || T.MODES.other) : null;

$(‘personBody’).innerHTML = `
<div class="phead"><b>${esc(m.name || ‘?’)}</b><button class="btn sm" id="pnClose">✕</button></div>
<div class="pdet">${avatarFor(who, 56)}
<div><div class="who">${esc(m.name || ‘?’)}</div>
<div class="hint">${admins[who] ? ’admin · ’ : ‘’}${list.length} tagged · ${rated.length} rated</div></div></div>

```
${pin ? `<div class="psec">Right now</div>
  <div class="pitem"><div class="t">📍 ${esc(pin.l || CI.zoneLabel(pin.z, F.venue(fest, pin.v)))}
    <div class="m">${esc((F.venue(fest, pin.v) || {}).name || '')} · ${esc(CI.ago(pin.ts))}</div></div></div>` : ''}

${ride ? `<div class="psec">Transport</div>
  <div class="pitem"><div class="t">${md.i} ${esc(md.label)}
    <div class="m">arrives ${esc(ride.inAt || '—')} · leaves ${esc(ride.outAt || '—')}${
      (ride.seatsIn || ride.seatsOut) ? ` · ${ride.seatsIn || 0} seats there, ${ride.seatsOut || 0} back` : ''}</div>
    ${ride.note ? `<div class="m" style="color:var(--edge)">${esc(ride.note)}</div>` : ''}</div></div>` : ''}

${rated.length ? `<div class="psec">What they rated</div>` + rated.slice(0, 12).map(x =>
  `<div class="pitem"><div class="t">${esc(x.a.n)}
    <div class="m">${esc(F.dayLabel(fest.days[x.a.d]))} · ${esc((F.venue(fest, x.a.v) || {}).name || '')}</div></div>
   <div class="r">${x.r}★</div></div>`).join('') : ''}

${list.length ? `<div class="psec">Their lineup</div>` + list.map(a =>
  `<div class="pitem"><div class="t">${esc(a.n)}
    <div class="m">${esc(F.dayLabel(fest.days[a.d]))} · ${esc((F.venue(fest, a.v) || {}).name || '')} · ${esc(a.s)}–${esc(a.e)}</div></div>
   ${myPicks[a.id] ? '<div class="r">you too</div>' : ''}</div>`).join('')
  : '<p class="hint" style="margin-top:14px">Nothing tagged yet.</p>'}`;
```

$(‘personSheet’).classList.add(‘on’);
$(‘pnClose’).onclick = () => closeSheet(‘personSheet’);
}

/* ––––– profile ––––– */
let pendingPhoto = null;
function showProfile() {
$(‘profBody’).innerHTML = ` <div class="phead"><b>My profile</b><button class="btn sm" id="pfClose">✕</button></div> <div style="text-align:center;margin:8px 0" id="pfPrev">${avatarFor(uid, 76)}</div> <label for="pfFile">Photo</label><input type="file" id="pfFile" accept="image/*"> <label for="pfName">Name</label> <input type="text" id="pfName" maxlength="24" value="${esc((members[uid] || {}).name || '')}"> <button class="btn primary wide" id="pfSave" style="margin-top:14px">Save</button>`;
$(‘profSheet’).classList.add(‘on’);
$(‘pfClose’).onclick = () => closeSheet(‘profSheet’);
$(‘pfFile’).onchange = e => {
const f = e.target.files && e.target.files[0]; e.target.value = ‘’;
if (!f) return;
shrink(f, 150, 0.68, 12 * 1024).then(dd => {
if (!dd) return C.toast(“Couldn’t read that image”);
pendingPhoto = dd;
$(‘pfPrev’).innerHTML = `<img class="av" src="${dd}" alt="" style="width:76px;height:76px">`;
});
};
$(‘pfSave’).onclick = async () => {
const nm = $(‘pfName’).value.trim();
if (!nm) return C.toast(‘Enter a name’);
try {
await C.ref(‘groups/’ + crew.gid + ‘/members/’ + uid).update({ name: nm, t: crew.token });
if (pendingPhoto) {
await C.ref(‘groups/’ + crew.gid + ‘/photos/’ + uid).set(pendingPhoto);
photos[uid] = pendingPhoto;
delete fetching[uid];
try { localStorage.setItem(‘mp_photos_’ + crew.gid, JSON.stringify(photos)); } catch (e) {}
pendingPhoto = null;
}
C.setMyProfile({ name: nm, photo: null });
closeSheet(‘profSheet’); draw(); C.toast(‘Saved’);
} catch (e) { C.toast(“Couldn’t save — “ + (e.message || ‘’)); }
};
}
function shrink(file, px, q, cap) {
return new Promise(res => {
const img = new Image();
img.onload = () => {
const s = Math.min(img.width, img.height);
const c = document.createElement(‘canvas’);
let out = null;
try {
for (const [w, qq] of [[px, q], [px, q - 0.12], [Math.round(px * 0.8), q - 0.08],
[Math.round(px * 0.66), q - 0.1], [Math.round(px * 0.5), 0.55]]) {
c.width = c.height = w;
c.getContext(‘2d’).drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, w, w);
out = c.toDataURL(‘image/jpeg’, Math.max(0.4, qq));
if (!cap || out.length <= cap) break;
}
} catch (e) { out = null; }
URL.revokeObjectURL(img.src);
res(out);
};
img.onerror = () => res(null);
img.src = URL.createObjectURL(file);
});
}

/* ––––– feedback –––––
One global node, so it is a single place to look rather than one per crew. */
function showFeedback() {
$(‘profBody’).innerHTML = ` <div class="phead"><b>💡 Feedback</b><button class="btn sm" id="fbX">✕</button></div> <p class="hint">Found a bug, or want something added? This goes straight to us.</p> <textarea id="fbText" rows="5" maxlength="1000" placeholder="What's on your mind?" style="margin-top:12px"></textarea> <button class="btn primary wide" id="fbSend" style="margin-top:12px">Send</button>`;
$(‘profSheet’).classList.add(‘on’);
$(‘fbX’).onclick = () => closeSheet(‘profSheet’);
$(‘fbSend’).onclick = async () => {
const t = $(‘fbText’).value.trim();
if (!t) return C.toast(‘Write something first’);
$(‘fbSend’).disabled = true;
try {
/* Everything lands under stats so there is one node to check, and the
entry key sorts by date — newest at the bottom of the list. */
const when = new Date();
const key = when.toISOString().slice(0, 19).replace(/[:T]/g, ‘-’)
+ ‘_’ + ((members[uid] || {}).name || ‘someone’).replace(/[^A-Za-z0-9]/g, ‘’).slice(0, 12);
await C.ref(‘stats/feedback/’ + key).set({
text: t.slice(0, 1000),
from: (members[uid] || {}).name || ‘?’,
crew: (meta && meta.name) || ‘’,
festival: fest ? `${fest.name} ${fest.year}` : ‘’,
when: when.toISOString().slice(0, 16).replace(‘T’, ’ ‘),
ts: when.getTime(),
device: navigator.userAgent.slice(0, 120)
});
C.ref(‘stats/counts/feedback’).transaction(n => (n || 0) + 1);
closeSheet(‘profSheet’);
C.toast(‘Thanks — that reached us’);
} catch (e) { $(‘fbSend’).disabled = false; C.toast(“Couldn’t send it”); }
};
}

/* ––––– transport ––––– */
function showTransport() {
T.render($(‘trBody’), isAdmin());
$(‘trSheet’).classList.add(‘on’);
$(‘trX’).onclick = () => closeSheet(‘trSheet’);
$(‘trMine’).onclick = () => openTravel(uid);
$(‘trBody’).querySelectorAll(’[data-ed]’).forEach(b => b.onclick = () => openTravel(b.dataset.ed));
}
function openTravel(forUid) {
T.renderForm($(‘trBody’), forUid, () => showTransport());
$(‘trX’).onclick = () => closeSheet(‘trSheet’);
}

/* ––––– my lineup ––––– */
function showMine() {
const list = Object.keys(myPicks)
.map(actInfo)
.filter(a => a && a.n)
.sort((x, y) => x.d - y.d || F.offset(fest, x) - F.offset(fest, y));
$(‘mineBody’).innerHTML = `<div class="phead"><b>My lineup</b><button class="btn sm" id="mnClose">✕</button></div> ${list.length ? list.map(a => { const v = F.venue(fest, a.v); return`<div class="mrow"><div class="mname">${esc(a.n)}
<div class="hint">${esc(F.dayLabel(fest.days[a.d]))} · ${esc(v ? v.name : ‘’)} · ${esc(a.s)}–${esc(a.e)}</div></div></div>`; }).join('') : '<p class="hint">Nothing tagged yet. Tap any set on the timetable.</p>'}`;
$(‘mineSheet’).classList.add(‘on’);
$(‘mnClose’).onclick = () => closeSheet(‘mineSheet’);
}