// Work hours are Sun-Thu 09:00-19:00 local time. Everything else counts as home.

export type Place = 'work' | 'home'

export interface Conditions {
  place?: Place
}

export function placeAt(date: Date): Place {
  const day = date.getDay() // 0 = Sunday, 5 = Friday, 6 = Saturday
  const hour = date.getHours()
  const workDay = day >= 0 && day <= 4
  return workDay && hour >= 9 && hour < 19 ? 'work' : 'home'
}
