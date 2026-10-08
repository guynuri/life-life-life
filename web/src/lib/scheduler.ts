import { placeAt, type Conditions, type Place } from './conditions'

export type Kind = 'big' | 'work_day' | 'scheduled_small'

export interface Task {
  id: string
  kind: Kind
  duration_minutes: number
  deadline: Date | null
  conditions: Conditions
}

export interface Interval {
  start: Date
  end: Date
}

export interface Placement {
  taskId: string
  start: Date
  end: Date
  place: Place
}

export interface ScheduleResult {
  placements: Placement[]
  unplaced: { taskId: string; minutes: number }[]
}

// ponytail: big tasks are cut into fixed 60-minute sessions, add a per-task session length when that's not enough.
const SESSION_MINUTES = 60
const MIN = 60_000

interface Span {
  start: number
  end: number
}

function nextHour(t: number): number {
  const d = new Date(t)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime()
}

// Every hour the run touches must be in `place`. Work and home change on whole hours.
function staysIn(s: number, len: number, place: Place): boolean {
  for (let t = s; t < s + len; t = nextHour(t)) if (placeAt(new Date(t)) !== place) return false
  return true
}

// Earliest start >= from where a run of `len` ms sits inside free time, ends by `until`, and is in `place` if one is set.
function take(free: Span[], len: number, from: number, until: number, place?: Place): number | null {
  for (let i = 0; i < free.length; i++) {
    const f = free[i]
    const limit = Math.min(f.end, until)
    for (let s = Math.max(f.start, from); s + len <= limit; s = nextHour(s)) {
      if (place && !staysIn(s, len, place)) continue
      const rest: Span[] = []
      if (s > f.start) rest.push({ start: f.start, end: s })
      if (f.end > s + len) rest.push({ start: s + len, end: f.end })
      free.splice(i, 1, ...rest)
      return s
    }
  }
  return null
}

function sessions(t: Task): number[] {
  if (t.kind !== 'big') return [t.duration_minutes]
  const out: number[] = []
  for (let left = t.duration_minutes; left > 0; left -= SESSION_MINUTES) out.push(Math.min(left, SESSION_MINUTES))
  return out
}

// Pure: no DOM, no network. Earliest deadline first; big tasks spread their sessions across the time before the deadline.
export function schedule(tasks: Task[], free: Interval[], now: Date): ScheduleResult {
  const start = now.getTime()
  const spans: Span[] = free
    .map((f) => ({ start: Math.max(f.start.getTime(), start), end: f.end.getTime() }))
    .filter((f) => f.end > f.start)
    .sort((a, b) => a.start - b.start)
  const placements: Placement[] = []
  const unplaced: ScheduleResult['unplaced'] = []
  const byDeadline = (t: Task) => t.deadline?.getTime() ?? Infinity
  const order = [...tasks].sort((a, b) => byDeadline(a) - byDeadline(b))

  for (const task of order) {
    const place = task.kind === 'work_day' ? 'work' : task.conditions.place
    const until = byDeadline(task)
    const lens = sessions(task)
    for (let i = 0; i < lens.length; i++) {
      const len = lens[i] * MIN
      const from = until === Infinity ? start : start + (i * (until - start)) / lens.length
      const s = take(spans, len, from, until, place) ?? take(spans, len, start, until, place)
      if (s === null) {
        unplaced.push({ taskId: task.id, minutes: lens.slice(i).reduce((a, b) => a + b, 0) })
        break
      }
      placements.push({ taskId: task.id, start: new Date(s), end: new Date(s + len), place: placeAt(new Date(s)) })
    }
  }
  return { placements, unplaced }
}
