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
let myPhoto = null;

/* Plain running totals — no personal data, just how much this is being used.
   A transaction so two people signing up at once don't overwrite each other. */
function bump(key) {
  try { C.ref('stats/counts/' + key).transaction(n => (n || 0) + 1); } catch (e) {}
}

/* shrink on the phone before it ever goes near the network */
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
/* Report which step failed. A bare "permission denied" tells nobody anything;
   naming the step points straight at the rule that needs publishing. */
async function step(what, fn) {
  try { return await fn(); }
  catch (e) {
    const m = String(e && e.message || '');
    throw new Error(m.includes('PERMISSION_DENIED')
      ? `Not allowed while ${what}. The database rules are out of date — republish rules.json in the Firebase console.`
      : `Failed while ${what}: ${m}`);
  }
}

function wirePhoto(inputId, prevId) {
  const inp = $(inputId); if (!inp) return;
  inp.onchange = e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    shrink(f, 64, 0.62).then(d => {
      if (!d) return C.toast("Couldn't read that photo");
      myPhoto = d;
      $(prevId).innerHTML = `<img src="${d}" alt="">`;
      const btn = $(inputId + 'Btn'); if (btn) btn.textContent = 'Change photo';
    });
  };
}
wirePhoto('cPhoto', 'cPhotoPrev');
wirePhoto('jPhoto', 'jPhotoPrev');
[['cPhotoBtn','cPhoto'],['jPhotoBtn','jPhoto']].forEach(([b, f]) => {
  const btn = $(b); if (btn) btn.onclick = () => $(f).click();
});
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
    if (new URLSearchParams(location.search).get('again'))
      $('joinKnown').innerHTML = 'Sign back in with the same name and pin you used before — '
        + 'your picks, ratings and photo are still there.';
    show('joinScreen');
    if (inv.pin) $('joinName').focus();
  } else if (cur && cur.key) {     // already signed in to something
    $('backName').textContent = cur.name || 'your crew';
    show('backScreen');
  } else if (cur) {                // known crew, but this device isn't signed in
    $('joinGid').value = cur.gid;
    await previewGroup(cur.gid);
    $('joinKnown').innerHTML = 'Sign back in with the same name and pin you used before — '
      + 'your picks, ratings and photo are still there.';
    show('joinScreen');
    $('joinName').focus();
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
    + '<option value="__ask">My festival isn\'t here — request it</option>';
  onPick();
}
function onPick() {
  const v = $('cPick').value;
  const ask = v === '__ask';
  $('cRequest').hidden = !ask;
  $('createGo').hidden = ask;
  const e = libIndex[v];
  $('cPickNote').textContent = ask
    ? "Tell us which one and we'll add it."
    : e ? `${e.days} days · ${e.stages} stages · ${e.acts} sets${e.place ? ' · ' + e.place : ''}`
        : '';
}
$('rqSend') && ($('rqSend').onclick = async () => {
  const what = $('rqFest').value.trim();
  if (!what) return C.toast('Which festival?');
  const btn = $('rqSend');
  btn.disabled = true; btn.textContent = 'Sending…';
  try {
    const when = new Date();
    const key = when.toISOString().slice(0, 19).replace(/[:T]/g, '-')
              + '_' + what.replace(/[^A-Za-z0-9]/g, '').slice(0, 16);
    await C.ref('stats/requests/' + key).set({
      festival: what.slice(0, 80),
      note: $('rqNote').value.trim().slice(0, 400),
      when: when.toISOString().slice(0, 16).replace('T', ' '),
      ts: when.getTime(),
      device: navigator.userAgent.slice(0, 120)
    });
    C.ref('stats/counts/requests').transaction(n => (n || 0) + 1);
    $('cRequest').innerHTML = '<p class="hint">Thanks — that reached us. '
      + "We'll add it once the official timetable is out.</p>";
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Send the request';
    C.toast("Couldn't send that — try again");
  }
});
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
  const fromLib = libIndex[pick] || null;
  if (!fromLib) return fail('createErr', 'Pick a festival from the list.');
  const fest  = fromLib.name;
  const year  = String(fromLib.year);
  const me    = $('cName').value.trim();
  const myPin = ($('cPin').value || '').replace(/\D/g, '');
  if (!gname) return fail('createErr', 'Give your crew a name.');
  if (!fest)  return fail('createErr', 'Which festival is this for?');
  if (!/^\d{4}$/.test(year)) return fail('createErr', 'Enter a four-digit year.');
  if (!me)    return fail('createErr', 'Enter your own name so the crew knows who you are.');
  if (!/^\d{3}$/.test(myPin)) return fail('createErr', 'Pick your own 3-number pin.');
  if (!myPhoto) return fail('createErr', 'Add a photo — it is how people find you in a field.');

  const btn = $('createGo');
  working(btn, true);
  try {
    const gid = C.randomId();
    const pin = C.randomPin();
    const token = await C.joinToken(gid, pin);
    const uid = C.myUid();
    const mkey = await C.personKey(gid, me, myPin);
    const slug = C.slugify(fest) + '-' + year;

    /* The join token lives where nobody can read it; the security rules check a
       joiner's submitted token against it, so the passcode is never exposed. */
    await step('creating the crew', () => C.ref('groups/' + gid).set({
      meta: { name: gname, festName: fest, year: +year, slug, created: Date.now(), owner: uid },
      join: { [token]: true },
      code: pin,                       // members can see it so they can pass it on
      admins: { [mkey]: true },
      members: { [mkey]: { name: me, joined: Date.now() } },
      photos: { [mkey]: myPhoto },
      uidmap: { [uid]: { k: mkey, t: token } }
    }));

    if (fromLib) {
      try {
        const s = await C.ref('library/' + pick).get();
        if (s.val()) {
          const doc = s.val();
          doc.updatedAt = fromLib.updatedAt || Date.now();
          await C.ref('groups/' + gid + '/festival').set(doc);
          await C.ref('groups/' + gid + '/festv').set(Date.now());
        }
      } catch (e) { /* they can still set it up by hand */ }
    }

    bump('crews'); bump('members');

    C.setCurrentGroup({ gid, name: gname, token, key: mkey });
    C.setMyProfile({ name: me, photo: null });
    showInvite(gid, pin, gname, fest, year);
  } catch (e) {
    working(btn, false, 'Create the crew');
    fail('createErr', (e && e.message) || "Couldn't create it — try again.");
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
  const pin = $('joinPin').value.trim().replace(/\D/g, '');
  const me  = $('joinName').value.trim();
  const myPin = ($('joinPin2').value || '').replace(/\D/g, '');
  if (!gid) return fail('joinErr', 'Paste the invite link or code.');
  if (!pin) return fail('joinErr', 'Enter the crew passcode.');
  if (!me)  return fail('joinErr', 'Enter your name.');
  if (!/^\d{3}$/.test(myPin)) return fail('joinErr', 'Enter your own 3-number pin.');

  const btn = $('joinGo');
  working(btn, true);
  try {
    const ok = await previewGroup(gid);
    if (!ok) throw new Error('no such crew');

    /* A crew's traffic grows with the square of its size, so 50 is where it
       stops being cheap — and past that the check-in list stops being useful
       anyway. Returning members are always let back in. */
    const mkeyPre = await C.personKey(gid, me, myPin);
    let already = null;
    try { already = (await C.ref('groups/' + gid + '/members/' + mkeyPre).get()).val(); } catch (e) {}
    if (!already) {
      let count = 0;
      try { count = (await C.ref('groups/' + gid + '/members').get()).numChildren(); } catch (e) {}
      if (count >= 50) throw new Error('crew full');
    }
    const token = await C.joinToken(gid, pin);
    const mkey = mkeyPre;

    /* Same name and pin gives the same key on any device, so a returning member
       lands on the record they already have — picks, ratings, photo and all. */
    const existing = already;
    if (!existing && !myPhoto) {
      working(btn, false, 'Join the crew');
      return fail('joinErr', 'Add a photo — it is how people find you in a field.');
    }
    /* claim this device for that person — the passcode proves you may be here,
       the key itself proves which member you are */
    await step('registering this device', () =>
      C.ref('groups/' + gid + '/uidmap/' + C.myUid()).set({ k: mkey, t: token }));

    if (existing) {
      await step('signing you back in', () =>
        C.ref('groups/' + gid + '/members/' + mkey).update({ t: token, seen: Date.now() }));
    } else {
      await step('joining the crew', () => C.ref('groups/' + gid + '/members/' + mkey)
        .set({ name: me, joined: Date.now(), t: token }));
      try { await C.ref('groups/' + gid + '/photos/' + mkey).set(myPhoto); } catch (e) {}
      bump('members');
    }
    C.setCurrentGroup({ gid, name: previewed.name, token, key: mkey });
    C.setMyProfile({ name: me, photo: null });
    location.href = 'grid.html';
  } catch (e) {
    working(btn, false, 'Join the crew');
    const msg = String(e && e.message || '');
    fail('joinErr',
      msg.includes('crew full') ? "That crew is full — 50 is the limit. Ask them to start a second one."
      : msg.includes('no such crew') ? "No crew with that code — check the link."
      : msg.includes('rules are out of date') ? msg
      : "That crew passcode doesn't match.");
  }
};

/* paste a whole invite link into the code box and we pull the parts out */
$('joinGid').addEventListener('input', () => {
  const v = $('joinGid').value;
  const m = /[?&]g=([A-Za-z0-9]+)/.exec(v);
  if (m) {
    $('joinGid').value = m[1];
    const p = /[?&]p=([A-Za-z0-9]+)/.exec(v);
    if (p && !$('joinPin').value) $('joinPin').value = p[1].replace(/\D/g, '');
    previewGroup(m[1]);
  }
});
