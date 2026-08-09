/* MoshPin — getting there and back.
   Everyone says when they arrive and leave and how they're travelling, so the
   crew can share cars and nobody ends up alone on a night bus. Admins can
   enter it on behalf of someone who hasn't opened the app. */
import * as C from './core.js';

export const MODES = {
  car:   { i: '🚗', label: 'Car' },
  train: { i: '🚆', label: 'Train' },
  bus:   { i: '🚌', label: 'Coach / bus' },
  bike:  { i: '🚲', label: 'Bike' },
  lift:  { i: '🙋', label: 'Need a lift' },
  other: { i: '🚶', label: 'Something else' }
};

let gid = null, uid = null, members = () => ({}), photos = () => ({});
let rides = {}, onChange = () => {};

export function init(o) {
  gid = o.gid; uid = o.uid; members = o.members; photos = o.photos;
  onChange = o.onChange || (() => {});
  const r = C.ref('groups/' + gid + '/transport');
  const touch = (k, v) => { if (v) rides[k] = v; else delete rides[k]; onChange(); };
  r.on('child_added',   s => touch(s.key, s.val()));
  r.on('child_changed', s => touch(s.key, s.val()));
  r.on('child_removed', s => touch(s.key, null));
}

export const all = () => Object.entries(rides).map(([u, v]) => Object.assign({ uid: u }, v));
export const forUser = u => rides[u] || null;
export const seatsGoing = () => all().reduce((n, r) => n + (r.mode === 'car' ? (+r.seatsIn || 0) : 0), 0);
export const seatsBack  = () => all().reduce((n, r) => n + (r.mode === 'car' ? (+r.seatsOut || 0) : 0), 0);
export const needLift   = () => all().filter(r => r.mode === 'lift').length;

export async function save(forUid, data) {
  const target = forUid || uid;
  const rec = {
    n: (members()[target] || {}).name || 'Someone',
    mode: data.mode || 'other',
    inAt: data.inAt || '', outAt: data.outAt || '',
    seatsIn: +data.seatsIn || 0, seatsOut: +data.seatsOut || 0,
    note: (data.note || '').slice(0, 80),
    by: uid, ts: Date.now()
  };
  rides[target] = rec;                       // optimistic
  onChange();
  try { await C.ref('groups/' + gid + '/transport/' + target).set(rec); }
  catch (e) { C.toast("Couldn't save that — " + (e.message || '')); }
}
export async function clear(forUid) {
  const t = forUid || uid;
  delete rides[t]; onChange();
  try { await C.ref('groups/' + gid + '/transport/' + t).remove(); } catch (e) {}
}

/* ---------- view ---------- */
const esc = C.esc;
function avatar(u, size) {
  const s = size || 26;
  const nm = (members()[u] || {}).name || '?';
  const p = photos()[u];
  return p ? `<img class="av" src="${p}" alt="" style="width:${s}px;height:${s}px">`
    : `<span class="av fb" style="width:${s}px;height:${s}px;background:${C.colorFor(nm)};font-size:${Math.round(s / 2.6)}px">${esc(C.initials(nm))}</span>`;
}
const when = t => t ? esc(t) : '—';

export function render(body, isAdmin) {
  const list = all().sort((a, b) => String(a.inAt || '~').localeCompare(String(b.inAt || '~')));
  const missing = Object.keys(members()).filter(u => !rides[u]);
  const sg = seatsGoing(), sb = seatsBack(), nl = needLift();

  body.innerHTML = `
    <div class="phead"><b>🚗 Getting there</b><button class="btn sm" id="trX">✕</button></div>
    <p class="hint">${list.length
      ? [ (sg || sb) ? `${sg} seat${sg === 1 ? '' : 's'} going, ${sb} coming back` : null,
          nl ? `${nl} looking for a lift` : null,
          `${list.length} of ${Object.keys(members()).length} have said` ]
        .filter(Boolean).join(' · ')
      : 'Nobody has said how they are travelling yet.'}</p>

    <button class="btn primary wide" id="trMine" style="margin-top:12px">
      ${rides[uid] ? 'Change my travel' : 'Add my travel'}</button>

    ${list.length ? `<div class="tgroup">The crew</div>` + list.map(r => {
      const m = MODES[r.mode] || MODES.other;
      const seats = (r.seatsIn || r.seatsOut)
        ? `${r.seatsIn || 0}→ ${r.seatsOut || 0}←` : '';
      return `<div class="trow">
        <div class="tmode">${m.i}</div>
        <div class="tmain">
          <div class="tname">${esc(r.n)}${r.mode === 'lift' ? ' <span class="tag">needs a lift</span>' : ''}</div>
          <div class="tdet">${esc(m.label)} · arrives ${when(r.inAt)} · leaves ${when(r.outAt)}</div>
          ${r.note ? `<div class="tdet" style="color:var(--edge)">${esc(r.note)}</div>` : ''}
        </div>
        ${seats ? `<div class="tseat">${seats}</div>` : ''}
        ${(isAdmin || r.uid === uid) ? `<button class="mini" data-ed="${r.uid}">Edit</button>` : ''}
      </div>`;
    }).join('') : ''}

    ${missing.length ? `<div class="tgroup">Not said yet</div>` + missing.map(u =>
      `<div class="trow">${avatar(u)}
        <div class="tmain"><div class="tname">${esc((members()[u] || {}).name || '?')}</div></div>
        ${isAdmin ? `<button class="mini" data-ed="${u}">Add for them</button>` : ''}
      </div>`).join('') : ''}
  `;
}

export function renderForm(body, forUid, back) {
  const existing = rides[forUid] || {};
  const who = (members()[forUid] || {}).name || 'you';
  body.innerHTML = `
    <div class="phead"><button class="btn sm" id="trBack">‹</button>
      <b style="flex:1">${forUid === uid ? 'My travel' : esc(who)}</b>
      <button class="btn sm" id="trX">✕</button></div>

    <label>How are you travelling?</label>
    <div class="tb2" id="trModes" style="margin-top:2px">
      ${Object.entries(MODES).map(([k, m]) =>
        `<button class="chip${(existing.mode || 'car') === k ? ' on' : ''}" data-m="${k}">${m.i} ${m.label}</button>`).join('')}
    </div>

    <div class="row" style="margin-top:12px">
      <div><label for="trIn">Arriving</label>
        <input type="text" id="trIn" placeholder="Fri 14:00" maxlength="20" value="${esc(existing.inAt || '')}"></div>
      <div><label for="trOut">Leaving</label>
        <input type="text" id="trOut" placeholder="Sun 23:00" maxlength="20" value="${esc(existing.outAt || '')}"></div>
    </div>

    <div id="trSeats" ${(existing.mode || 'car') === 'car' ? '' : 'hidden'}>
      <div class="row" style="margin-top:10px">
        <div><label for="trSi">Spare seats there</label>
          <input type="number" id="trSi" min="0" max="8" value="${+existing.seatsIn || 0}"></div>
        <div><label for="trSo">Spare seats back</label>
          <input type="number" id="trSo" min="0" max="8" value="${+existing.seatsOut || 0}"></div>
      </div>
    </div>

    <label for="trNote">Anything else</label>
    <input type="text" id="trNote" maxlength="80" placeholder="leaving from Amsterdam Zuid" value="${esc(existing.note || '')}">

    <button class="btn primary wide" id="trSave" style="margin-top:14px">Save</button>
    ${rides[forUid] ? `<button class="btn danger wide" id="trDel" style="margin-top:8px">Remove</button>` : ''}
  `;
  let mode = existing.mode || 'car';
  body.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
    mode = b.dataset.m;
    body.querySelectorAll('[data-m]').forEach(x => x.classList.toggle('on', x.dataset.m === mode));
    body.querySelector('#trSeats').hidden = mode !== 'car';
  });
  body.querySelector('#trSave').onclick = async () => {
    await save(forUid, {
      mode,
      inAt: body.querySelector('#trIn').value.trim(),
      outAt: body.querySelector('#trOut').value.trim(),
      seatsIn: body.querySelector('#trSi').value,
      seatsOut: body.querySelector('#trSo').value,
      note: body.querySelector('#trNote').value.trim()
    });
    back();
  };
  const del = body.querySelector('#trDel');
  if (del) del.onclick = async () => { await clear(forUid); back(); };
  body.querySelector('#trBack').onclick = back;
}
