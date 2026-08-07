/* MoshPin — the crew page.
   Phase 2: who's in, your profile, admin tools, invite, feedback.
   The festival timetable arrives in Phase 3. */
import * as C from './core.js';
import { svg as qrSvg } from './qr.js';
import * as F from './festival.js';

const $ = id => document.getElementById(id);
const esc = C.esc;

let crew = null;          // {gid,name,token}
let meta = null;          // crew metadata from the database
let members = {};         // uid -> {name,...}
let admins = {};          // uid -> true
let photos = {};          // uid -> data url
let me = null;            // {name,photo}
let uid = null;

const isAdmin = () => !!admins[uid];
const memberCount = () => Object.keys(members).length;

/* ---------- boot ---------- */
function bootFail(msg, detail) {
  $('app').innerHTML = `<div class="card"><h2>Something went wrong</h2>
    <p class="hint" style="margin-top:8px">${esc(msg)}</p>
    ${detail ? `<p class="hint" style="opacity:.7;margin-top:6px">${esc(detail)}</p>` : ''}
    <div style="margin-top:16px"><a class="btn wide" href="index.html">Back to the start</a></div></div>`;
}
window.addEventListener('error', ev => {
  if (!$('app').innerHTML.includes('Something went wrong')) bootFail('A script failed to load.', ev.message);
});

(async function () {
  crew = C.currentGroup();
  if (!crew) { location.href = 'index.html'; return; }
  me = C.myProfile() || { name: 'Someone', photo: null };

  if (typeof firebase === 'undefined') return bootFail('Could not load Firebase.');
  try { C.init(); uid = await C.signIn(); }
  catch (e) { return bootFail("Couldn't sign in.", e && (e.code || e.message)); }

  /* cached photos first so faces appear instantly and cost nothing */
  try { photos = JSON.parse(localStorage.getItem('mp_photos_' + crew.gid) || '{}'); } catch (e) {}

  try {
    const m = await C.ref('groups/' + crew.gid + '/meta').get();
    meta = m.val();
    if (!meta) return bootFail('That crew no longer exists.', 'It may have been deleted by its admin.');
  } catch (e) { return bootFail("Couldn't load the crew.", e && e.message); }

  document.title = `${meta.name} — MoshPin`;
  $('festName').textContent = `${meta.festName} ${meta.year}`;
  $('crewName').textContent = meta.name;

  /* per-child listeners: a change sends one record, not the whole crew */
  const mref = C.ref('groups/' + crew.gid + '/members');
  mref.on('child_added',   s => { members[s.key] = s.val(); paint(); fetchPhotos(); });
  mref.on('child_changed', s => { members[s.key] = s.val(); paint(); });
  mref.on('child_removed', s => { delete members[s.key]; paint(); checkStillIn(); });

  const aref = C.ref('groups/' + crew.gid + '/admins');
  aref.on('child_added',   s => { admins[s.key] = true; paint(); });
  aref.on('child_removed', s => { delete admins[s.key]; paint(); });

  $('app').hidden = false;
  describeFestival();
})();

/* a one-line summary of the timetable, and the way in for admins */
async function describeFestival() {
  let fest = null;
  try { fest = await F.load(crew.gid); } catch (e) {}
  const el = $('festState');
  if (!fest || (!fest.days.length && !fest.venues.length)) {
    el.textContent = isAdmin()
      ? 'Nothing set up yet. Add the days, stages and sets — or start from another crew\u2019s version if someone has already done this festival.'
      : 'No timetable yet. An admin needs to set it up.';
  } else {
    const st = F.stages(fest).length, sp = F.spots(fest).length;
    el.textContent = `${fest.days.length} day(s) · ${st} stage(s)`
      + (sp ? ` · ${sp} spot(s)` : '') + ` · ${Object.keys(fest.acts).length} set(s)`;
  }
  $('gridLink').hidden = !(fest && fest.days.length && F.stages(fest).length);
  $('setupLink').hidden = !isAdmin();
  $('setupLink').textContent = (fest && fest.days.length) ? 'Edit the festival' : 'Set up the festival';
}

/* removed by an admin while we were looking at it */
function checkStillIn() {
  if (uid && Object.keys(members).length && !members[uid]) {
    C.setCurrentGroup(null);
    bootFail('You were removed from this crew.', 'Ask an admin for a new invite.');
  }
}

/* ---------- photos: fetched once each, then cached forever ---------- */
let fetching = {};
function savePhotos() {
  try { localStorage.setItem('mp_photos_' + crew.gid, JSON.stringify(photos)); } catch (e) {}
}
function fetchPhotos() {
  for (const u of Object.keys(members)) {
    if (photos[u] !== undefined || fetching[u]) continue;
    fetching[u] = 1;
    C.ref('groups/' + crew.gid + '/photos/' + u).get()
      .then(s => { photos[u] = s.val() || null; savePhotos(); paint(); })
      .catch(() => {});
  }
}

/* ---------- rendering ---------- */
function avatar(u, size) {
  const nm = (members[u] && members[u].name) || '?';
  const p = photos[u];
  const s = size || 34;
  return p
    ? `<img class="av" src="${p}" alt="" style="width:${s}px;height:${s}px">`
    : `<span class="av fb" style="width:${s}px;height:${s}px;background:${C.colorFor(nm)};font-size:${Math.round(s/2.6)}px">${esc(C.initials(nm))}</span>`;
}

function paint() {
  $('crewCount').textContent = memberCount() + (memberCount() === 1 ? ' person' : ' people');
  $('adminBtn').hidden = !isAdmin();

  const order = Object.keys(members).sort((a, b) => {
    if (a === uid) return -1;
    if (b === uid) return 1;
    return String(members[a].name || '').localeCompare(String(members[b].name || ''));
  });
  $('memberList').innerHTML = order.map(u => `
    <div class="mrow">
      ${avatar(u)}
      <div class="mname">${esc(members[u].name || '?')}
        ${u === uid ? '<span class="tag">you</span>' : ''}
        ${admins[u] ? '<span class="tag adm">admin</span>' : ''}
      </div>
    </div>`).join('');

  $('meAvatar').innerHTML = avatar(uid, 64);
  $('meName').textContent = (members[uid] && members[uid].name) || me.name;
}

/* ---------- profile ---------- */
$('editProfile').onclick = () => {
  $('pName').value = (members[uid] && members[uid].name) || me.name || '';
  $('pPrev').innerHTML = avatar(uid, 76);
  $('profileSheet').classList.add('on');
};
$('pClose').onclick = () => $('profileSheet').classList.remove('on');

let pendingPhoto = null;
$('pFile').onchange = e => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f) return;
  shrink(f, 96, 0.7).then(d => {
    if (!d) return C.toast("Couldn't read that image");
    pendingPhoto = d;
    $('pPrev').innerHTML = `<img class="av" src="${d}" alt="" style="width:76px;height:76px">`;
  });
};
function shrink(file, px, q) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(img.width, img.height);
      const c = document.createElement('canvas');
      c.width = c.height = px;
      try {
        c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, px, px);
        res(c.toDataURL('image/jpeg', q));
      } catch (e) { res(null); }
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => res(null);
    img.src = URL.createObjectURL(file);
  });
}
$('pSave').onclick = async () => {
  const nm = $('pName').value.trim();
  if (!nm) return C.toast('Enter a name');
  try {
    await C.ref('groups/' + crew.gid + '/members/' + uid)
      .update({ name: nm, t: crew.token });
    if (pendingPhoto) {
      await C.ref('groups/' + crew.gid + '/photos/' + uid).set(pendingPhoto);
      photos[uid] = pendingPhoto; savePhotos(); pendingPhoto = null;
    }
    me.name = nm; C.setMyProfile(me);
    $('profileSheet').classList.remove('on');
    paint();
    C.toast('Saved');
  } catch (e) { C.toast("Couldn't save — " + (e.message || 'try again')); }
};

/* ---------- invite ---------- */
$('inviteBtn').onclick = () => {
  const link = location.origin + location.pathname.replace(/[^/]*$/, '') + '?g=' + crew.gid;
  $('invLink').value = link;
  $('invQr').innerHTML = qrSvg(link, 190);
  $('inviteSheet').classList.add('on');
};
$('iClose').onclick = () => $('inviteSheet').classList.remove('on');
$('iCopy').onclick = async () => {
  try { await navigator.clipboard.writeText($('invLink').value); C.toast('Link copied'); }
  catch (e) { $('invLink').select(); }
};
$('iShare').onclick = async () => {
  const t = `Join ${meta.name} on MoshPin\n${$('invLink').value}`;
  if (navigator.share) { try { await navigator.share({ text: t }); } catch (e) {} }
  else { try { await navigator.clipboard.writeText(t); C.toast('Copied'); } catch (e) {} }
};

/* ---------- admin ---------- */
$('adminBtn').onclick = () => { renderAdmin(); $('adminSheet').classList.add('on'); };
$('aClose').onclick = () => $('adminSheet').classList.remove('on');

function renderAdmin() {
  const order = Object.keys(members).sort((a, b) =>
    String(members[a].name || '').localeCompare(String(members[b].name || '')));
  $('adminList').innerHTML = order.map(u => `
    <div class="mrow">
      ${avatar(u, 30)}
      <div class="mname">${esc(members[u].name || '?')}${admins[u] ? '<span class="tag adm">admin</span>' : ''}</div>
      ${u === uid ? '' : `
        <button class="mini" data-adm="${u}">${admins[u] ? 'Remove admin' : 'Make admin'}</button>
        <button class="mini danger" data-kick="${u}">Remove</button>`}
    </div>`).join('');

  $('adminList').querySelectorAll('[data-adm]').forEach(b => b.onclick = async () => {
    const u = b.dataset.adm;
    try {
      if (admins[u]) {
        if (Object.keys(admins).length < 2) return C.toast('A crew needs at least one admin');
        await C.ref('groups/' + crew.gid + '/admins/' + u).remove();
      } else {
        await C.ref('groups/' + crew.gid + '/admins/' + u).set(true);
      }
      renderAdmin();
    } catch (e) { C.toast("Couldn't change that — " + (e.message || '')); }
  });
  $('adminList').querySelectorAll('[data-kick]').forEach(b => b.onclick = async () => {
    const u = b.dataset.kick;
    if (!confirm(`Remove ${members[u].name} from ${meta.name}?`)) return;
    try {
      await C.ref('groups/' + crew.gid + '/members/' + u).remove();
      await C.ref('groups/' + crew.gid + '/admins/' + u).remove().catch(() => {});
      await C.ref('groups/' + crew.gid + '/photos/' + u).remove().catch(() => {});
      renderAdmin();
    } catch (e) { C.toast("Couldn't remove them — " + (e.message || '')); }
  });
}
$('aRename').onclick = async () => {
  const nm = prompt('New crew name', meta.name);
  if (!nm || !nm.trim()) return;
  try {
    await C.ref('groups/' + crew.gid + '/meta/name').set(nm.trim());
    meta.name = nm.trim();
    crew.name = nm.trim(); C.setCurrentGroup(crew);
    $('crewName').textContent = meta.name;
    C.toast('Renamed');
  } catch (e) { C.toast("Couldn't rename — " + (e.message || '')); }
};

/* ---------- feedback ---------- */
$('feedbackBtn').onclick = () => $('fbSheet').classList.add('on');
$('fClose').onclick = () => $('fbSheet').classList.remove('on');
$('fSend').onclick = async () => {
  const t = $('fText').value.trim();
  if (!t) return C.toast('Write something first');
  try {
    await C.ref('groups/' + crew.gid + '/feedback').push({
      u: uid, n: (members[uid] && members[uid].name) || me.name,
      text: t.slice(0, 1000), ts: Date.now(),
      ua: navigator.userAgent.slice(0, 120)
    });
    $('fText').value = '';
    $('fbSheet').classList.remove('on');
    C.toast('Thanks — that reached us');
  } catch (e) { C.toast("Couldn't send it — " + (e.message || '')); }
};

/* ---------- leave ---------- */
$('leaveBtn').onclick = async () => {
  if (!confirm(`Leave ${meta.name}? You'll need the invite link and passcode to come back.`)) return;
  try { await C.ref('groups/' + crew.gid + '/members/' + uid).remove(); } catch (e) {}
  C.setCurrentGroup(null);
  location.href = 'index.html';
};
