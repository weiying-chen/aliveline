import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { AccordionItem } from './components/Accordion'
import { AssignmentRow } from './components/AssignmentRow'
import { DateTimeInput, snapToWorkTime } from './components/DateTimeInput'
import { TimePartsInput } from './components/TimePartsInput'
import { CompactTimePartsInput } from './components/CompactTimePartsInput'
import { buildAssignment } from './utils/assignmentModel'
import { formatDeadlineExtensionMessage, formatDuration, type AssignmentEntry } from './utils/deadlineHistory'
import { formatNextAssignmentMessage } from './utils/nextAssignmentMessage'
import {
  fmtDateTimeWithWeekday,
  fmtTime,
  msToParts,
  pad2,
  parseDatetimeLocalValue,
  toDatetimeLocalValue,
} from './utils/time'
import { updateRecentAssignmentNames } from './utils/assignmentNameHistory'
import {
  calculateAssignmentFinishTimes as calculateAssignmentFinishTimes,
  minutesFromTimeParts,
  pickAssignmentBatchBase as pickAssignmentBatchBase,
  pickAssignmentFinishStart as pickAssignmentFinishStart,
} from './utils/assignmentTime'
import {
  atLocalTime,
  addWorkMinutes,
  isInWorkTime,
  nextWorkStart,
  shouldShowEarlyFinishReminder,
  shouldShowDeadlineExtensionReminder,
  workMsBetween,
  WORK_BLOCKS,
} from './utils/workTime'

type PickerInput = HTMLInputElement
type DeadlineInputMode = 'direct' | 'duration'

type AppProps = {
  selectedAssignmentId?: string
  showTopNav?: boolean
  persistAssignments?: boolean
  renderMessagesOnly?: boolean
  showMessagesSection?: boolean
}

const LS_DEADLINE_KEY = 'aliveline:deadline-iso'
const LS_RECENT_ASSIGNMENTS_KEY = 'aliveline:recent-assignments'
const LS_CHANGE_BASE_KEY = 'aliveline:change-base-deadline-iso'
const LS_ASSIGNMENT_FINISH_BASE_KEY = 'aliveline:assignment-finish-base-iso'
const LS_PANEL_ASSIGNMENT_HISTORY_OPEN_KEY = 'aliveline:panel-assignment-history-open'
const LS_PANEL_ASSIGNMENTS_OPEN_KEY = 'aliveline:panel-assignments-open'
const LS_PANEL_NEXT_ASSIGNMENT_MESSAGE_OPEN_KEY = 'aliveline:panel-next-assignment-message-open'
const LS_DAILY_CLEAR_KEY = 'aliveline:daily-clear'
const LS_REMINDER_NOTIFIED_KEY = 'aliveline:reminder-notified'
const LS_REMINDER_REQUESTED_KEY = 'aliveline:reminder-requested'
const LS_DEADLINE_EXTENSION_REMINDER_NOTIFIED_KEY = 'aliveline:deadline-extension-reminder-notified'
const LS_DEADLINE_EXTENSION_REMINDER_REQUESTED_KEY = 'aliveline:deadline-extension-reminder-requested'
const LS_ASSIGNMENTS_KEY = 'aliveline:assignments'
const ADJUSTED_ASSIGNMENT_MULTIPLIER = 0.8

function adjustedAssignmentMinutes(rawMinutes: number) {
  if (rawMinutes <= 0) return 0
  return Math.max(1, Math.round(rawMinutes * ADJUSTED_ASSIGNMENT_MULTIPLIER))
}

function adjustedDeadlineDurationMinutes(rawMinutes: number) {
  if (rawMinutes <= 0) return 0
  return adjustedAssignmentMinutes(rawMinutes)
}

function officialDeadlineFromAddedAssignments(baseDeadline: Date, rawAssignments: AssignmentEntry[]) {
  const adjustedTotalMinutes = rawAssignments.reduce(
    (sum, item) => sum + adjustedAssignmentMinutes(item.minutes),
    0
  )
  return addWorkMinutes(baseDeadline, adjustedTotalMinutes)
}

function deadlineWorkMinutes(start: Date, deadline: Date) {
  return Math.round(workMsBetween(start, deadline) / 60000)
}

function deadlineFromAdjustedDuration(start: Date, rawMinutes: number) {
  const effectiveStart = snapToWorkTime(start)
  return addWorkMinutes(effectiveStart, adjustedDeadlineDurationMinutes(rawMinutes))
}

function deadlineFromDurationInputs(
  startInput: string,
  hoursInput: string,
  minutesInput: string
) {
  const start = parseDatetimeLocalValue(startInput)
  if (!start) return null

  const parsedHours =
    hoursInput.trim().length === 0 ? 0 : Math.max(0, Math.floor(Number(hoursInput)))
  const parsedMinutes =
    minutesInput.trim().length === 0 ? 0 : Math.max(0, Math.floor(Number(minutesInput)))
  if (!Number.isFinite(parsedHours) || !Number.isFinite(parsedMinutes)) return null

  return deadlineFromAdjustedDuration(start, parsedHours * 60 + parsedMinutes)
}

function readStoredDate(key: string) {
  const saved = localStorage.getItem(key)
  if (!saved) return null
  const d = new Date(saved)
  return Number.isNaN(d.getTime()) ? null : d
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function sanitizeAssignmentEntries(entries: unknown) {
  if (!Array.isArray(entries)) return [] as AssignmentEntry[]
  return entries.filter(
    (item) => typeof item?.text === 'string' && Number.isFinite(item?.minutes) && item.minutes > 0
  ) as AssignmentEntry[]
}

type StoredAssignmentsV2 = {
  assignments: StoredAssignment[]
}

type AssignmentStateSnapshot = {
  assignments: StoredAssignment[]
  deadline: string
  assignmentTitle: string
  createdAt?: string
  owner: string
  workMinutes?: number
  contentMinutes?: number
  contentSeconds?: number
  relatedAssignments: AssignmentEntry[]
  comments: string[]
}

type StoredAssignment = {
  id: string
  title: string
  createdAt?: string
  owner?: string
  deadline: string
  workMinutes?: number
  contentMinutes?: number
  contentSeconds?: number
  comments: string[]
  children: StoredAssignment[]
}

function normalizeStoredAssignment(input: unknown): StoredAssignment | null {
  if (!input || typeof input !== 'object') return null
  const item = input as Record<string, unknown>
  if (typeof item.id !== 'string') return null
  if (typeof item.title !== 'string') return null
  if (typeof item.deadline !== 'string') return null
  const comments = Array.isArray(item.comments)
    ? item.comments.filter((comment): comment is string => typeof comment === 'string').map((comment) => comment.trim()).filter(Boolean)
    : []
  const owner =
    typeof item.owner === 'string' && item.owner.trim().length > 0 ? item.owner.trim() : undefined
  const createdAt =
    typeof item.createdAt === 'string' && !Number.isNaN(new Date(item.createdAt).getTime())
      ? item.createdAt
      : undefined
  const workMinutes =
    typeof item.workMinutes === 'number' && Number.isFinite(item.workMinutes) && item.workMinutes >= 0
      ? Math.round(item.workMinutes)
      : undefined
  const contentMinutes =
    typeof item.contentMinutes === 'number' && Number.isFinite(item.contentMinutes) && item.contentMinutes >= 0
      ? Math.round(item.contentMinutes)
      : undefined
  const contentSeconds =
    typeof item.contentSeconds === 'number' && Number.isFinite(item.contentSeconds) && item.contentSeconds >= 0
      ? Math.round(item.contentSeconds)
      : undefined
  const resolvedContentSeconds =
    typeof contentSeconds === 'number'
      ? contentSeconds
      : typeof contentMinutes === 'number'
        ? contentMinutes * 60
        : undefined
  const resolvedContentMinutes =
    typeof contentMinutes === 'number'
      ? contentMinutes
      : typeof resolvedContentSeconds === 'number'
        ? Math.round(resolvedContentSeconds / 60)
        : undefined
  const childrenInput = Array.isArray(item.children) ? item.children : []
  const children = childrenInput
    .map((child) => normalizeStoredAssignment(child))
    .filter((child): child is StoredAssignment => Boolean(child))
  return {
    id: item.id,
    title: item.title.trim(),
    ...(typeof createdAt === 'string' ? { createdAt } : {}),
    ...(owner ? { owner } : {}),
    deadline: item.deadline,
    ...(typeof workMinutes === 'number' ? { workMinutes } : {}),
    ...(typeof resolvedContentMinutes === 'number'
      ? { contentMinutes: resolvedContentMinutes }
      : {}),
    ...(typeof resolvedContentSeconds === 'number'
      ? { contentSeconds: resolvedContentSeconds }
      : {}),
    comments,
    children,
  }
}

function readStoredAssignmentsState(selectedAssignmentId?: string) {
  const saved = localStorage.getItem(LS_ASSIGNMENTS_KEY)
  if (!saved) return null
  try {
    const parsed = JSON.parse(saved) as {
      assignments?: unknown
    }
    if (!Array.isArray(parsed.assignments)) return null
    const assignments = parsed.assignments
      .map((item) => normalizeStoredAssignment(item))
      .filter((item): item is StoredAssignment => Boolean(item))
    if (assignments.length === 0) return null
    const current =
      assignments.find((assignment) => assignment.id === selectedAssignmentId) ?? assignments[0]
    const relatedAssignments = current.children
      .map((child) => ({ text: child.title, minutes: child.workMinutes ?? 0 }))
      .filter((item) => item.text.trim().length > 0 && item.minutes > 0)
    if (Number.isNaN(new Date(current.deadline).getTime())) return null
    return {
      assignments,
      deadline: current.deadline,
      assignmentTitle: current.title,
      ...(typeof current.createdAt === 'string' ? { createdAt: current.createdAt } : {}),
      owner: current.owner ?? '',
      ...(typeof current.workMinutes === 'number' ? { workMinutes: current.workMinutes } : {}),
      ...(typeof current.contentMinutes === 'number'
        ? { contentMinutes: current.contentMinutes }
        : {}),
      ...(typeof current.contentSeconds === 'number'
        ? { contentSeconds: current.contentSeconds }
        : {}),
      relatedAssignments: sanitizeAssignmentEntries(relatedAssignments),
      comments: current.comments ?? [],
    } as AssignmentStateSnapshot
  } catch {
    return null
  }
}

function readPreviousAssignmentFinalDeadline(
  assignments: StoredAssignment[],
  selectedAssignmentId?: string
) {
  if (assignments.length === 0) return null
  const selectedIndex = selectedAssignmentId
    ? assignments.findIndex((assignment) => assignment.id === selectedAssignmentId)
    : 0
  const currentIndex = selectedIndex >= 0 ? selectedIndex : 0
  const previousAssignment = assignments[currentIndex + 1]
  if (!previousAssignment) return null
  const previousDeadline = new Date(previousAssignment.deadline)
  if (Number.isNaN(previousDeadline.getTime())) return null
  return previousDeadline
}

function buildStoredAssignments(
  assignmentId: string,
  createdAt: string,
  deadline: Date,
  assignmentTitle: string,
  owner: string,
  workMinutes: number | undefined,
  contentMinutes: number | undefined,
  contentSeconds: number | undefined,
  relatedAssignments: AssignmentEntry[],
  assignmentFinishTimes: Date[],
  comments: string[]
) : StoredAssignment {
  const childAssignmentEntries = relatedAssignments.map((item, index) =>
    normalizeStoredAssignment(buildAssignment({
      id: `${assignmentId}-item-${index}`,
      title: item.text,
      deadline: (assignmentFinishTimes[index] ?? deadline).toISOString(),
      workMinutes: item.minutes,
      comments: [],
    })) as StoredAssignment
  )

  const root = normalizeStoredAssignment(buildAssignment({
    id: assignmentId,
    title: assignmentTitle,
    createdAt,
    owner,
    deadline: deadline.toISOString(),
    ...(typeof workMinutes === 'number' ? { workMinutes } : {}),
    ...(typeof contentMinutes === 'number' ? { contentMinutes } : {}),
    ...(typeof contentSeconds === 'number' ? { contentSeconds } : {}),
    comments,
  })) as StoredAssignment
  return {
    ...root,
    children: childAssignmentEntries,
  }
}

function replaceTopLevelAssignment(
  existingAssignments: StoredAssignment[],
  assignmentId: string,
  nextAssignment: StoredAssignment
) {
  let replaced = false
  const next = existingAssignments.map((assignment) => {
    if (assignment.id !== assignmentId) return assignment
    replaced = true
    return nextAssignment
  })
  if (replaced) return next
  return [nextAssignment, ...existingAssignments]
}

function readStoredStringList(key: string) {
  const saved = localStorage.getItem(key)
  if (!saved) return [] as string[]
  try {
    const parsed = JSON.parse(saved) as string[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item) => typeof item === 'string' && item.trim().length > 0)
  } catch {
    return []
  }
}

function isNonNegativeInteger(value: string) {
  return /^\d+$/.test(value)
}

function readStoredBool(key: string, fallback: boolean) {
  const saved = localStorage.getItem(key)
  if (saved === null) return fallback
  return saved === 'true'
}

function readLatestAssignment(relatedAssignments: AssignmentEntry[], assignmentFinishTimes: Date[]) {
  for (let i = relatedAssignments.length - 1; i >= 0; i -= 1) {
    const title = relatedAssignments[i]?.text?.trim()
    const deadline = assignmentFinishTimes[i]
    if (!title) continue
    if (!deadline || Number.isNaN(deadline.getTime())) continue
    return { title, deadline }
  }
  return null
}

function downloadTextFile(fileName: string, content: string, contentType: string) {
  const blob = new Blob([content], { type: contentType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export default function App({
  selectedAssignmentId,
  showTopNav = true,
  persistAssignments = true,
  renderMessagesOnly = false,
  showMessagesSection = true,
}: AppProps = {}) {
  const deadlineRef = useRef<PickerInput | null>(null)
  const durationStartRef = useRef<PickerInput | null>(null)
  const importAssignmentsInputRef = useRef<HTMLInputElement | null>(null)
  const fallbackAssignmentIdRef = useRef(`assignment-${Date.now()}`)
  const storedAssignmentsState = useMemo(
    () => readStoredAssignmentsState(selectedAssignmentId),
    [selectedAssignmentId]
  )

  const [now, setNow] = useState(() => new Date())
  const [deadline, setDeadline] = useState(
    () => readStoredDate(LS_DEADLINE_KEY) ?? (storedAssignmentsState ? new Date(storedAssignmentsState.deadline) : new Date())
  )
  const [relatedAssignments, setChildAssignments] = useState<AssignmentEntry[]>(() => storedAssignmentsState?.relatedAssignments ?? [])
  const [recentAssignments, setRecentAssignments] = useState<string[]>(() =>
    readStoredStringList(LS_RECENT_ASSIGNMENTS_KEY)
  )
  const [changeBaseDeadline, setChangeBaseDeadline] = useState<Date | null>(() =>
    readStoredDate(LS_CHANGE_BASE_KEY)
  )
  const [assignmentFinishBase, setAssignmentFinishBase] = useState<Date | null>(() =>
    readStoredDate(LS_ASSIGNMENT_FINISH_BASE_KEY)
  )
  const [assignmentName, setAssignmentName] = useState('')
  const [assignmentHours, setAssignmentHours] = useState('')
  const [assignmentMinutes, setAssignmentMinutes] = useState('')
  const [isRecentOpen, setIsRecentOpen] = useState(false)
  const [recentActiveIndex, setRecentActiveIndex] = useState<number>(-1)
  const [deadlineExtensionAssignment, setDeadlineExtensionAssignment] = useState(
    () => storedAssignmentsState?.assignmentTitle ?? ''
  )
  const [createdAt] = useState<string>(
    () => storedAssignmentsState?.createdAt ?? new Date().toISOString()
  )
  const [assignmentOwner, setAssignmentOwner] = useState(() => storedAssignmentsState?.owner ?? '')
  const [workMinutes, setWorkMinutes] = useState<number | undefined>(() => storedAssignmentsState?.workMinutes)
  const [contentMinutes, setContentMinutes] = useState<number | undefined>(
    () =>
      storedAssignmentsState?.contentMinutes ??
      (typeof storedAssignmentsState?.contentSeconds === 'number'
        ? Math.round(storedAssignmentsState.contentSeconds / 60)
        : undefined)
  )
  const [contentSeconds, setContentSeconds] = useState<number | undefined>(
    () => storedAssignmentsState?.contentSeconds
  )
  const contentLengthMinutesInput = useMemo(() => {
    if (typeof contentSeconds === 'number') return String(Math.floor(contentSeconds / 60))
    if (typeof contentMinutes === 'number') return String(contentMinutes)
    return ''
  }, [contentMinutes, contentSeconds])
  const contentLengthSecondsInput = useMemo(() => {
    if (typeof contentSeconds === 'number') return String(contentSeconds % 60).padStart(2, '0')
    if (typeof contentMinutes === 'number') return '00'
    return ''
  }, [contentMinutes, contentSeconds])
  const [deadlineExtensionCopyState, setDeadlineExtensionCopyState] = useState<
    'idle' | 'copied' | 'failed'
  >('idle')
  const [nextAssignmentCopyState, setNextAssignmentCopyState] = useState<
    'idle' | 'copied' | 'failed'
  >('idle')
  const [importAssignmentsState, setImportAssignmentsState] = useState<'idle' | 'imported' | 'failed'>('idle')
  const [isAssignmentHistoryPanelOpen, setIsAssignmentHistoryPanelOpen] = useState(() =>
    readStoredBool(LS_PANEL_ASSIGNMENT_HISTORY_OPEN_KEY, false)
  )
  const [isAssignmentsPanelOpen, setIsAssignmentsPanelOpen] = useState(() =>
    readStoredBool(LS_PANEL_ASSIGNMENTS_OPEN_KEY, false)
  )
  const [isNextAssignmentPanelOpen, setIsNextAssignmentPanelOpen] = useState(() =>
    readStoredBool(LS_PANEL_NEXT_ASSIGNMENT_MESSAGE_OPEN_KEY, false)
  )
  const [isAddAssignmentFormOpen, setIsAddAssignmentFormOpen] = useState(false)
  const [isCommentsFormOpen, setIsCommentsFormOpen] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [comments, setComments] = useState<string[]>(() => storedAssignmentsState?.comments ?? [])
  const [historyMonth, setHistoryMonth] = useState(() =>
    `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`
  )
  const [deadlineInputMode, setDeadlineInputMode] = useState<DeadlineInputMode>('direct')
  const [directDeadlineInput, setDirectDeadlineInput] = useState(() => toDatetimeLocalValue(deadline))
  const [durationStartInput, setDurationStartInput] = useState(() => toDatetimeLocalValue(deadline))
  const [durationHoursInput, setDurationHoursInput] = useState('')
  const [durationMinutesInput, setDurationMinutesInput] = useState('')

  const projectionAssignments = useMemo(() => relatedAssignments, [relatedAssignments])

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const current = new Date()
    const dayStart = new Date(current)
    dayStart.setHours(0, 0, 0, 0)
    const firstBlock = WORK_BLOCKS[0]
    const lastBlock = WORK_BLOCKS[WORK_BLOCKS.length - 1]
    const reminderStart = atLocalTime(dayStart, firstBlock.start)
    const reminderEnd = new Date(reminderStart)
    reminderEnd.setMinutes(reminderEnd.getMinutes() + 60)
    const cutoff = atLocalTime(dayStart, lastBlock.end)
    const firedKey = localStorage.getItem(LS_REMINDER_NOTIFIED_KEY)
    console.log(
      `[reminder] window ${fmtTime(reminderStart)}–${fmtTime(reminderEnd)}; cutoff ${fmtTime(cutoff)}; fired ${firedKey === dateKey(current) ? 'yes' : 'no'}`
    )
  }, [])

  useEffect(() => {
    localStorage.setItem(LS_DEADLINE_KEY, deadline.toISOString())
  }, [deadline])

  useEffect(() => {
    localStorage.setItem(LS_RECENT_ASSIGNMENTS_KEY, JSON.stringify(recentAssignments))
  }, [recentAssignments])

  useEffect(() => {
    if (changeBaseDeadline) {
      localStorage.setItem(LS_CHANGE_BASE_KEY, changeBaseDeadline.toISOString())
    } else {
      localStorage.removeItem(LS_CHANGE_BASE_KEY)
    }
  }, [changeBaseDeadline])

  useEffect(() => {
    if (assignmentFinishBase) {
      localStorage.setItem(LS_ASSIGNMENT_FINISH_BASE_KEY, assignmentFinishBase.toISOString())
    } else {
      localStorage.removeItem(LS_ASSIGNMENT_FINISH_BASE_KEY)
    }
  }, [assignmentFinishBase])

  useEffect(() => {
    const todayKey = dateKey(now)
    const savedKey = localStorage.getItem(LS_DAILY_CLEAR_KEY)
    if (savedKey === todayKey) return

    const cutoff = new Date(now)
    cutoff.setHours(17, 0, 0, 0)
    if (!savedKey && now.getTime() < cutoff.getTime()) return

    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)
    const yesterdayKey = dateKey(yesterday)

    if (now.getTime() < cutoff.getTime() && savedKey === yesterdayKey) return

    localStorage.setItem(
      LS_DAILY_CLEAR_KEY,
      now.getTime() >= cutoff.getTime() ? todayKey : yesterdayKey
    )
    const baseDeadlineForClear = changeBaseDeadline ?? readStoredDate(LS_CHANGE_BASE_KEY)
    if (baseDeadlineForClear) {
      // Daily clear should consume temporary affecting tasks and restore the base deadline.
      setDeadline(baseDeadlineForClear)
      setDirectDeadlineInput(toDatetimeLocalValue(baseDeadlineForClear))
      setDurationStartInput(toDatetimeLocalValue(baseDeadlineForClear))
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChildAssignments([])
    setAssignmentName('')
    setAssignmentHours('')
    setAssignmentMinutes('')
    setChangeBaseDeadline(null)
    setAssignmentFinishBase(null)
  }, [deadline, now])

  const workMsLeft = useMemo(() => workMsBetween(now, deadline), [now, deadline])
  const currentAssignmentMultiplier = ADJUSTED_ASSIGNMENT_MULTIPLIER
  const displayWorkMsLeft = workMsLeft
  const parts = useMemo(() => msToParts(displayWorkMsLeft), [displayWorkMsLeft])
  const displayDeadline = deadline
  const workStartAt = useMemo(() => (isInWorkTime(now) ? now : nextWorkStart(now)), [now])
  const showEarlyFinishReminder = useMemo(
    () => shouldShowEarlyFinishReminder(now, deadline),
    [deadline, now]
  )
  const showDeadlineExtensionReminder = useMemo(
    () => shouldShowDeadlineExtensionReminder(now, deadline, projectionAssignments.length > 0),
    [deadline, now, projectionAssignments.length]
  )
  const assignmentFinishStart = useMemo(
    () => pickAssignmentFinishStart(now, assignmentFinishBase),
    [now, assignmentFinishBase]
  )
  const assignmentFinishTimes = useMemo(
    () => calculateAssignmentFinishTimes(assignmentFinishStart, projectionAssignments),
    [projectionAssignments, assignmentFinishStart]
  )
  const adjustedAssignments = useMemo(
    () =>
      projectionAssignments.map((item) => ({
        ...item,
        minutes:
          currentAssignmentMultiplier === ADJUSTED_ASSIGNMENT_MULTIPLIER
            ? adjustedAssignmentMinutes(item.minutes)
            : item.minutes,
      })),
    [currentAssignmentMultiplier, projectionAssignments]
  )
  const adjustedAssignmentFinishTimes = useMemo(
    () => calculateAssignmentFinishTimes(assignmentFinishStart, adjustedAssignments),
    [adjustedAssignments, assignmentFinishStart]
  )
  useEffect(() => {
    if (!persistAssignments) return
    const targetAssignmentId =
      selectedAssignmentId ??
      storedAssignmentsState?.assignments[0]?.id ??
      fallbackAssignmentIdRef.current
    const nextAssignment = buildStoredAssignments(
      targetAssignmentId,
      createdAt,
      deadline,
      deadlineExtensionAssignment,
      assignmentOwner,
      workMinutes,
      contentMinutes,
      contentSeconds,
      relatedAssignments,
      assignmentFinishTimes,
      comments
    )
    const currentAssignmentsState = readStoredAssignmentsState()
    const assignments = replaceTopLevelAssignment(
      currentAssignmentsState?.assignments ?? [],
      targetAssignmentId,
      nextAssignment
    )
    const nextAssignmentsState: StoredAssignmentsV2 = {
      assignments,
    }
    localStorage.setItem(LS_ASSIGNMENTS_KEY, JSON.stringify(nextAssignmentsState))
  }, [
    assignmentOwner,
    createdAt,
    comments,
    deadline,
    deadlineExtensionAssignment,
    persistAssignments,
    selectedAssignmentId,
    storedAssignmentsState,
    relatedAssignments,
    assignmentFinishTimes,
    workMinutes,
    contentMinutes,
    contentSeconds,
  ])
  const exportAssignments = useMemo(() => storedAssignmentsState?.assignments ?? [], [storedAssignmentsState])
  const previousAssignmentFinalDeadline = useMemo(
    () => readPreviousAssignmentFinalDeadline(exportAssignments, selectedAssignmentId),
    [exportAssignments, selectedAssignmentId]
  )
  const plannedWorkHoursText = useMemo(
    () => String(Math.floor((workMinutes ?? 0) / 60)).padStart(2, '0'),
    [workMinutes]
  )
  const plannedWorkMinutesText = useMemo(
    () => String((workMinutes ?? 0) % 60).padStart(2, '0'),
    [workMinutes]
  )
  const exportHistoryMinutes = useMemo(
    () =>
      exportAssignments.reduce(
        (sum, assignment) =>
          sum +
          (assignment.workMinutes ?? 0) +
          assignment.children.reduce((childSum, child) => childSum + (child.workMinutes ?? 0), 0),
        0
      ),
    [exportAssignments]
  )

  useEffect(() => {
    if (!showEarlyFinishReminder) return
    if (typeof Notification === 'undefined') return

    const todayKey = dateKey(now)
    const notifiedKey = localStorage.getItem(LS_REMINDER_NOTIFIED_KEY)
    const requestedKey = localStorage.getItem(LS_REMINDER_REQUESTED_KEY)
    console.log(
      `[reminder] permission ${Notification.permission}; requested ${requestedKey === todayKey ? 'yes' : 'no'}; notified ${notifiedKey === todayKey ? 'yes' : 'no'}`
    )
    if (notifiedKey === todayKey) return

    const sendNotification = () => {
      new Notification('Reminder', {
        body: 'Ask for more work before 9:00 AM.',
      })
      localStorage.setItem(LS_REMINDER_NOTIFIED_KEY, todayKey)
    }

    if (Notification.permission === 'granted') {
      sendNotification()
      return
    }

    if (Notification.permission === 'denied') return

    if (requestedKey === todayKey) return
    localStorage.setItem(LS_REMINDER_REQUESTED_KEY, todayKey)

    Notification.requestPermission().then((permission) => {
      if (permission === 'granted') sendNotification()
    })
  }, [deadline, now, showEarlyFinishReminder])

  useEffect(() => {
    if (!showDeadlineExtensionReminder) return
    if (typeof Notification === 'undefined') return

    const todayKey = dateKey(now)
    if (localStorage.getItem(LS_DEADLINE_EXTENSION_REMINDER_NOTIFIED_KEY) === todayKey) {
      return
    }

    const sendNotification = () => {
      new Notification('Reminder', {
        body: 'Post the deadline extension message.',
      })
      localStorage.setItem(LS_DEADLINE_EXTENSION_REMINDER_NOTIFIED_KEY, todayKey)
    }

    if (Notification.permission === 'granted') {
      sendNotification()
      return
    }

    if (Notification.permission === 'denied') return

    if (localStorage.getItem(LS_DEADLINE_EXTENSION_REMINDER_REQUESTED_KEY) === todayKey) {
      return
    }
    localStorage.setItem(LS_DEADLINE_EXTENSION_REMINDER_REQUESTED_KEY, todayKey)

    Notification.requestPermission().then((permission) => {
      if (permission === 'granted') sendNotification()
    })
  }, [deadline, now, showDeadlineExtensionReminder])

  useEffect(() => {
    localStorage.setItem(
      LS_PANEL_ASSIGNMENT_HISTORY_OPEN_KEY,
      String(isAssignmentHistoryPanelOpen)
    )
  }, [isAssignmentHistoryPanelOpen])

  useEffect(() => {
    localStorage.setItem(LS_PANEL_ASSIGNMENTS_OPEN_KEY, String(isAssignmentsPanelOpen))
  }, [isAssignmentsPanelOpen])

  useEffect(() => {
    localStorage.setItem(
      LS_PANEL_NEXT_ASSIGNMENT_MESSAGE_OPEN_KEY,
      String(isNextAssignmentPanelOpen)
    )
  }, [isNextAssignmentPanelOpen])

  const updateDeadline = (
    nextDeadline: Date,
    options?: { relatedAssignments?: AssignmentEntry[]; resetAssignments?: boolean; captureWorkMinutes?: boolean }
  ) => {
    if (options?.captureWorkMinutes) {
      const start = previousAssignmentFinalDeadline ?? now
      setWorkMinutes(deadlineWorkMinutes(start, nextDeadline))
    }
    const sameDeadline = nextDeadline.getTime() === deadline.getTime()
    if (sameDeadline && options?.resetAssignments) {
      setChildAssignments([])
      setChangeBaseDeadline(null)
      setAssignmentFinishBase(null)
      return
    }
    if (sameDeadline) return
    setDeadline(nextDeadline)
    if (options?.resetAssignments) {
      setChildAssignments([])
      setChangeBaseDeadline(null)
      setAssignmentFinishBase(null)
    }
  }

  const onSetDeadline = (value: string, nextDeadline: Date | null) => {
    setDirectDeadlineInput(value)
    if (nextDeadline) updateDeadline(nextDeadline, { resetAssignments: true, captureWorkMinutes: true })
  }

  const reset = () => {
    const next = snapToWorkTime(new Date())
    updateDeadline(next, { resetAssignments: true, captureWorkMinutes: true })
    setDirectDeadlineInput(toDatetimeLocalValue(next))
    if (deadlineInputMode === 'duration') {
      setDurationStartInput(toDatetimeLocalValue(next))
      setDurationHoursInput('')
      setDurationMinutesInput('')
    }
  }

  const updateDeadlineFromDurationInputs = (
    startInput: string,
    hoursInput: string,
    minutesInput: string
  ) => {
    const nextDeadline = deadlineFromDurationInputs(startInput, hoursInput, minutesInput)
    if (nextDeadline) updateDeadline(nextDeadline, { resetAssignments: true, captureWorkMinutes: true })
  }

  const onDurationStartInputChange = (value: string) => {
    setDurationStartInput(value)
    updateDeadlineFromDurationInputs(value, durationHoursInput, durationMinutesInput)
  }

  const onDurationTimeChange = (nextHours: string, nextMinutes: string) => {
    setDurationHoursInput(nextHours)
    setDurationMinutesInput(nextMinutes)
    updateDeadlineFromDurationInputs(durationStartInput, nextHours, nextMinutes)
  }

  const onSwitchDeadlineInputMode = (nextMode: DeadlineInputMode) => {
    if (nextMode === deadlineInputMode) return
    const deadlineValue = toDatetimeLocalValue(deadline)
    if (nextMode === 'direct') {
      setDirectDeadlineInput(deadlineValue)
    } else {
      setDurationStartInput(deadlineValue)
    }
    setDeadlineInputMode(nextMode)
  }

  const focusDeadlineInput = () => {
    if (deadlineInputMode === 'duration') {
      durationStartRef.current?.focus()
      return
    }
    deadlineRef.current?.focus()
  }

  const deadlineMessageInput = useMemo(() => {
    const messageAssignments = adjustedAssignments
    const messageDeadline = deadline
    return {
      assignmentTitle: deadlineExtensionAssignment,
      deadline: messageDeadline.toISOString(),
      assignments: messageAssignments,
    }
  }, [
    adjustedAssignments,
    deadline,
    deadlineExtensionAssignment,
  ])

  const deadlineExtensionMessage = useMemo(() => {
    if (!deadlineExtensionAssignment.trim()) return ''
    if (!assignmentOwner.trim()) return ''
    if (relatedAssignments.length === 0) return ''
    const messagePreviousDeadline = changeBaseDeadline ?? deadline
    return formatDeadlineExtensionMessage({
      previous: messagePreviousDeadline,
      next: new Date(deadlineMessageInput.deadline),
      assignments: deadlineMessageInput.assignments,
      assignment: deadlineMessageInput.assignmentTitle,
      assignee: assignmentOwner,
    })
  }, [
    assignmentOwner,
    deadline,
    changeBaseDeadline,
    deadlineExtensionAssignment,
    deadlineMessageInput,
    relatedAssignments,
  ])

  const filteredRecentAssignmentItems = useMemo(() => {
    const needle = assignmentName.trim().toLowerCase()
    if (!needle) return recentAssignments
    return recentAssignments.filter((item) => item.toLowerCase().includes(needle))
  }, [recentAssignments, assignmentName])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecentActiveIndex(filteredRecentAssignmentItems.length > 0 ? 0 : -1)
  }, [filteredRecentAssignmentItems])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDeadlineExtensionCopyState('idle')
  }, [deadlineExtensionMessage])

  const previousAssignment = readLatestAssignment(relatedAssignments, adjustedAssignmentFinishTimes)

  const nextAssignmentMessage = useMemo(() => {
    if (!previousAssignment) return ''
    if (!previousAssignment.title) return ''
    if (!deadlineExtensionAssignment.trim()) return ''
    if (!assignmentOwner.trim()) return ''
    return formatNextAssignmentMessage({
      completedAssignment: previousAssignment.title,
      nextAssignment: deadlineExtensionAssignment,
      assignee: assignmentOwner,
      start: previousAssignment.deadline,
      deadline,
    })
  }, [
    assignmentOwner,
    deadline,
    deadlineExtensionAssignment,
    previousAssignment,
  ])

  const nextAssignmentMessageHint = useMemo(() => {
    if (!previousAssignment) return 'Add an affecting deadline first to generate this message.'
    if (!deadlineExtensionAssignment.trim() || !assignmentOwner.trim()) {
      return 'Set assignment title and owner to generate the message.'
    }
    return ''
  }, [assignmentOwner, deadlineExtensionAssignment, previousAssignment])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNextAssignmentCopyState('idle')
  }, [nextAssignmentMessage])

  const onCopyDeadlineExtensionMessage = async () => {
    if (!deadlineExtensionMessage) return
    try {
      await navigator.clipboard.writeText(deadlineExtensionMessage)
      setDeadlineExtensionCopyState('copied')
    } catch {
      setDeadlineExtensionCopyState('failed')
    }
  }

  const onCopyNextAssignmentMessage = async () => {
    if (!nextAssignmentMessage) return
    try {
      await navigator.clipboard.writeText(nextAssignmentMessage)
      setNextAssignmentCopyState('copied')
    } catch {
      setNextAssignmentCopyState('failed')
    }
  }

  const addAssignmentEntry = () => {
    const minutes = minutesFromTimeParts(assignmentHours, assignmentMinutes)
    if (!assignmentName.trim() || minutes === null) return
    const entry: AssignmentEntry = {
      text: assignmentName.trim(),
      minutes: Math.round(minutes),
    }
    setRecentAssignments((prev) => updateRecentAssignmentNames(prev, entry.text))
    const nextAssignments = sanitizeAssignmentEntries([...relatedAssignments, entry])
    const baseDeadline = pickAssignmentBatchBase(deadline, changeBaseDeadline)
    const dueBase = pickAssignmentBatchBase(now, assignmentFinishBase)
    if (!changeBaseDeadline) {
      setChangeBaseDeadline(baseDeadline)
    }
    if (!assignmentFinishBase) {
      setAssignmentFinishBase(dueBase)
    }
    const nextDeadline = officialDeadlineFromAddedAssignments(baseDeadline, nextAssignments)
    setChildAssignments(nextAssignments)
    setDeadline(nextDeadline)
    if (deadlineInputMode === 'direct') {
      setDirectDeadlineInput(toDatetimeLocalValue(nextDeadline))
    }
    setAssignmentName('')
    setAssignmentHours('')
    setAssignmentMinutes('')
    setIsAddAssignmentFormOpen(false)
  }

  const removeAssignmentEntry = (index: number) => {
    const nextAssignments = sanitizeAssignmentEntries(relatedAssignments.filter((_, i) => i !== index))
    setChildAssignments(nextAssignments)
    if (nextAssignments.length === 0) {
      if (changeBaseDeadline) {
        setDeadline(changeBaseDeadline)
        if (deadlineInputMode === 'direct') {
          setDirectDeadlineInput(toDatetimeLocalValue(changeBaseDeadline))
        }
      }
      setChangeBaseDeadline(null)
      setAssignmentFinishBase(null)
      return
    }

    if (changeBaseDeadline) {
      const nextDeadline = officialDeadlineFromAddedAssignments(changeBaseDeadline, nextAssignments)
      setDeadline(nextDeadline)
      if (deadlineInputMode === 'direct') {
        setDirectDeadlineInput(toDatetimeLocalValue(nextDeadline))
      }
    }
  }

  const onAssignmentTimeChange = (nextHours: string, nextMinutes: string) => {
    setAssignmentHours(nextHours)
    setAssignmentMinutes(nextMinutes)
  }

  const onContentLengthChange = (nextMinutesText: string, nextSecondsText: string) => {
    const trimmedMinutes = nextMinutesText.trim()
    const trimmedSeconds = nextSecondsText.trim()
    if (!trimmedMinutes && !trimmedSeconds) {
      setContentMinutes(undefined)
      setContentSeconds(undefined)
      return
    }

    if ((trimmedMinutes && !isNonNegativeInteger(trimmedMinutes)) || (trimmedSeconds && !isNonNegativeInteger(trimmedSeconds))) {
      return
    }
    if (trimmedMinutes.length > 2) return
    if (trimmedSeconds.length > 2) return

    const minutes = trimmedMinutes ? Number(trimmedMinutes) : 0
    const secondsRaw = trimmedSeconds ? Number(trimmedSeconds) : 0
    const seconds = Math.min(59, secondsRaw)
    if (minutes < 0 || seconds < 0) return

    const totalSeconds = minutes * 60 + seconds
    setContentSeconds(totalSeconds)
    setContentMinutes(Math.round(totalSeconds / 60))
  }

  const onExportAssignmentHistoryJson = () => {
    const rawAssignmentsState = localStorage.getItem(LS_ASSIGNMENTS_KEY)
    const exportMonth = historyMonth.trim() || 'all'
    let content = JSON.stringify({ assignments: [], exportMonth }, null, 2)
    if (rawAssignmentsState) {
      try {
        const parsed = JSON.parse(rawAssignmentsState) as { assignments?: unknown }
        const assignments = Array.isArray(parsed.assignments) ? parsed.assignments : []
        content = JSON.stringify({ assignments, exportMonth }, null, 2)
      } catch {
        content = JSON.stringify({ assignments: [], exportMonth }, null, 2)
      }
    }
    const suffix = exportMonth
    downloadTextFile(`assignment-history-${suffix}.json`, content, 'application/json;charset=utf-8')
  }

  const onClickImportAssignments = () => {
    importAssignmentsInputRef.current?.click()
  }

  const onImportAssignments = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0]
    event.target.value = ''
    if (!picked) return

    try {
      const raw = await picked.text()
      const parsed = JSON.parse(raw) as { assignments?: unknown }
      if (!Array.isArray(parsed.assignments)) {
        setImportAssignmentsState('failed')
        return
      }
      const normalizedAssignments = parsed.assignments
        .map((item) => normalizeStoredAssignment(item))
        .filter((item): item is StoredAssignment => Boolean(item))
      const importedAssignmentsState: StoredAssignmentsV2 = { assignments: normalizedAssignments }
      localStorage.setItem(LS_ASSIGNMENTS_KEY, JSON.stringify(importedAssignmentsState))

      const importedState =
        normalizedAssignments.length > 0 ? readStoredAssignmentsState(selectedAssignmentId) : null
      if (importedState) {
        const importedDeadline = new Date(importedState.deadline)
        if (!Number.isNaN(importedDeadline.getTime())) {
          setDeadline(importedDeadline)
          setDirectDeadlineInput(toDatetimeLocalValue(importedDeadline))
          setDurationStartInput(toDatetimeLocalValue(importedDeadline))
        }
        setDeadlineExtensionAssignment(importedState.assignmentTitle)
        setAssignmentOwner(importedState.owner)
        setWorkMinutes(importedState.workMinutes)
        setContentMinutes(
          importedState.contentMinutes ??
            (typeof importedState.contentSeconds === 'number'
              ? Math.round(importedState.contentSeconds / 60)
              : undefined)
        )
        setContentSeconds(importedState.contentSeconds)
        setChildAssignments(importedState.relatedAssignments)
        setComments(importedState.comments)
      } else {
        setDeadlineExtensionAssignment('')
        setAssignmentOwner('')
        setWorkMinutes(undefined)
        setContentMinutes(undefined)
        setContentSeconds(undefined)
        setChildAssignments([])
        setComments([])
      }
      setChangeBaseDeadline(null)
      setAssignmentFinishBase(null)
      setAssignmentName('')
      setAssignmentHours('')
      setAssignmentMinutes('')
      setImportAssignmentsState('imported')
    } catch {
      setImportAssignmentsState('failed')
    }
  }

  const addComment = () => {
    const nextComment = commentText.trim()
    if (!nextComment) return
    setComments((prev) => [...prev, nextComment])
    setCommentText('')
    setIsCommentsFormOpen(false)
  }

  const removeComment = (index: number) => {
    setComments((prev) => prev.filter((_, i) => i !== index))
  }

  const messagesSection = (
    <div className="messagesSection">
      <div className="assignmentSectionTitle sectionHeading">Messages</div>
      <AccordionItem
        title="Assignment history export"
        isOpen={isAssignmentHistoryPanelOpen}
        onToggle={() => setIsAssignmentHistoryPanelOpen((prev) => !prev)}
        panelId="assignment-history-panel"
      >
        <fieldset disabled={!isAssignmentHistoryPanelOpen} className="messageFieldset">
          <div className="historyExportSection">
            <div className="fieldGroup historyExportMonthField">
              <label className="fieldLabel" htmlFor="assignment-history-month">
                Month
              </label>
              <input
                id="assignment-history-month"
                type="month"
                value={historyMonth}
                onChange={(e) => setHistoryMonth(e.target.value)}
                aria-label="Month"
              />
            </div>
            <div className="historyExportMeta metaTextMutedSm">
              {exportAssignments.length} assignments, {(exportHistoryMinutes / 60).toFixed(2)} hours
            </div>
            <div className="historyExportActions">
              <button onClick={onExportAssignmentHistoryJson} className="btn-primary">
                <i className="las la-file-code" aria-hidden="true"></i> Export JSON
              </button>
              <button onClick={onClickImportAssignments} className="btn-secondary">
                <i className="las la-file-import" aria-hidden="true"></i> Import JSON
              </button>
              <input
                ref={importAssignmentsInputRef}
                type="file"
                accept="application/json,.json"
                onChange={onImportAssignments}
                aria-label="Import assignment JSON"
                style={{ display: 'none' }}
              />
            </div>
            {importAssignmentsState === 'imported' && (
              <div className="copyStatus" aria-label="Import assignment status">
                Imported.
              </div>
            )}
            {importAssignmentsState === 'failed' && (
              <div className="copyStatus" aria-label="Import assignment status">
                Import failed.
              </div>
            )}
          </div>
        </fieldset>
      </AccordionItem>
    </div>
  )

  if (renderMessagesOnly) {
    return messagesSection
  }

  return (
    <div className="app">
      <div className="assignmentPageLayout">
        {showTopNav && (
          <div className="assignmentSection">
            <div className="topNavRow">
              <Link to="/assignments" className="topNavLink" aria-label="Go to assignments page">
                <i className="las la-arrow-left" aria-hidden="true"></i>
                <span>Assignments</span>
              </Link>
            </div>
          </div>
        )}

        <div className="assignmentPageBody">
          <div className="deadlineSection assignmentOverviewCard">
            <div className="assignmentOverviewHeader">
              <input
                type="text"
                className="assignmentOverviewTitleInput"
                aria-label="Assignment title"
                value={deadlineExtensionAssignment}
                onChange={(e) => setDeadlineExtensionAssignment(e.target.value)}
                placeholder="Assignment"
              />
              <div className="assignmentOverviewMetaRow">
                <div className="assignmentOverviewOwnerField">
                  <label className="label" htmlFor="assignment-owner">
                    Owner
                  </label>
                  <input
                    id="assignment-owner"
                    type="text"
                    className="assignmentOverviewOwnerInput"
                    value={assignmentOwner}
                    onChange={(e) => setAssignmentOwner(e.target.value)}
                    placeholder="Owner"
                    aria-label="Owner"
                  />
                </div>
                <div className="assignmentOverviewOwnerField">
                  <label className="label">
                    Content length (mm:ss)
                  </label>
                  <div>
                    <CompactTimePartsInput
                      leftText={contentLengthMinutesInput}
                      rightText={contentLengthSecondsInput}
                      onChange={onContentLengthChange}
                      leftAriaLabel="Content length minutes"
                      rightAriaLabel="Content length seconds"
                      leftPlaceholder="MM"
                      rightPlaceholder="SS"
                      leftInputClassName="assignmentOverviewOwnerInput"
                      rightInputClassName="assignmentOverviewOwnerInput"
                    />
                  </div>
                </div>
                <div className="assignmentOverviewOwnerField">
                  <label className="label">
                    Work time (HH:MM)
                  </label>
                  <div aria-label="Planned work time display">
                    <CompactTimePartsInput
                      leftText={plannedWorkHoursText}
                      rightText={plannedWorkMinutesText}
                      leftAriaLabel="Planned work hours"
                      rightAriaLabel="Planned work minutes"
                      leftPlaceholder="HH"
                      rightPlaceholder="MM"
                      leftInputClassName="assignmentOverviewOwnerInput"
                      rightInputClassName="assignmentOverviewOwnerInput"
                      readOnly={true}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="main">
              <div className="block">
                <div className="label">Deadline</div>
                <div className="deadline" onClick={focusDeadlineInput}>
                  <span aria-label="Current deadline display">{fmtDateTimeWithWeekday(displayDeadline)}</span>
                </div>
              </div>

              <div className="block">
                <div className="label">Remaining (work time)</div>
                <div className="remaining" onClick={focusDeadlineInput}>
                  <span aria-label="Remaining work time display">
                    {parts.days > 0 && `${parts.days}d `}
                    {parts.hours}h {parts.minutes}m {parts.seconds}s
                  </span>
                </div>
              </div>
              {showEarlyFinishReminder && (
                <div className="reminder">Reminder: ask for more work before 9:00 AM.</div>
              )}
              {showDeadlineExtensionReminder && <div className="reminder">Reminder: post the deadline extension message.</div>}
            </div>

            <div className="controls">
              <div className="deadlineInputModeSwitch" role="group" aria-label="Deadline input mode">
                <button
                  type="button"
                  className={`btn-secondary ${deadlineInputMode === 'direct' ? 'isActive' : ''}`}
                  onClick={() => onSwitchDeadlineInputMode('direct')}
                  aria-label="Pick exact date/time"
                  title="Pick exact date/time"
                >
                  <i className="las la-clock" aria-hidden="true"></i>
                </button>
                <button
                  type="button"
                  className={`btn-secondary ${deadlineInputMode === 'duration' ? 'isActive' : ''}`}
                  onClick={() => onSwitchDeadlineInputMode('duration')}
                  aria-label="Start date + duration"
                  title="Start date + duration"
                >
                  <i className="las la-hourglass-half" aria-hidden="true"></i>
                </button>
              </div>

              {deadlineInputMode === 'direct' ? (
                <DateTimeInput
                  ref={deadlineRef}
                  className="deadlineInput"
                  value={directDeadlineInput}
                  onChange={onSetDeadline}
                  ariaLabel="Deadline time"
                />
              ) : (
                <div className="deadlineDurationInputs">
                  <DateTimeInput
                    ref={durationStartRef}
                    className="deadlineInput"
                    value={durationStartInput}
                    onChange={(value) => onDurationStartInputChange(value)}
                    ariaLabel="Deadline start time"
                  />
                  <TimePartsInput
                    leftText={durationHoursInput}
                    rightText={durationMinutesInput}
                    onChange={onDurationTimeChange}
                    leftAriaLabel="Deadline duration hours"
                    rightAriaLabel="Deadline duration minutes"
                    showLabels={false}
                    leftInputClassName="deadlineDurationInput"
                    rightInputClassName="deadlineDurationInput"
                    increaseLeftLabel="Increase deadline duration hours by 1"
                    decreaseLeftLabel="Decrease deadline duration hours by 1"
                    increaseRightLabel="Increase deadline duration minutes by 10"
                    decreaseRightLabel="Decrease deadline duration minutes by 10"
                  />
                </div>
              )}

              <button
                onClick={reset}
                className="resetButton btn-secondary"
                aria-label="Reset deadline to now"
              >
                Reset
              </button>
            </div>
            {!isInWorkTime(now) && (
              <div className="assignmentOverviewControlsMeta">
                <div className="metaTextMutedSm">
                  Counting from {fmtDateTimeWithWeekday(workStartAt)}.
                </div>
              </div>
            )}
          </div>

          <div className="assignmentSection">
            <div className="assignmentSectionDisclosure">
              <div className="assignmentSectionHeader">
                <div className="assignmentSectionTitle sectionHeading">Affecting deadlines</div>
                <button
                  type="button"
                  className="assignmentSectionAddButton"
                  aria-label="Toggle assignment form"
                  aria-expanded={isAddAssignmentFormOpen}
                  aria-controls="add-assignment-form-panel"
                  onClick={() => setIsAddAssignmentFormOpen((prev) => !prev)}
                >
                  <i className={`las ${isAddAssignmentFormOpen ? 'la-minus' : 'la-plus'}`} aria-hidden="true"></i>
                </button>
              </div>
              <div
                id="add-assignment-form-panel"
                className="messagePanel"
                data-state={isAddAssignmentFormOpen ? 'open' : 'closed'}
                aria-hidden={!isAddAssignmentFormOpen}
              >
                <div className="messagePanelInner">
                  <fieldset disabled={!isAddAssignmentFormOpen} className="messageFieldset">
                    <div className="assignmentFields">
                  <div className="fieldGroup assignmentTextField">
                    <label className="fieldLabel" htmlFor="assignment-name">
                      Name
                    </label>
                    <div className="assignmentInputWrap">
                      <input
                        id="assignment-name"
                        type="text"
                        value={assignmentName}
                        onChange={(e) => {
                          const nextValue = e.target.value
                          setAssignmentName(nextValue)
                          if (nextValue.trim().length === 0) {
                            setIsRecentOpen(true)
                          }
                        }}
                        onFocus={() => setIsRecentOpen(true)}
                        onBlur={() => setIsRecentOpen(false)}
                        onKeyDown={(event) => {
                          if (!isRecentOpen || filteredRecentAssignmentItems.length === 0) return
                          if (event.key === 'ArrowDown') {
                            event.preventDefault()
                            setRecentActiveIndex((current) =>
                              current < filteredRecentAssignmentItems.length - 1 ? current + 1 : 0
                            )
                          } else if (event.key === 'ArrowUp') {
                            event.preventDefault()
                            setRecentActiveIndex((current) =>
                              current > 0 ? current - 1 : filteredRecentAssignmentItems.length - 1
                            )
                          } else if (event.key === 'Enter') {
                            if (recentActiveIndex < 0) return
                            event.preventDefault()
                            const picked = filteredRecentAssignmentItems[recentActiveIndex]
                            if (!picked) return
                            setAssignmentName(picked)
                            setIsRecentOpen(false)
                          } else if (event.key === 'Escape') {
                            event.preventDefault()
                            setIsRecentOpen(false)
                          }
                        }}
                      placeholder="Name"
                      aria-label="Name"
                      aria-expanded={isRecentOpen && filteredRecentAssignmentItems.length > 0}
                      aria-controls="assignment-recent-list"
                    />
                      {isRecentOpen && filteredRecentAssignmentItems.length > 0 && (
                        <div
                          id="assignment-recent-list"
                          className="assignmentRecent"
                          role="listbox"
                          aria-label="Recent assignments"
                        >
                          {filteredRecentAssignmentItems.map((name) => (
                            <button
                              key={name}
                              type="button"
                              className="assignmentRecentItem"
                              data-state={
                                name === filteredRecentAssignmentItems[recentActiveIndex] ? 'active' : 'idle'
                              }
                              onMouseDown={(event) => {
                                event.preventDefault()
                                setAssignmentName(name)
                                setIsRecentOpen(false)
                              }}
                              role="option"
                            >
                              {name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <TimePartsInput
                    leftText={assignmentHours}
                    rightText={assignmentMinutes}
                    onChange={onAssignmentTimeChange}
                    leftInputId="assignment-hours"
                    rightInputId="assignment-minutes"
                    leftAriaLabel="Hours"
                    rightAriaLabel="Minutes"
                    increaseLeftLabel="Increase hours by 1"
                    decreaseLeftLabel="Decrease hours by 1"
                    increaseRightLabel="Increase minutes by 10"
                    decreaseRightLabel="Decrease minutes by 10"
                  />
                  <div className="fieldGroup">
                    <span className="fieldLabel fieldLabelSpacer" aria-hidden="true">
                      Action
                    </span>
                    <button
                      onClick={addAssignmentEntry}
                      disabled={!assignmentName.trim() || minutesFromTimeParts(assignmentHours, assignmentMinutes) === null}
                      className="btn-primary"
                    >
                      <i className="las la-plus" aria-hidden="true"></i> Add assignment
                    </button>
                  </div>
                </div>
                  </fieldset>
                </div>
              </div>
            </div>

            {relatedAssignments.length > 0 && (
              <div className="assignmentList">
                {relatedAssignments.map((entry, index) => (
                  <AssignmentRow
                    key={`${entry.text}-${index}`}
                    title={entry.text}
                    meta={
                      <span aria-label="Assignment due time display" className="assignmentDueText">
                        <span className="assignmentDueTime">{fmtTime(adjustedAssignmentFinishTimes[index])}</span>
                        <span aria-hidden="true"> • </span>
                        <span className="assignmentDueDuration">
                          {formatDuration(adjustedAssignments[index].minutes)}
                        </span>
                      </span>
                    }
                    action={
                      <button
                        onClick={() => removeAssignmentEntry(index)}
                        aria-label="Remove assignment"
                        className="btn-secondary assignmentRemoveButton"
                      >
                        <i className="las la-trash" aria-hidden="true"></i>
                      </button>
                    }
                  />
                ))}
              </div>
            )}
          </div>

          <div className="assignmentSection">
            <div className="assignmentSectionDisclosure">
              <div className="assignmentSectionHeader">
                <div className="assignmentSectionTitle sectionHeading">Comments</div>
                <button
                  type="button"
                  className="assignmentSectionAddButton"
                  aria-label="Toggle comment form"
                  aria-expanded={isCommentsFormOpen}
                  aria-controls="add-comment-form-panel"
                  onClick={() => setIsCommentsFormOpen((prev) => !prev)}
                >
                  <i className={`las ${isCommentsFormOpen ? 'la-minus' : 'la-plus'}`} aria-hidden="true"></i>
                </button>
              </div>
              <div
                id="add-comment-form-panel"
                className="messagePanel"
                data-state={isCommentsFormOpen ? 'open' : 'closed'}
                aria-hidden={!isCommentsFormOpen}
              >
                <div className="messagePanelInner">
                  <fieldset disabled={!isCommentsFormOpen} className="messageFieldset">
                    <div className="assignmentCommentFields">
                      <div className="fieldGroup assignmentTextField">
                        <label className="fieldLabel" htmlFor="comment-text">
                          Comment
                        </label>
                        <input
                          id="comment-text"
                          type="text"
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value)}
                          placeholder="Add a comment point"
                          aria-label="Comment"
                        />
                      </div>
                      <div className="fieldGroup">
                        <span className="fieldLabel fieldLabelSpacer" aria-hidden="true">
                          Action
                        </span>
                        <button
                          onClick={addComment}
                          disabled={!commentText.trim()}
                          className="btn-primary"
                        >
                          <i className="las la-plus" aria-hidden="true"></i> Add comment
                        </button>
                      </div>
                    </div>
                  </fieldset>
                </div>
              </div>
            </div>

            {comments.length > 0 && (
              <div className="assignmentList">
                {comments.map((comment, index) => (
                  <AssignmentRow
                    key={`${comment}-${index}`}
                    title={comment}
                    meta={<span aria-hidden="true"></span>}
                    action={
                      <button
                        type="button"
                        className="btn-secondary assignmentRemoveButton"
                        aria-label="Remove comment"
                        onClick={() => removeComment(index)}
                      >
                        <i className="las la-trash" aria-hidden="true"></i>
                      </button>
                    }
                  />
                ))}
              </div>
            )}
          </div>

          <div className="messagesSection">
            <div className="assignmentSectionTitle sectionHeading">Messages</div>
            <AccordionItem
              title="Deadline extension message"
              isOpen={isAssignmentsPanelOpen}
              onToggle={() => setIsAssignmentsPanelOpen((prev) => !prev)}
              panelId="relatedAssignments-panel"
            >
              <fieldset disabled={!isAssignmentsPanelOpen} className="messageFieldset">
                <div className="messageBody">
                  <div className="messagePreview" aria-label="Deadline extension message preview">
                    {deadlineExtensionMessage ||
                      'Set assignment title, owner, and affecting deadlines to generate the message.'}
                  </div>
                  <div className="messageActions">
                    <button
                      onClick={onCopyDeadlineExtensionMessage}
                      disabled={!deadlineExtensionMessage}
                      className="btn-primary"
                    >
                      <i className="las la-copy" aria-hidden="true"></i> Copy
                    </button>
                    {deadlineExtensionCopyState === 'copied' && (
                      <span className="copyStatus">Copied.</span>
                    )}
                    {deadlineExtensionCopyState === 'failed' && (
                      <span className="copyStatus">Copy failed. Please copy manually.</span>
                    )}
                  </div>
                </div>
              </fieldset>
            </AccordionItem>
            <AccordionItem
              title="Next assignment message"
              isOpen={isNextAssignmentPanelOpen}
              onToggle={() => setIsNextAssignmentPanelOpen((prev) => !prev)}
              panelId="next-assignment-message-panel"
            >
              <fieldset disabled={!isNextAssignmentPanelOpen} className="messageFieldset">
                <div className="messageBody">
                  <div className="messagePreview" aria-label="Next assignment message preview">
                    {nextAssignmentMessage || nextAssignmentMessageHint}
                  </div>

                  <div className="messageActions">
                    <button
                      onClick={onCopyNextAssignmentMessage}
                      disabled={!nextAssignmentMessage}
                      className="btn-primary"
                    >
                      <i className="las la-copy" aria-hidden="true"></i> Copy
                    </button>
                    {nextAssignmentCopyState === 'copied' && <span className="copyStatus">Copied.</span>}
                    {nextAssignmentCopyState === 'failed' && (
                      <span className="copyStatus">Copy failed. Please copy manually.</span>
                    )}
                  </div>
                </div>
              </fieldset>
            </AccordionItem>
          </div>

          {showMessagesSection ? messagesSection : null}
        </div>
      </div>
    </div>
  )
}
