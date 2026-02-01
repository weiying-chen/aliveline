export function pad2(n: number) {
  return String(n).padStart(2, '0')
}

export function fmtDateTime(d: Date) {
  const hours24 = d.getHours()
  const hours12 = hours24 % 12 || 12
  const ampm = hours24 < 12 ? 'AM' : 'PM'
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${hours12}:${pad2(d.getMinutes())} ${ampm}`
}

export function fmtDateTimeWithWeekday(d: Date) {
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const weekday = weekdays[d.getDay()] ?? ''
  const hours24 = d.getHours()
  const hours12 = hours24 % 12 || 12
  const ampm = hours24 < 12 ? 'AM' : 'PM'
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} (${weekday}), ${hours12}:${pad2(d.getMinutes())} ${ampm}`
}

export function fmtTime(d: Date) {
  const hours24 = d.getHours()
  const hours12 = hours24 % 12 || 12
  const ampm = hours24 < 12 ? 'AM' : 'PM'
  return `${hours12}:${pad2(d.getMinutes())} ${ampm}`
}

export function toDatetimeLocalValue(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

export function parseDatetimeLocalValue(v: string) {
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

export function msToParts(ms: number) {
  const abs = Math.abs(ms)

  const totalSeconds = Math.floor(abs / 1000)
  const seconds = totalSeconds % 60

  const totalMinutes = Math.floor(totalSeconds / 60)
  const minutes = totalMinutes % 60

  const totalHours = Math.floor(totalMinutes / 60)
  const hours = totalHours % 24

  const days = Math.floor(totalHours / 24)

  return { days, hours, minutes, seconds }
}
