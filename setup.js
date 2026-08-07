/* MoshPin — festival setup (admins only).
   Days, venues and acts. Deliberately small: this is the thing that could
   swallow infinite time, so it does exactly what a festival needs and no more. */
import * as C from './core.js';
import * as F from './festival.js';

const $ = id => document.getElementById(id);
const esc = C.esc;

let crew = null, meta = null, uid = null, fest = null;
let dayIdx = 0, dirty = false;

/* ---------- boot ---------- */
function boom(msg, detail) {
  $('app').innerHTML = `<div class="card"><h2>Something went wrong</h2>
    <p class="hint" style="margin-top:8px">${esc(msg)}</p>
    ${detail ? `<p class="hint" style="opacity:.7;margin-top:6px">${esc(detail)}</p>` : ''}
    <div style="margin-top:16px"><a class="btn wide" href="app.html">Back to the crew</a></div></div>`;
}
window.addEventListener('error', e => {
  if (!$('app').innerHTML.includes('Something went wrong')) boom('A script failed.', e.message);
});
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

(async function () {
  crew = C.currentGroup();
  if (!crew) { location.href = 'index.html'; return; }
  if (typeof firebase === 'undefined') return boom('Could not load Firebase.');
  try { C.init(); uid = await C.signIn(); }
  catch (e) { return boom("Couldn't sign in.", e && (e.code || e.message)); }

  try {
    meta = (await C.ref('groups/' + crew.gid + '/meta').get()).val();
    const isAdmin = (await C.ref('groups/' + crew.gid + '/admins/' + uid).get()).val();
    if (!isAdmin) return boom('Only admins can edit the festival.',
      'Ask an admin of this crew to make you one.');
  } catch (e) { return boom("Couldn't check your permissions.", e && e.message); }

  fest = await F.load(crew.gid);
  if (!fest) {
    fest = F.blank(meta.festName, meta.year);
    await offerLibrary();
  }
  $('festTitle').textContent = `${fest.name} ${fest.year}`;
  $('app').hidden = false;
  paint();
})();

/* If another crew already built this festival, start from their version. */
async function offerLibrary() {
  const slug = F.slugFor(meta.festName, meta.year);
  const lib = await F.libraryGet(slug);
  if (!lib || (!lib.days.length && !lib.venues.length)) return;
  const n = Object.keys(lib.acts || {}).length;
  if (!confirm(
    `Someone has already set up ${lib.name} ${lib.year} — `
    + `${lib.days.length} day(s), ${lib.venues.length} venue(s), ${n} set(s).\n\n`
    + `Start from their version? You can change anything afterwards, and it won't affect them.`)) return;
  fest = lib;
  dirty = true;
}

/* ---------- render ---------- */
function paint() {
  /* days */
  $('dayTabs').innerHTML = fest.days.map((d, i) =>
    `<button class="btn sm ${i === dayIdx ? 'primary' : ''}" data-day="${i}">${esc(F.dayLabel(d))}</button>`
  ).join('') + `<button class="btn sm" id="addDay">+ day</button>`;
  $('dayTabs').querySelectorAll('[data-day]').forEach(b =>
    b.onclick = () => { dayIdx = +b.dataset.day; paint(); });
  $('addDay').onclick = doAddDay;

  const day = fest.days[dayIdx];
  $('dayPanel').hidden = !day;
  if (day) {
    $('dayDate').value = day.date;
    $('dayStart').value = day.start;
    $('dayHours').value = day.hours;
    const endH = (day.start + day.hours) % 24;
    $('dayEnds').textContent =
      `runs ${String(day.start).padStart(2, '0')}:00 → ${String(endH).padStart(2, '0')}:00`
      + (F.dayEndsNextDay(day) ? ' the next morning' : '');
  }

  /* venues */
  const row = v => `
    <div class="mrow">
      <span class="vtype ${v.type}">${v.type === 'stage' ? 'stage' : 'spot'}</span>
      <div class="mname">${esc(v.name)}</div>
      <button class="mini" data-ren="${v.id}">Rename</button>
      <button class="mini danger" data-delv="${v.id}">Delete</button>
    </div>`;
  $('venueList').innerHTML =
    (fest.venues.length ? fest.venues.map(row).join('')
      : '<p class="hint">No venues yet. Stages have a timetable; spots are places people can check in to, like a food court or the camp site.</p>');
  $('venueList').querySelectorAll('[data-ren]').forEach(b => b.onclick = () => {
    const v = F.venue(fest, b.dataset.ren);
    const n = prompt('Rename', v.name);
    if (n && n.trim()) { v.name = n.trim(); dirty = true; paint(); }
  });
  $('venueList').querySelectorAll('[data-delv]').forEach(b => b.onclick = () => {
    const v = F.venue(fest, b.dataset.delv);
    const n = F.actsOf(fest, null, v.id).length
      + Object.values(fest.acts).filter(a => a.v === v.id).length;
    if (!confirm(`Delete ${v.name}?` + (n ? `\n\nIts sets will go too.` : ''))) return;
    F.removeVenue(fest, v.id); dirty = true; paint();
  });

  /* acts for this day */
  const st = F.stages(fest);
  $('actVenue').innerHTML = st.map(v => `<option value="${v.id}">${esc(v.name)}</option>`).join('');
  $('actForm').hidden = !(day && st.length);
  $('actHelp').hidden = !!(day && st.length);
  $('actHelp').textContent = !day ? 'Add a day first.' : 'Add a stage first — spots do not have a timetable.';

  const acts = day ? F.actsOf(fest, dayIdx) : [];
  $('actList').innerHTML = acts.length ? acts.map(a => {
    const v = F.venue(fest, a.v);
    const late = F.offset(fest, a) >= (24 - fest.days[a.d].start) * 60;
    return `<div class="mrow">
      <div class="mname">${esc(a.n)}
        <div class="hint">${esc(v ? v.name : '?')} · ${esc(a.s)}–${esc(a.e)}${late ? ' <span class="tag">after midnight</span>' : ''}</div>
      </div>
      <button class="mini danger" data-dela="${a.id}">Delete</button>
    </div>`;
  }).join('') : '<p class="hint">Nothing on this day yet.</p>';
  $('actList').querySelectorAll('[data-dela]').forEach(b => b.onclick = () => {
    delete fest.acts[b.dataset.dela]; dirty = true; paint();
  });

  /* problems + save state */
  const probs = F.problems(fest);
  $('problems').hidden = !probs.length;
  $('problems').innerHTML = probs.map(p => `<div>⚠ ${esc(p)}</div>`).join('');
  $('saveBtn').textContent = dirty ? 'Save changes' : 'Saved';
  $('saveBtn').disabled = !dirty;
  $('counts').textContent =
    `${fest.days.length} day(s) · ${F.stages(fest).length} stage(s) · ${F.spots(fest).length} spot(s) · ${Object.keys(fest.acts).length} set(s)`;
}

/* ---------- actions ---------- */
function doAddDay() {
  const last = fest.days[fest.days.length - 1];
  let date = last ? nextDate(last.date) : new Date().toISOString().slice(0, 10);
  const d = prompt('Date (YYYY-MM-DD)', date);
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d.trim())) return;
  F.addDay(fest, d.trim(), last ? last.start : 11, last ? last.hours : 12);
  dayIdx = fest.days.findIndex(x => x.date === d.trim());
  dirty = true; paint();
}
const nextDate = s => {
  const t = new Date(s + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
};
['dayDate', 'dayStart', 'dayHours'].forEach(id => $(id).onchange = () => {
  const day = fest.days[dayIdx]; if (!day) return;
  day.date = $('dayDate').value;
  day.start = Math.max(0, Math.min(23, +$('dayStart').value || 0));
  day.hours = Math.max(1, Math.min(24, +$('dayHours').value || 12));
  dirty = true; paint();
});
$('delDay').onclick = () => {
  if (!fest.days[dayIdx]) return;
  if (!confirm('Delete this day and everything on it?')) return;
  F.removeDay(fest, dayIdx);
  dayIdx = Math.max(0, dayIdx - 1);
  dirty = true; paint();
};
$('addVenue').onclick = () => {
  const n = $('venueName').value.trim();
  if (!n) return C.toast('Give it a name');
  F.addVenue(fest, n, $('venueType').value);
  $('venueName').value = ''; dirty = true; paint();
};
$('addAct').onclick = () => {
  const n = $('actName').value.trim();
  const s = $('actStart').value.trim(), e = $('actEnd').value.trim();
  if (!n) return C.toast('Who is playing?');
  if (C.hhmmToMin(s) == null || C.hhmmToMin(e) == null) return C.toast('Times look like 22:30');
  F.addAct(fest, { d: dayIdx, v: $('actVenue').value, s, e, n, u: $('actUrl').value.trim() || null });
  $('actName').value = ''; $('actUrl').value = '';
  $('actStart').value = e;                       // most sets follow the last one
  $('actEnd').value = '';
  dirty = true; paint();
  $('actName').focus();
};
$('saveBtn').onclick = async () => {
  $('saveBtn').disabled = true; $('saveBtn').textContent = 'Saving…';
  try {
    await F.save(crew.gid, fest);
    dirty = false;
    C.toast('Saved');
    if (confirm('Share this timetable so other crews going to the same festival start from it?\n\nIt only ever prefills new crews — nobody can change yours.'))
      await F.libraryPublish(F.slugFor(meta.festName, meta.year), fest).catch(() => {});
  } catch (e) { C.toast("Couldn't save — " + (e.message || '')); }
  paint();
};
