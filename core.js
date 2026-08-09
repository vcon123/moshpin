/* MoshPin — core
   Firebase, anonymous auth, group context, festival-local time, cache, utils.
   Loaded by every page. Keeps no festival-specific knowledge. */

/* The database alone needs only the URL, but Authentication also needs the API
   key. None of this is secret — Google publishes it in every web app; access is
   controlled by the security rules, not by hiding these values. */
export const CFG = {
  apiKey:      "AIzaSyBd-nc_nKkjko1unYUBtxKf2BFabYUpiqU",
  authDomain:  "moshpin-43eef.firebaseapp.com",
  projectId:   "moshpin-43eef",
  databaseURL: "https://moshpin-43eef-default-rtdb.europe-west1.firebasedatabase.app"
};
/* everything lives under one root so old data elsewhere in the database is untouched */
export const ROOT = 'moshpin';

let db = null, auth = null, uid = null;

export function init() {
  if (!db) {
    if (!firebase.apps.length) firebase.initializeApp(CFG);
    db = firebase.database();
    auth = firebase.auth();
  }
  return { db, auth };
}
export const ref = p => db.ref(ROOT + '/' + p);
export const rawDb = () => db;
export const myUid = () => uid;

/* Anonymous auth. Every device gets an invisible account; security rules use it
   to scope writes. Free up to 50k monthly users, and stale anonymous accounts
   are cleaned up by Google automatically. */
export function signIn() {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('auth timeout')), 15000);
    auth.onAuthStateChanged(u => {
      if (u) { clearTimeout(t); uid = u.uid; res(u.uid); }
    });
    auth.signInAnonymously().catch(e => { clearTimeout(t); rej(e); });
  });
}

/* ---------- utils ---------- */
export const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const slugify = s => String(s || '').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '').slice(0, 40);

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no I/O/0/1 — read aloud in a field
export function randomCode(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return Array.from(a, x => ALPHA[x % ALPHA.length]).join('');
}
export const randomId = () => randomCode(10).toLowerCase();

export async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}
/* the join token is a hash of group + passcode, so the passcode itself is never
   stored or transmitted in a readable form */
export const joinToken = (gid, pin) => sha256(ROOT + '|' + gid + '|' + String(pin).toUpperCase());

const PALETTE = ['#e2c044','#d96c5f','#7fb069','#6ca6c1','#b087c9','#e08e45',
                 '#5fc9b3','#c95f8f','#a3b18a','#e0d3af','#8fd977','#d98f6c'];
const hash = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
export const colorFor = n => PALETTE[hash(String(n).toLowerCase()) % PALETTE.length];
export const initials = n => String(n || '?').trim().split(/\s+/)
  .map(w => w[0]).join('').slice(0, 2).toUpperCase();

/* ---------- festival-local time ----------
   Always shown in the festival's own timezone, so the app matches the printed
   poster whether you are on site or planning from home. */
export function nowIn(tz) {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz || 'Europe/Amsterdam', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(new Date());
  const g = t => p.find(x => x.type === t).value;
  const h = (+g('hour')) % 24;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, mins: h * 60 + (+g('minute')) };
}

export const hhmmToMin = t => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t).trim());
  return m ? (+m[1]) * 60 + (+m[2]) : null;
};
export const minToHhmm = m => {
  const v = ((m % 1440) + 1440) % 1440;
  return String(Math.floor(v / 60)).padStart(2, '0') + ':' + String(v % 60).padStart(2, '0');
};

/* Minutes from the start of a festival day, so a 01:00 set on a day that opens
   at 11:00 lands at 840 rather than wrapping back to the morning. */
export const offsetInDay = (hhmm, dayStartHour) => {
  const m = hhmmToMin(hhmm);
  if (m == null) return null;
  return ((m - dayStartHour * 60) + 1440) % 1440;
};

/* Which festival day are we in right now, and how far into it. Returns null
   outside the festival. `days` is [{date, start, hours}]. */
export function currentDay(days, tz) {
  if (!days || !days.length) return null;
  const n = nowIn(tz);
  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    const startAbs = new Date(d.date + 'T00:00:00Z').getTime() / 60000 + d.start * 60;
    const nowAbs = new Date(n.date + 'T00:00:00Z').getTime() / 60000 + n.mins;
    const into = nowAbs - startAbs;
    if (into >= 0 && into < d.hours * 60) return { idx: i, into };
  }
  return null;
}
export const festivalOver = (days, tz) => {
  if (!days || !days.length) return false;
  const last = days[days.length - 1];
  const n = nowIn(tz);
  const endAbs = new Date(last.date + 'T00:00:00Z').getTime() / 60000 + last.start * 60 + last.hours * 60;
  const nowAbs = new Date(n.date + 'T00:00:00Z').getTime() / 60000 + n.mins;
  return nowAbs >= endAbs;
};
export const festivalStarted = (days, tz) => {
  if (!days || !days.length) return false;
  const f = days[0];
  const n = nowIn(tz);
  const startAbs = new Date(f.date + 'T00:00:00Z').getTime() / 60000 + f.start * 60;
  const nowAbs = new Date(n.date + 'T00:00:00Z').getTime() / 60000 + n.mins;
  return nowAbs >= startAbs;
};

/* ---------- which group am I in ---------- */
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};
export { LS };

export function groupFromUrl() {
  const q = new URLSearchParams(location.search);
  const g = q.get('g');
  const p = q.get('p');            // quick-join links carry the passcode
  return g ? { gid: g, pin: p || null } : null;
}
/* A phone can belong to several crews — one per festival. We remember them all
   and which one is showing, so switching is instant and signing in on a second
   device with the same name + passcode picks everything back up. */
export const allGroups = () => LS.get('mp_crews', []);          // [{gid,name,token,fest}]
export const currentGroup = () => {
  const cur = LS.get('mp_crew', null);
  if (cur) return cur;
  const all = allGroups();
  return all.length ? all[0] : null;
};
export function setCurrentGroup(g) {
  LS.set('mp_crew', g);
  if (!g) return;
  const all = allGroups().filter(x => x.gid !== g.gid);
  all.unshift(g);
  LS.set('mp_crews', all.slice(0, 12));
}
export function forgetGroup(gid) {
  LS.set('mp_crews', allGroups().filter(x => x.gid !== gid));
  const cur = LS.get('mp_crew', null);
  if (cur && cur.gid === gid) LS.set('mp_crew', allGroups()[0] || null);
}
export const myProfile = () => LS.get('mp_me', null);            // {name,photo}
export const setMyProfile = p => LS.set('mp_me', p);

/* ---------- on-device cache ----------
   Immutable things (festival documents, photos, sent messages) download once
   per device and are then served locally. Bounded with LRU eviction. */
const CACHE_V = 'mp1', BUDGET = 3 * 1024 * 1024;
let idx = {};
try {
  if (localStorage.getItem('mp_cv') !== CACHE_V) {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && (k.indexOf('mp_b_') === 0 || k === 'mp_ci')) localStorage.removeItem(k);
    }
    localStorage.setItem('mp_cv', CACHE_V);
  }
  idx = JSON.parse(localStorage.getItem('mp_ci') || '{}');
} catch (e) { idx = {}; }

const idxSave = () => { try { localStorage.setItem('mp_ci', JSON.stringify(idx)); } catch (e) {} };
function evict(hard) {
  let t = 0; for (const k in idx) t += (idx[k].s || 0);
  const lim = hard ? BUDGET * 0.5 : BUDGET;
  if (t <= lim) return;
  for (const k of Object.keys(idx).sort((a, b) => (idx[a].t || 0) - (idx[b].t || 0))) {
    if (t <= lim) break;
    t -= (idx[k].s || 0);
    try { localStorage.removeItem('mp_b_' + k); } catch (e) {}
    delete idx[k];
  }
}
export function cacheGet(k) {
  try {
    const v = localStorage.getItem('mp_b_' + k);
    if (v) { idx[k] = { s: v.length, t: Date.now() }; idxSave(); }
    return v;
  } catch (e) { return null; }
}
export function cacheSet(k, v) {
  if (!v) return;
  const put = () => { localStorage.setItem('mp_b_' + k, v); idx[k] = { s: v.length, t: Date.now() }; };
  try { put(); evict(); idxSave(); }
  catch (e) { evict(true); try { put(); idxSave(); } catch (e2) {} }
}

/* ---------- shared chrome ---------- */
export function toast(msg, ms) {
  let el = document.getElementById('mp-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'mp-toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('on'), ms || 2600);
}
