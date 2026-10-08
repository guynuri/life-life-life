// Run from web/: write an entry file that imports and calls checks(), bundle it, run it:
//   npx esbuild <entry>.ts --bundle --platform=node --format=esm --outfile=check.mjs && node check.mjs
import { placeAt } from './conditions'
import { schedule, type Task } from './scheduler'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`check failed: ${msg}`)
}

const at = (y: number, mo: number, d: number, h = 0, m = 0) => new Date(y, mo, d, h, m)
const MON = at(2026, 9, 12) // 2026-10-12 is a Monday; asserted below

export function checks(): void {
  assert(MON.getDay() === 1, 'test date must be a Monday')

  // Work-hours rule
  assert(placeAt(at(2026, 9, 12, 9)) === 'work', 'Mon 09:00 is work')
  assert(placeAt(at(2026, 9, 12, 18, 59)) === 'work', 'Mon 18:59 is work')
  assert(placeAt(at(2026, 9, 12, 19)) === 'home', 'Mon 19:00 is home')
  assert(placeAt(at(2026, 9, 12, 8, 59)) === 'home', 'Mon 08:59 is home')
  assert(placeAt(at(2026, 9, 18, 10)) === 'work', 'Sun 10:00 is work')
  assert(placeAt(at(2026, 9, 15, 10)) === 'work', 'Thu 10:00 is work')

  // Weekend rule: Fri and Sat are days off
  assert(placeAt(at(2026, 9, 16, 10)) === 'home', 'Fri 10:00 is home')
  assert(placeAt(at(2026, 9, 17, 10)) === 'home', 'Sat 10:00 is home')

  const dayFree = [{ start: at(2026, 9, 12, 0), end: at(2026, 9, 13, 0) }]
  const task = (o: Partial<Task> & { id: string }): Task => ({
    kind: 'scheduled_small',
    duration_minutes: 60,
    deadline: null,
    conditions: {},
    ...o,
  })

  // Work task lands in work hours only, even with home time free before it
  let r = schedule([task({ id: 'w', kind: 'work_day' })], [{ start: at(2026, 9, 12, 8), end: at(2026, 9, 12, 21) }], MON)
  assert(r.placements.length === 1 && r.unplaced.length === 0, 'work task placed')
  assert(r.placements[0].start.getTime() === at(2026, 9, 12, 9).getTime(), 'work task at 09:00')
  assert(placeAt(r.placements[0].start) === 'work', 'work task starts in work hours')

  // Home-only task takes the early home slot
  r = schedule([task({ id: 'h', conditions: { place: 'home' } })], [{ start: at(2026, 9, 12, 8), end: at(2026, 9, 12, 21) }], MON)
  assert(r.placements[0].start.getTime() === at(2026, 9, 12, 8).getTime(), 'home task at 08:00')
  assert(placeAt(r.placements[0].start) === 'home', 'home task starts at home')

  // Work task cannot use the 2h window that is only 1h of work time
  r = schedule([task({ id: 'w2', kind: 'work_day', duration_minutes: 120 })], [{ start: at(2026, 9, 12, 18), end: at(2026, 9, 12, 20) }], MON)
  assert(r.placements.length === 0 && r.unplaced[0]?.minutes === 120, 'work task does not spill past 19:00')

  // Unrestricted task may span the work/home boundary
  r = schedule([task({ id: 'any', duration_minutes: 120 })], [{ start: at(2026, 9, 12, 18), end: at(2026, 9, 12, 20) }], MON)
  assert(r.placements.length === 1 && r.placements[0].start.getTime() === at(2026, 9, 12, 18).getTime(), 'unrestricted spans boundary')

  // Two work tasks do not overlap
  r = schedule([task({ id: 'a', kind: 'work_day' }), task({ id: 'b', kind: 'work_day' })], dayFree, MON)
  assert(r.placements.length === 2, 'two work tasks placed')
  assert(r.placements[1].start.getTime() >= r.placements[0].end.getTime(), 'no overlap')

  // Deadline is respected: a 60 min run starting 08:00 ends 09:00, after the 08:30 deadline
  r = schedule([task({ id: 'd', deadline: at(2026, 9, 12, 8, 30) })], [{ start: at(2026, 9, 12, 8), end: at(2026, 9, 12, 21) }], MON)
  assert(r.placements.length === 0 && r.unplaced.length === 1, 'deadline blocks placement')

  // Big task: 150 min -> 60+60+30, spread over the 4 days before a Friday deadline
  const now = at(2026, 9, 12, 0)
  const friday = at(2026, 9, 16, 0)
  const wide = [{ start: now, end: at(2026, 9, 17, 0) }]
  r = schedule([task({ id: 'big', kind: 'big', duration_minutes: 150, deadline: friday })], wide, now)
  assert(r.placements.length === 3, 'big task split into 3 sessions')
  assert(r.placements.reduce((a, p) => a + (p.end.getTime() - p.start.getTime()), 0) === 150 * 60_000, 'big task total minutes kept')
  assert(r.placements.every((p) => p.end.getTime() <= friday.getTime()), 'big task before deadline')
  const sorted = r.placements.every((p, i) => i === 0 || p.start >= r.placements[i - 1].end)
  assert(sorted, 'big task sessions do not overlap')
  const spanMs = r.placements[2].start.getTime() - r.placements[0].start.getTime()
  assert(spanMs > (friday.getTime() - now.getTime()) / 2, 'big task sessions spread over more than half the window')

  // Earliest deadline goes first when two tasks compete for the same slot
  r = schedule(
    [task({ id: 'late', deadline: at(2026, 9, 14) }), task({ id: 'soon', deadline: at(2026, 9, 13) })],
    [{ start: at(2026, 9, 12, 8), end: at(2026, 9, 12, 9) }],
    MON,
  )
  assert(r.placements.length === 1 && r.placements[0].taskId === 'soon', 'earliest deadline wins the slot')
  assert(r.unplaced[0]?.taskId === 'late', 'loser reported unplaced')

  // Atomic: a 150-min task with only 120 min free places nothing, not a partial
  r = schedule([task({ id: 'half', kind: 'big', duration_minutes: 150 })], [{ start: at(2026, 9, 12, 0), end: at(2026, 9, 12, 2) }], MON)
  assert(r.placements.length === 0 && r.unplaced[0]?.minutes === 150, 'big task placed whole or not at all')

  // Nothing free on Saturday for a work task -> unplaced
  r = schedule([task({ id: 'sat', kind: 'work_day' })], [{ start: at(2026, 9, 17, 0), end: at(2026, 9, 18, 0) }], MON)
  assert(r.placements.length === 0 && r.unplaced[0]?.taskId === 'sat', 'weekend work task unplaced')
}
