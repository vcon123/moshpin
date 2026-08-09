/* Crew @ — landing: create a crew, join one, show the invite */
import * as C from './core.js';
import { svg as qrSvg } from './qr.js';

/* Change this one line when the real domain is live. */
const BASE = location.origin + location.pathname.replace(/[^/]*$/, '');

const $ = id => document.getElementById(id);
const show = id => { document.querySelectorAll('.screen').forEach(s => s.hidden = true); $(id).hidden = false; };
const fail = (id, msg) => { const e = $(id); e.textContent = msg; e.classList.add('on'); };
const clearErr = id => $(id).classList.remove('on');

let busy = false;
function working(btn, on, label) {
  busy = on;
  btn.disabled = on;
  btn.innerHTML = on ? '<span class="spin"></span> working…' : label;
}

/* ---------- boot ----------
   Anything that fails here must say so on screen. A silent failure leaves the
   page looking empty, because every screen starts hidden. */
function bootFail(msg, detail) {
  const e = $('bootErr');
  e.innerHTML = msg + (detail ? '<br><span style="opacity:.7;font-size:11.5px">' + C.esc(detail) + '</span>' : '');
  e.classList.add('on');
  show('startScreen');                       // always leave the buttons reachable
}
window.addEventListener('error', ev => {
  if (!$('bootErr').classList.contains('on'))
    bootFail('Something failed to load. Try a hard refresh.', ev.message);
});

(async function () {
  if (typeof firebase === 'undefined' || !firebase.initializeApp) {
    return bootFail('Could not load Firebase.',
      'The three firebase scripts in index.html did not load — check your connection or an ad blocker.');
  }
  if (!firebase.auth) {
    return bootFail('Firebase auth script is missing.',
      'index.html needs firebase-auth-compat.js as well as app and database.');
  }
  try { C.init(); }
  catch (e) { return bootFail('Could not start Firebase.', e && e.message); }

  try { await C.signIn(); }
  catch (e) {
    const m = String(e && (e.code || e.message) || '');
    return bootFail(
      m.includes('operation-not-allowed')
        ? 'Anonymous sign-in is switched off in Firebase.'
        : "Couldn't reach the server.",
      m.includes('operation-not-allowed')
        ? 'Firebase console → Authentication → Sign-in method → Anonymous → Enable.'
        : m);
  }

  const inv = C.groupFromUrl();
  const cur = C.currentGroup();

  if (inv) {                       // arrived via an invite link
    $('joinGid').value = inv.gid;
    if (inv.pin) $('joinPin').value = inv.pin;
    await previewGroup(inv.gid);
    show('joinScreen');
    if (inv.pin) $('joinName').focus();
  } else if (cur) {                // already a member of something
    $('backName').textContent = cur.name || 'your crew';
    show('backScreen');
  } else {
    show('startScreen');
  }
})();

/* ---------- create ---------- */
/* The library lists festivals someone has already built. Picking one copies it
   into your crew, so you never start from an empty timetable. */
let libIndex = {};
async function loadLibrary() {
  const sel = $('cPick');
  try {
    const s = await C.ref('library_index').get();
    libIndex = s.val() || {};
  } catch (e) { libIndex = {}; }
  const keys = Object.keys(libIndex).sort((a, b) =>
    (libIndex[b].year - libIndex[a].year) || String(libIndex[a].name).localeCompare(libIndex[b].name));
  sel.innerHTML = keys.map(k =>
    `<option value="${k}">${C.esc(libIndex[k].name)} ${libIndex[k].year}</option>`).join('')
    + '<option value="__own">Something else — I\'ll add it myself</option>';
  onPick();
}
function onPick() {
  const v = $('cPick').value;
  const own = v === '__own';
  $('cManual').hidden = !own;
  const e = libIndex[v];
  $('cPickNote').innerHTML = own
    ? "You'll build the timetable yourself after this. Your festival not in the list? "
      + "Request it — we can only add one once the official timetable has been published."
    : e ? `${e.days} days · ${e.stages} stages · ${e.acts} sets${e.place ? ' · ' + C.esc(e.place) : ''}`
        : '';
}
$('cPick').onchange = onPick;

$('goCreate').onclick = () => { show('createScreen'); loadLibrary(); $('cGroup').focus(); };
$('goJoin').onclick = () => { show('joinScreen'); $('joinGid').focus(); };
$('createBack').onclick = () => show('startScreen');
$('joinBack').onclick = () => show('startScreen');
$('backOther').onclick = () => show('startScreen');
$('backGo').onclick = () => { location.href = 'grid.html'; };

$('createGo').onclick = async () => {
  if (busy) return;
  clearErr('createErr');
  const gname = $('cGroup').value.trim();
  const pick  = $('cPick').value;
  const fromLib = pick && pick !== '__own' ? libIndex[pick] : null;
  const fest  = fromLib ? fromLib.name : $('cFest').value.trim();
  const year  = String(fromLib ? fromLib.year : ($('cYear').value || '').trim());
  const me    = $('cName').value.trim();
  if (!gname) return fail('createErr', 'Give your crew a name.');
  if (!fest)  return fail('createErr', 'Which festival is this for?');
  if (!/^\d{4}$/.test(year)) return fail('createErr', 'Enter a four-digit year.');
  if (!me)    return fail('createErr', 'Enter your own name so the crew knows who you are.');

  const btn = $('createGo');
  working(btn, true);
  try {
    const gid = C.randomId();
    const pin = C.randomCode(4);
    const token = await C.joinToken(gid, pin);
    const uid = C.myUid();
    const slug = C.slugify(fest) + '-' + year;

    /* The join token lives where nobody can read it; the security rules check a
       joiner's submitted token against it, so the passcode is never exposed. */
    await C.ref('groups/' + gid).set({
      meta: { name: gname, festName: fest, year: +year, slug, created: Date.now(), owner: uid },
      join: { [token]: true },
      admins: { [uid]: true },
      members: { [uid]: { name: me, joined: Date.now() } }
    });

    if (fromLib) {
      try {
        const s = await C.ref('library/' + pick).get();
        if (s.val()) await C.ref('groups/' + gid + '/festival').set(s.val());
      } catch (e) { /* they can still set it up by hand */ }
    }

    C.setCurrentGroup({ gid, name: gname, token });
    C.setMyProfile({ name: me, photo: null });
    showInvite(gid, pin, gname, fest, year);
  } catch (e) {
    working(btn, false, 'Create the crew');
    fail('createErr', "Couldn't create it — " + (e && e.message ? e.message : 'try again') + '.');
    return;
  }
  working(btn, false, 'Create the crew');
};

/* ---------- invite ---------- */
function inviteLinks(gid, pin) {
  return {
    safe:  `${BASE}?g=${gid}`,
    quick: `${BASE}?g=${gid}&p=${pin}`
  };
}
function showInvite(gid, pin, gname, fest, year) {
  const L = inviteLinks(gid, pin);
  $('invTitle').textContent = gname;
  $('invSub').textContent = `Crew @ ${fest} ${year}`;
  $('invPin').textContent = pin;
  $('invLink').value = L.safe;
  $('qrHolder').innerHTML = qrSvg(L.quick, 210);
  show('inviteScreen');
}
$('copyLink').onclick = async () => {
  try { await navigator.clipboard.writeText($('invLink').value); C.toast('Link copied'); }
  catch (e) { $('invLink').select(); C.toast('Press copy on your keyboard'); }
};
$('shareLink').onclick = async () => {
  const t = `Join my crew — ${$('invTitle').textContent}\n${$('invLink').value}\nPasscode: ${$('invPin').textContent}`;
  if (navigator.share) { try { await navigator.share({ text: t }); } catch (e) {} }
  else { try { await navigator.clipboard.writeText(t); C.toast('Invite copied'); } catch (e) {} }
};
$('invGo').onclick = () => { location.href = 'grid.html'; };

/* ---------- join ---------- */
let previewed = null;
async function previewGroup(gid) {
  try {
    const s = await C.ref('groups/' + gid + '/meta').get();
    const m = s.val();
    if (m) {
      previewed = m;
      $('joinWho').textContent = m.name;
      $('joinWhat').textContent = `Crew @ ${m.festName} ${m.year}`;
      $('joinPreview').hidden = false;
      return true;
    }
  } catch (e) {}
  $('joinPreview').hidden = true;
  return false;
}
$('joinGid').addEventListener('change', () => {
  const v = $('joinGid').value.trim();
  if (v) previewGroup(v);
});

$('joinGo').onclick = async () => {
  if (busy) return;
  clearErr('joinErr');
  const gid = $('joinGid').value.trim();
  const pin = $('joinPin').value.trim().toUpperCase();
  const me  = $('joinName').value.trim();
  if (!gid) return fail('joinErr', 'Paste the invite link or code.');
  if (!pin) return fail('joinErr', 'Enter the passcode.');
  if (!me)  return fail('joinErr', 'Enter your name.');

  const btn = $('joinGo');
  working(btn, true);
  try {
    const ok = await previewGroup(gid);
    if (!ok) throw new Error('no such crew');
    const token = await C.joinToken(gid, pin);
    const uid = C.myUid();
    /* The rules reject this write unless the token matches, so a wrong
       passcode fails here rather than letting anyone in. */
    await C.ref('groups/' + gid + '/members/' + uid)
      .set({ name: me, joined: Date.now(), t: token });

    C.setCurrentGroup({ gid, name: previewed.name, token });
    C.setMyProfile({ name: me, photo: null });
    location.href = 'grid.html';
  } catch (e) {
    working(btn, false, 'Join the crew');
    const msg = String(e && e.message || '');
    fail('joinErr', msg.includes('no such crew')
      ? "No crew with that code — check the link."
      : "That passcode doesn't match this crew.");
  }
};

/* paste a whole invite link into the code box and we pull the parts out */
$('joinGid').addEventListener('input', () => {
  const v = $('joinGid').value;
  const m = /[?&]g=([A-Za-z0-9]+)/.exec(v);
  if (m) {
    $('joinGid').value = m[1];
    const p = /[?&]p=([A-Za-z0-9]+)/.exec(v);
    if (p && !$('joinPin').value) $('joinPin').value = p[1].toUpperCase();
    previewGroup(m[1]);
  }
});
