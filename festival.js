/* MoshPin — festival data.
   A festival document describes one event: its days, its venues and its acts.
   Crews hold their own forked copy, so one crew editing can never disturb
   another mid-weekend. The shared library only ever prefills new crews. */
import * as C from './core.js';

/* ---------- shape ----------
{
  name, year, place, tz,
  days:   [ {date:'2027-07-30', start:11, hours:14} ],   // start hour, length
  venues: [ {id, name, type:'stage'|'spot'} ],
  acts:   { actId: {d, v, s, e, n, u} }                  // day, venue, start, end, name, url
}
Sets after midnight are handled by `hours`: a day that opens at 11:00 and runs
14 hours ends at 01:00, and a 00:30 set belongs to that day, not the next. */

export const DEFAULT_TZ = 'Europe/Amsterdam';

export function blank(name, year) {
  return {
    name: name || 'Festival', year: +year || new Date().getFullYear(),
    place: '', tz: DEFAULT_TZ,
    days: [], venues: [], acts: {}
  };
}

export const newId = () => C.randomCode(6).toLowerCase();

/* ---------- load & save ---------- */
/* A timetable is ~20 KB and almost never changes, so we keep a version stamp
   beside it. Loading reads the stamp (a few bytes) and only pulls the document
   when it has actually moved on. A returning phone downloads nothing at all. */
export async function load(gid) {
  const cached = C.cacheGet('fest:' + gid);
  const cachedV = C.cacheGet('festv:' + gid);
  let fest = null;
  if (cached) { try { fest = JSON.parse(cached); } catch (e) {} }

  let liveV = null;
  try { liveV = (await C.ref('groups/' + gid + '/festv').get()).val(); } catch (e) { return fest; }

  if (fest && liveV != null && String(liveV) === String(cachedV)) return fest;   // unchanged

  try {
    const live = (await C.ref('groups/' + gid + '/festival').get()).val();
    if (live) {
      fest = normalise(live);
      C.cacheSet('fest:' + gid, JSON.stringify(fest));
      C.cacheSet('festv:' + gid, String(liveV == null ? Date.now() : liveV));
    }
  } catch (e) { /* offline — the cached copy stands */ }
  return fest;
}
export async function save(gid, fest) {
  const clean = normalise(fest);
  const v = Date.now();
  await C.ref('groups/' + gid + '/festival').set(clean);
  try { await C.ref('groups/' + gid + '/festv').set(v); } catch (e) {}
  C.cacheSet('fest:' + gid, JSON.stringify(clean));
  C.cacheSet('festv:' + gid, String(v));
  return clean;
}

/* Firebase drops empty objects and arrays, so rebuild them on the way in. */
export function normalise(f) {
  const out = Object.assign(blank(f.name, f.year), f);
  out.tz = f.tz || DEFAULT_TZ;
  out.days = Array.isArray(f.days) ? f.days.slice() : [];
  out.venues = Array.isArray(f.venues) ? f.venues.slice() : [];
  out.acts = (f.acts && typeof f.acts === 'object') ? f.acts : {};
  out.days.forEach(d => { d.start = +d.start || 11; d.hours = +d.hours || 12; });
  return out;
}

/* ---------- shared library ----------
   Keyed by festival + year, so a second crew going to the same event is offered
   what the first one built. Copies are taken, never referenced. */
export const slugFor = (name, year) => C.slugify(name) + '-' + (+year);

export async function libraryGet(slug) {
  try {
    const s = await C.ref('library/' + slug).get();
    const v = s.val();
    return v ? normalise(v) : null;
  } catch (e) { return null; }
}
export async function libraryPublish(slug, fest) {
  const clean = normalise(fest);
  clean.updatedAt = Date.now();
  await C.ref('library/' + slug).set(clean);
  return clean;
}

/* ---------- days ---------- */
export function addDay(fest, date, start, hours) {
  fest.days.push({ date, start: +start || 11, hours: +hours || 12 });
  fest.days.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return fest;
}
export function removeDay(fest, idx) {
  fest.days.splice(idx, 1);
  for (const id of Object.keys(fest.acts)) {
    const a = fest.acts[id];
    if (a.d === idx) delete fest.acts[id];
    else if (a.d > idx) a.d--;
  }
  return fest;
}
export const dayLabel = (d) => {
  if (!d || !d.date) return '';
  const [y, m, dd] = d.date.split('-').map(Number);
  const nm = new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString('en-GB',
    { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return nm;
};
export const dayEndsNextDay = d => (d.start + d.hours) > 24;

/* ---------- venues ---------- */
export function addVenue(fest, name, type) {
  const v = { id: newId(), name: String(name || '').trim() || 'Stage', type: type === 'spot' ? 'spot' : 'stage' };
  fest.venues.push(v);
  return v;
}
export function removeVenue(fest, id) {
  fest.venues = fest.venues.filter(v => v.id !== id);
  for (const k of Object.keys(fest.acts)) if (fest.acts[k].v === id) delete fest.acts[k];
  return fest;
}
export const venue = (fest, id) => fest.venues.find(v => v.id === id) || null;
export const stages = fest => fest.venues.filter(v => v.type === 'stage');
export const spots = fest => fest.venues.filter(v => v.type === 'spot');

/* ---------- acts ---------- */
export function addAct(fest, { d, v, s, e, n, u }) {
  const id = newId();
  fest.acts[id] = { d: +d, v, s, e, n: String(n || '').trim(), u: u || null };
  return id;
}
export function actsOf(fest, dayIdx, venueId) {
  return Object.entries(fest.acts)
    .filter(([, a]) => a.d === dayIdx && (!venueId || a.v === venueId))
    .map(([id, a]) => Object.assign({ id }, a))
    .sort((x, y) => offset(fest, x) - offset(fest, y));
}
/* minutes from the start of that festival day — this is what makes a 01:00 set
   sit at the bottom of the grid rather than wrapping to the morning */
export function offset(fest, act) {
  const day = fest.days[act.d];
  if (!day) return 0;
  return C.offsetInDay(act.s, day.start);
}
export function endOffset(fest, act) {
  const day = fest.days[act.d];
  if (!day) return 0;
  let o = C.offsetInDay(act.e, day.start);
  if (o <= C.offsetInDay(act.s, day.start)) o += 1440;   // ends after midnight
  return o;
}

/* which day is running right now, and how far into it — in festival-local time */
export const currentDay = fest => C.currentDay(fest.days, fest.tz);
export const hasStarted = fest => C.festivalStarted(fest.days, fest.tz);
export const isOver = fest => C.festivalOver(fest.days, fest.tz);

/* what is playing on a venue right now */
export function nowOn(fest, venueId) {
  const cur = currentDay(fest);
  if (!cur) return null;
  return actsOf(fest, cur.idx, venueId)
    .find(a => offset(fest, a) <= cur.into && cur.into < endOffset(fest, a)) || null;
}

/* ---------- checks ---------- */
export function problems(fest) {
  const out = [];
  if (!fest.days.length) out.push('No days yet — add at least one.');
  if (!fest.venues.length) out.push('No stages yet — add at least one.');
  for (const [id, a] of Object.entries(fest.acts)) {
    if (!fest.days[a.d]) out.push(`"${a.n}" is on a day that no longer exists.`);
    if (!venue(fest, a.v)) out.push(`"${a.n}" is at a venue that no longer exists.`);
    if (C.hhmmToMin(a.s) == null || C.hhmmToMin(a.e) == null) out.push(`"${a.n}" has an unreadable time.`);
    else {
      const day = fest.days[a.d];
      if (day && endOffset(fest, Object.assign({ id }, a)) > day.hours * 60)
        out.push(`"${a.n}" finishes after the day ends — extend the day's length.`);
    }
  }
  return out;
}
