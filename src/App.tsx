import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  buildAssignmentHistoryEntry,
  filterAssignmentHistoryEntriesByMonth,
  sumAssignmentHistoryEntryMinutes,
  type AssignmentHistoryEntry,
} from './utils/assignmentHistoryUnified'
import { AccordionItem } from './components/Accordion'
import { AssignmentRow } from './components/AssignmentRow'
import { HoursMinutesInput } from './components/HoursMinutesInput'
import { buildAssignment } from './utils/assignmentModel'
import { formatDeadlineExtensionMessage, formatDuration, type TaskEntry } from './utils/deadlineHistory'
import { formatNextAssignmentMessage } from './utils/nextAssignmentMessage'
import {
  fmtDateTimeWithWeekday,
  fmtTime,
  msToParts,
  pad2,
  parseDatetimeLocalValue,
  toDatetimeLocalValue,
} from './utils/time'
import { updateRecentTaskNames } from './utils/taskHistory'
import {
  calculateTaskFinishTimes,
  minutesFromTimeParts,
  pickTaskBatchBase,
  pickTaskFinishStart,
} from './utils/taskTime'
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
  persistDraft?: boolean
  renderMessagesOnly?: boolean
  showMessagesSection?: boolean
}

const LS_DEADLINE_KEY = 'aliveline:deadline-iso'
const LS_RECENT_TASKS_KEY = 'aliveline:recent-tasks'
const LS_CHANGE_BASE_KEY = 'aliveline:change-base-deadline-iso'
const LS_TASK_FINISH_BASE_KEY = 'aliveline:task-finish-base-iso'
const LS_PANEL_ASSIGNMENT_HISTORY_OPEN_KEY = 'aliveline:panel-assignment-history-open'
const LS_PANEL_TASKS_OPEN_KEY = 'aliveline:panel-tasks-open'
const LS_PANEL_NEXT_ASSIGNMENT_MESSAGE_OPEN_KEY = 'aliveline:panel-next-assignment-message-open'
const LS_ASSIGNMENT_HISTORY_KEY = 'aliveline:assignment-history'
const LS_DAILY_CLEAR_KEY = 'aliveline:daily-clear'
const LS_REMINDER_NOTIFIED_KEY = 'aliveline:reminder-notified'
const LS_REMINDER_REQUESTED_KEY = 'aliveline:reminder-requested'
const LS_DEADLINE_EXTENSION_REMINDER_NOTIFIED_KEY = 'aliveline:deadline-extension-reminder-notified'
const LS_DEADLINE_EXTENSION_REMINDER_REQUESTED_KEY = 'aliveline:deadline-extension-reminder-requested'
const LS_ASSIGNMENT_DRAFT_KEY = 'aliveline:assignment-draft'
const ADJUSTED_TASK_MULTIPLIER = 0.8

function adjustedAssignmentMinutes(rawMinutes: number) {
  if (rawMinutes <= 0) return 0
  return Math.max(1, Math.round(rawMinutes * ADJUSTED_TASK_MULTIPLIER))
}

function adjustedDeadlineDurationMinutes(rawMinutes: number) {
  if (rawMinutes <= 0) return 0
  return adjustedAssignmentMinutes(rawMinutes)
}

function snapToWorkTime(value: Date) {
  return isInWorkTime(value) ? value : nextWorkStart(value)
}

function officialDeadlineFromAddedAssignments(baseDeadline: Date, rawTasks: TaskEntry[]) {
  const rawTotalMinutes = rawTasks.reduce((sum, task) => sum + task.minutes, 0)
  return addWorkMinutes(baseDeadline, adjustedAssignmentMinutes(rawTotalMinutes))
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

function sanitizeTaskEntries(entries: unknown) {
  if (!Array.isArray(entries)) return [] as TaskEntry[]
  return entries.filter(
    (item) => typeof item?.text === 'string' && Number.isFinite(item?.minutes) && item.minutes > 0
  ) as TaskEntry[]
}

type StoredAssignmentDraftV2 = {
  assignments: DraftAssignment[]
}

type AssignmentDraftState = {
  assignments: DraftAssignment[]
  deadlineIso: string
  assignmentTitle: string
  owner: string
  tasks: TaskEntry[]
  comments: string[]
}

type DraftAssignment = {
  id: string
  title: string
  owner?: string
  deadlineIso: string
  estimateMinutes?: number
  comments: string[]
  children: DraftAssignment[]
}

function normalizeDraftAssignment(input: unknown): DraftAssignment | null {
  if (!input || typeof input !== 'object') return null
  const item = input as Record<string, unknown>
  if (typeof item.id !== 'string') return null
  if (typeof item.title !== 'string') return null
  if (typeof item.deadlineIso !== 'string') return null
  const comments = Array.isArray(item.comments)
    ? item.comments.filter((comment): comment is string => typeof comment === 'string').map((comment) => comment.trim()).filter(Boolean)
    : []
  const owner =
    typeof item.owner === 'string' && item.owner.trim().length > 0 ? item.owner.trim() : undefined
  const estimateMinutes =
    typeof item.estimateMinutes === 'number' && Number.isFinite(item.estimateMinutes) && item.estimateMinutes > 0
      ? Math.round(item.estimateMinutes)
      : undefined
  const childrenInput = Array.isArray(item.children) ? item.children : []
  const children = childrenInput
    .map((child) => normalizeDraftAssignment(child))
    .filter((child): child is DraftAssignment => Boolean(child))
  return {
    id: item.id,
    title: item.title.trim(),
    ...(owner ? { owner } : {}),
    deadlineIso: item.deadlineIso,
    ...(estimateMinutes ? { estimateMinutes } : {}),
    comments,
    children,
  }
}

function readStoredAssignmentDraft(selectedAssignmentId?: string) {
  const saved = localStorage.getItem(LS_ASSIGNMENT_DRAFT_KEY)
  if (!saved) return null
  try {
    const parsed = JSON.parse(saved) as {
      assignments?: unknown
    }
    if (!Array.isArray(parsed.assignments)) return null
    const assignments = parsed.assignments
      .map((item) => normalizeDraftAssignment(item))
      .filter((item): item is DraftAssignment => Boolean(item))
    if (assignments.length === 0) return null
    const current =
      assignments.find((assignment) => assignment.id === selectedAssignmentId) ?? assignments[0]
    const tasks = current.children
      .map((child) => ({ text: child.title, minutes: child.estimateMinutes ?? 0 }))
      .filter((task) => task.text.trim().length > 0 && task.minutes > 0)
    if (Number.isNaN(new Date(current.deadlineIso).getTime())) return null
    return {
      assignments,
      deadlineIso: current.deadlineIso,
      assignmentTitle: current.title,
      owner: current.owner ?? '',
      tasks: sanitizeTaskEntries(tasks),
      comments: current.comments ?? [],
    } as AssignmentDraftState
  } catch {
    return null
  }
}

function buildDraftAssignments(
  assignmentId: string,
  deadline: Date,
  assignmentTitle: string,
  owner: string,
  tasks: TaskEntry[],
  taskFinishTimes: Date[],
  comments: string[]
) : DraftAssignment {
  const taskAssignments = tasks.map((task, index) =>
    normalizeDraftAssignment(buildAssignment({
      id: `${assignmentId}-task-${index}`,
      title: task.text,
      deadlineIso: (taskFinishTimes[index] ?? deadline).toISOString(),
      estimateMinutes: task.minutes,
      comments: [],
    })) as DraftAssignment
  )

  const root = normalizeDraftAssignment(buildAssignment({
    id: assignmentId,
    title: assignmentTitle,
    owner,
    deadlineIso: deadline.toISOString(),
    comments,
  })) as DraftAssignment
  return {
    ...root,
    children: taskAssignments,
  }
}

function replaceTopLevelAssignment(
  existingAssignments: DraftAssignment[],
  assignmentId: string,
  nextAssignment: DraftAssignment
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

function toHistoryAssignments(root: DraftAssignment) {
  const childAssignments = root.children.map((child) =>
    buildAssignment({
      id: child.id,
      title: child.title,
      owner: child.owner,
      deadlineIso: child.deadlineIso,
      estimateMinutes: child.estimateMinutes,
      comments: child.comments,
      relations: [],
    })
  )
  const historyRoot = buildAssignment({
    id: root.id,
    title: root.title,
    owner: root.owner,
    deadlineIso: root.deadlineIso,
    comments: root.comments,
    relations: childAssignments.map((child) => ({ assignmentId: child.id, type: 'extends' })),
  })
  return [historyRoot, ...childAssignments]
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

function readStoredBool(key: string, fallback: boolean) {
  const saved = localStorage.getItem(key)
  if (saved === null) return fallback
  return saved === 'true'
}

function readStoredAssignmentHistory() {
  const saved = localStorage.getItem(LS_ASSIGNMENT_HISTORY_KEY)
  if (!saved) return [] as AssignmentHistoryEntry[]
  try {
    const parsed = JSON.parse(saved) as AssignmentHistoryEntry[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item) => {
      if (!item || typeof item !== 'object') return false
      if (typeof item.createdAtIso !== 'string') return false
      if (typeof item.deadlineIso !== 'string') return false
      if (typeof item.rootAssignmentId !== 'string') return false
      if (!Array.isArray(item.assignments)) return false
      if (!Number.isFinite(item.totalMinutes)) return false
      return true
    })
  } catch {
    return []
  }
}

function readHistoryRootAssignment(entry: AssignmentHistoryEntry) {
  const root = entry.assignments.find((assignment) => assignment.id === entry.rootAssignmentId)
  if (!root) return null
  const deadline = new Date(entry.deadlineIso)
  if (Number.isNaN(deadline.getTime())) return null
  return { title: root.title.trim(), deadline }
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
  persistDraft = true,
  renderMessagesOnly = false,
  showMessagesSection = true,
}: AppProps = {}) {
  const deadlineRef = useRef<PickerInput | null>(null)
  const durationStartRef = useRef<PickerInput | null>(null)
  const storedDraft = useMemo(
    () => readStoredAssignmentDraft(selectedAssignmentId),
    [selectedAssignmentId]
  )

  const [now, setNow] = useState(() => new Date())
  const [deadline, setDeadline] = useState(
    () => readStoredDate(LS_DEADLINE_KEY) ?? (storedDraft ? new Date(storedDraft.deadlineIso) : new Date())
  )
  const [tasks, setTasks] = useState<TaskEntry[]>(() => storedDraft?.tasks ?? [])
  const [recentTasks, setRecentTasks] = useState<string[]>(() =>
    readStoredStringList(LS_RECENT_TASKS_KEY)
  )
  const [changeBaseDeadline, setChangeBaseDeadline] = useState<Date | null>(() =>
    readStoredDate(LS_CHANGE_BASE_KEY)
  )
  const [taskFinishBase, setTaskFinishBase] = useState<Date | null>(() =>
    readStoredDate(LS_TASK_FINISH_BASE_KEY)
  )
  const [assignmentName, setTaskName] = useState('')
  const [taskHours, setTaskHours] = useState('')
  const [taskMinutes, setTaskMinutes] = useState('')
  const [isRecentOpen, setIsRecentOpen] = useState(false)
  const [recentActiveIndex, setRecentActiveIndex] = useState<number>(-1)
  const [deadlineExtensionAssignment, setDeadlineExtensionAssignment] = useState(
    () => storedDraft?.assignmentTitle ?? ''
  )
  const [assignmentOwner, setAssignmentOwner] = useState(() => storedDraft?.owner ?? '')
  const [deadlineExtensionCopyState, setDeadlineExtensionCopyState] = useState<
    'idle' | 'copied' | 'failed'
  >('idle')
  const [nextAssignmentCopyState, setNextAssignmentCopyState] = useState<
    'idle' | 'copied' | 'failed'
  >('idle')
  const [isAssignmentHistoryPanelOpen, setIsAssignmentHistoryPanelOpen] = useState(() =>
    readStoredBool(LS_PANEL_ASSIGNMENT_HISTORY_OPEN_KEY, false)
  )
  const [isTasksPanelOpen, setIsTasksPanelOpen] = useState(() =>
    readStoredBool(LS_PANEL_TASKS_OPEN_KEY, false)
  )
  const [isNextAssignmentPanelOpen, setIsNextAssignmentPanelOpen] = useState(() =>
    readStoredBool(LS_PANEL_NEXT_ASSIGNMENT_MESSAGE_OPEN_KEY, false)
  )
  const [isAddAssignmentFormOpen, setIsAddAssignmentFormOpen] = useState(false)
  const [isCommentsFormOpen, setIsCommentsFormOpen] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [comments, setComments] = useState<string[]>(() => storedDraft?.comments ?? [])
  const [assignmentHistory, setAssignmentHistory] = useState<AssignmentHistoryEntry[]>(() =>
    readStoredAssignmentHistory()
  )
  const [historyMonth, setHistoryMonth] = useState(() =>
    `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`
  )
  const [deadlineInputMode, setDeadlineInputMode] = useState<DeadlineInputMode>('direct')
  const [directDeadlineInput, setDirectDeadlineInput] = useState(() => toDatetimeLocalValue(deadline))
  const [durationStartInput, setDurationStartInput] = useState(() => toDatetimeLocalValue(deadline))
  const [durationHoursInput, setDurationHoursInput] = useState('')
  const [durationMinutesInput, setDurationMinutesInput] = useState('')

  const projectionTasks = useMemo(() => tasks, [tasks])

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
    localStorage.setItem(LS_RECENT_TASKS_KEY, JSON.stringify(recentTasks))
  }, [recentTasks])

  useEffect(() => {
    if (changeBaseDeadline) {
      localStorage.setItem(LS_CHANGE_BASE_KEY, changeBaseDeadline.toISOString())
    } else {
      localStorage.removeItem(LS_CHANGE_BASE_KEY)
    }
  }, [changeBaseDeadline])

  useEffect(() => {
    if (taskFinishBase) {
      localStorage.setItem(LS_TASK_FINISH_BASE_KEY, taskFinishBase.toISOString())
    } else {
      localStorage.removeItem(LS_TASK_FINISH_BASE_KEY)
    }
  }, [taskFinishBase])

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTasks([])
    setTaskName('')
    setTaskHours('')
    setTaskMinutes('')
    setChangeBaseDeadline(null)
    setTaskFinishBase(null)
  }, [deadline, now])

  const workMsLeft = useMemo(() => workMsBetween(now, deadline), [now, deadline])
  const currentTaskMultiplier = ADJUSTED_TASK_MULTIPLIER
  const displayWorkMsLeft = workMsLeft
  const parts = useMemo(() => msToParts(displayWorkMsLeft), [displayWorkMsLeft])
  const displayDeadline = deadline
  const workStartAt = useMemo(() => (isInWorkTime(now) ? now : nextWorkStart(now)), [now])
  const showEarlyFinishReminder = useMemo(
    () => shouldShowEarlyFinishReminder(now, deadline),
    [deadline, now]
  )
  const showDeadlineExtensionReminder = useMemo(
    () => shouldShowDeadlineExtensionReminder(now, deadline, projectionTasks.length > 0),
    [deadline, now, projectionTasks.length]
  )
  const taskFinishStart = useMemo(
    () => pickTaskFinishStart(now, taskFinishBase),
    [now, taskFinishBase]
  )
  const taskFinishTimes = useMemo(
    () => calculateTaskFinishTimes(taskFinishStart, projectionTasks),
    [projectionTasks, taskFinishStart]
  )
  const adjustedTasks = useMemo(
    () =>
      projectionTasks.map((task) => ({
        ...task,
        minutes:
          currentTaskMultiplier === ADJUSTED_TASK_MULTIPLIER
            ? adjustedAssignmentMinutes(task.minutes)
            : task.minutes,
      })),
    [currentTaskMultiplier, projectionTasks]
  )
  const adjustedTaskFinishTimes = useMemo(
    () => calculateTaskFinishTimes(taskFinishStart, adjustedTasks),
    [adjustedTasks, taskFinishStart]
  )
  useEffect(() => {
    if (!persistDraft) return
    const targetAssignmentId = selectedAssignmentId ?? `assignment-${Date.now()}`
    const nextAssignment = buildDraftAssignments(
      targetAssignmentId,
      deadline,
      deadlineExtensionAssignment,
      assignmentOwner,
      tasks,
      taskFinishTimes,
      comments
    )
    const currentDraft = readStoredAssignmentDraft()
    const assignments = replaceTopLevelAssignment(
      currentDraft?.assignments ?? [],
      targetAssignmentId,
      nextAssignment
    )
    const nextDraft: StoredAssignmentDraftV2 = {
      assignments,
    }
    localStorage.setItem(LS_ASSIGNMENT_DRAFT_KEY, JSON.stringify(nextDraft))
  }, [assignmentOwner, comments, deadline, deadlineExtensionAssignment, persistDraft, selectedAssignmentId, tasks, taskFinishTimes])
  const selectedHistoryMonth = useMemo(() => {
    const match = /^(\d{4})-(\d{2})$/.exec(historyMonth)
    if (!match) return null
    const year = Number(match[1])
    const month = Number(match[2])
    if (!Number.isInteger(year) || !Number.isInteger(month)) return null
    if (month < 1 || month > 12) return null
    return { year, month }
  }, [historyMonth])
  const monthlyAssignmentHistory = useMemo(() => {
    if (!selectedHistoryMonth) return assignmentHistory
    return filterAssignmentHistoryEntriesByMonth(
      assignmentHistory,
      selectedHistoryMonth.year,
      selectedHistoryMonth.month
    )
  }, [assignmentHistory, selectedHistoryMonth])
  const currentDraftExportEntry = useMemo(() => {
    if (storedDraft?.assignments.length) {
      const root =
        storedDraft.assignments.find((assignment) => assignment.id === selectedAssignmentId) ??
        storedDraft.assignments[0]
      if (root) {
        const assignments = toHistoryAssignments(root)
        const totalMinutes = assignments.reduce((sum, assignment) => sum + (assignment.estimateMinutes ?? 0), 0)
        return {
          createdAtIso: new Date().toISOString(),
          deadlineIso: root.deadlineIso,
          confirmedBy: root.owner ?? assignmentOwner,
          nextAssignment: '',
          nextAssignmentConfirmedBy: '',
          scheduleView: 'adjusted',
          rootAssignmentId: root.id,
          assignments,
          totalMinutes,
        } satisfies AssignmentHistoryEntry
      }
    }

    const assignment = deadlineExtensionAssignment.trim()
    const tasksForExport = adjustedTasks.filter(
      (task) => task.text.trim().length > 0 && Number.isFinite(task.minutes) && task.minutes > 0
    )
    return buildAssignmentHistoryEntry({
      assignment: assignment || 'Assignment',
      deadline,
      confirmedBy: assignmentOwner,
      scheduleView: 'adjusted',
      tasks: tasksForExport,
    })
  }, [adjustedTasks, assignmentOwner, deadline, deadlineExtensionAssignment, selectedAssignmentId, storedDraft])
  const exportAssignmentHistoryEntries = useMemo(() => {
    if (monthlyAssignmentHistory.length > 0) return monthlyAssignmentHistory
    return [currentDraftExportEntry]
  }, [currentDraftExportEntry, monthlyAssignmentHistory])
  const exportHistoryMinutes = useMemo(
    () => sumAssignmentHistoryEntryMinutes(exportAssignmentHistoryEntries),
    [exportAssignmentHistoryEntries]
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
    localStorage.setItem(LS_PANEL_TASKS_OPEN_KEY, String(isTasksPanelOpen))
  }, [isTasksPanelOpen])

  useEffect(() => {
    localStorage.setItem(
      LS_PANEL_NEXT_ASSIGNMENT_MESSAGE_OPEN_KEY,
      String(isNextAssignmentPanelOpen)
    )
  }, [isNextAssignmentPanelOpen])

  useEffect(() => {
    localStorage.setItem(LS_ASSIGNMENT_HISTORY_KEY, JSON.stringify(assignmentHistory))
  }, [assignmentHistory])

  const updateDeadline = (
    nextDeadline: Date,
    options?: { tasks?: TaskEntry[]; resetDrafts?: boolean }
  ) => {
    const sameDeadline = nextDeadline.getTime() === deadline.getTime()
    if (sameDeadline && options?.resetDrafts) {
      setTasks([])
      setChangeBaseDeadline(null)
      setTaskFinishBase(null)
      return
    }
    if (sameDeadline) return
    setDeadline(nextDeadline)
    if (options?.resetDrafts) {
      setTasks([])
      setChangeBaseDeadline(null)
      setTaskFinishBase(null)
    }
  }

  const onSetDeadline = (v: string) => {
    const d = parseDatetimeLocalValue(v)
    const normalizedDeadline = d ? snapToWorkTime(d) : null
    setDirectDeadlineInput(normalizedDeadline ? toDatetimeLocalValue(normalizedDeadline) : v)
    if (normalizedDeadline) updateDeadline(normalizedDeadline, { resetDrafts: true })
  }

  const reset = () => {
    const next = snapToWorkTime(new Date())
    updateDeadline(next, { resetDrafts: true })
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
    if (nextDeadline) updateDeadline(nextDeadline, { resetDrafts: true })
  }

  const onDurationStartInputChange = (value: string) => {
    const parsedStart = parseDatetimeLocalValue(value)
    const normalizedValue = parsedStart ? toDatetimeLocalValue(snapToWorkTime(parsedStart)) : value
    setDurationStartInput(normalizedValue)
    updateDeadlineFromDurationInputs(normalizedValue, durationHoursInput, durationMinutesInput)
  }

  const onDurationTimeChange = (nextHours: string, nextMinutes: string) => {
    setDurationHoursInput(nextHours)
    setDurationMinutesInput(nextMinutes)
    updateDeadlineFromDurationInputs(durationStartInput, nextHours, nextMinutes)
  }

  const focusDeadlineInput = () => {
    if (deadlineInputMode === 'duration') {
      durationStartRef.current?.focus()
      return
    }
    deadlineRef.current?.focus()
  }

  const deadlineMessageInput = useMemo(() => {
    const messageTasks = adjustedTasks
    const messageDeadline = deadline
    return {
      assignmentTitle: deadlineExtensionAssignment,
      deadlineIso: messageDeadline.toISOString(),
      tasks: messageTasks,
    }
  }, [
    adjustedTasks,
    deadline,
    deadlineExtensionAssignment,
  ])

  const deadlineExtensionMessage = useMemo(() => {
    if (!deadlineExtensionAssignment.trim()) return ''
    if (!assignmentOwner.trim()) return ''
    if (tasks.length === 0) return ''
    const messagePreviousDeadline = changeBaseDeadline ?? deadline
    return formatDeadlineExtensionMessage({
      previous: messagePreviousDeadline,
      next: new Date(deadlineMessageInput.deadlineIso),
      tasks: deadlineMessageInput.tasks,
      assignment: deadlineMessageInput.assignmentTitle,
      assignee: assignmentOwner,
    })
  }, [
    assignmentOwner,
    deadline,
    changeBaseDeadline,
    deadlineExtensionAssignment,
    deadlineMessageInput,
    tasks,
  ])

  const filteredRecentTaskItems = useMemo(() => {
    const needle = assignmentName.trim().toLowerCase()
    if (!needle) return recentTasks
    return recentTasks.filter((item) => item.toLowerCase().includes(needle))
  }, [recentTasks, assignmentName])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecentActiveIndex(filteredRecentTaskItems.length > 0 ? 0 : -1)
  }, [filteredRecentTaskItems])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDeadlineExtensionCopyState('idle')
  }, [deadlineExtensionMessage])

  const previousAssignment = useMemo(() => {
    return assignmentHistory.length > 0 ? readHistoryRootAssignment(assignmentHistory[0]) : null
  }, [assignmentHistory])

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
    if (!previousAssignment) return 'Copy a deadline extension message first to generate this message.'
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
      const next = buildAssignmentHistoryEntry({
        assignment: deadlineMessageInput.assignmentTitle,
        deadline: new Date(deadlineMessageInput.deadlineIso),
        confirmedBy: assignmentOwner,
        nextAssignment: '',
        nextAssignmentConfirmedBy: '',
        scheduleView: 'adjusted',
        tasks: deadlineMessageInput.tasks,
      })
      setAssignmentHistory((prev) => [next, ...prev])
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

  const addTaskEntry = () => {
    const minutes = minutesFromTimeParts(taskHours, taskMinutes)
    if (!assignmentName.trim() || minutes === null) return
    const entry: TaskEntry = {
      text: assignmentName.trim(),
      minutes: Math.round(minutes),
    }
    setRecentTasks((prev) => updateRecentTaskNames(prev, entry.text))
    const nextTasks = sanitizeTaskEntries([...tasks, entry])
    const baseDeadline = pickTaskBatchBase(deadline, changeBaseDeadline)
    const dueBase = pickTaskBatchBase(now, taskFinishBase)
    if (!changeBaseDeadline) {
      setChangeBaseDeadline(baseDeadline)
    }
    if (!taskFinishBase) {
      setTaskFinishBase(dueBase)
    }
    const nextDeadline = officialDeadlineFromAddedAssignments(baseDeadline, nextTasks)
    setTasks(nextTasks)
    setDeadline(nextDeadline)
    if (deadlineInputMode === 'direct') {
      setDirectDeadlineInput(toDatetimeLocalValue(nextDeadline))
    }
    setTaskName('')
    setTaskHours('')
    setTaskMinutes('')
    setIsAddAssignmentFormOpen(false)
  }

  const removeTaskEntry = (index: number) => {
    const nextTasks = sanitizeTaskEntries(tasks.filter((_, i) => i !== index))
    setTasks(nextTasks)
    if (nextTasks.length === 0) {
      if (changeBaseDeadline) {
        setDeadline(changeBaseDeadline)
        if (deadlineInputMode === 'direct') {
          setDirectDeadlineInput(toDatetimeLocalValue(changeBaseDeadline))
        }
      }
      setChangeBaseDeadline(null)
      setTaskFinishBase(null)
      return
    }

    if (changeBaseDeadline) {
      const nextDeadline = officialDeadlineFromAddedAssignments(changeBaseDeadline, nextTasks)
      setDeadline(nextDeadline)
      if (deadlineInputMode === 'direct') {
        setDirectDeadlineInput(toDatetimeLocalValue(nextDeadline))
      }
    }
  }

  const onTaskTimeChange = (nextHours: string, nextMinutes: string) => {
    setTaskHours(nextHours)
    setTaskMinutes(nextMinutes)
  }

  const onExportAssignmentHistoryJson = () => {
    const rawDraft = localStorage.getItem(LS_ASSIGNMENT_DRAFT_KEY)
    const exportMonth = selectedHistoryMonth
      ? `${selectedHistoryMonth.year}-${pad2(selectedHistoryMonth.month)}`
      : 'all'
    let content = JSON.stringify({ assignments: [], exportMonth }, null, 2)
    if (rawDraft) {
      try {
        const parsed = JSON.parse(rawDraft) as { assignments?: unknown }
        const assignments = Array.isArray(parsed.assignments) ? parsed.assignments : []
        content = JSON.stringify({ assignments, exportMonth }, null, 2)
      } catch {
        content = JSON.stringify({ assignments: [], exportMonth }, null, 2)
      }
    }
    const suffix = selectedHistoryMonth
      ? `${selectedHistoryMonth.year}-${pad2(selectedHistoryMonth.month)}`
      : 'all'
    downloadTextFile(`assignment-history-${suffix}.json`, content, 'application/json;charset=utf-8')
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
              {exportAssignmentHistoryEntries.length} assignments, {(exportHistoryMinutes / 60).toFixed(2)} hours
            </div>
            <div className="historyExportActions">
              <button onClick={onExportAssignmentHistoryJson} className="btn-primary">
                <i className="las la-file-code" aria-hidden="true"></i> Export JSON
              </button>
            </div>
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
                  onClick={() => setDeadlineInputMode('direct')}
                  aria-label="Pick exact date/time"
                  title="Pick exact date/time"
                >
                  <i className="las la-clock" aria-hidden="true"></i>
                </button>
                <button
                  type="button"
                  className={`btn-secondary ${deadlineInputMode === 'duration' ? 'isActive' : ''}`}
                  onClick={() => setDeadlineInputMode('duration')}
                  aria-label="Start date + duration"
                  title="Start date + duration"
                >
                  <i className="las la-hourglass-half" aria-hidden="true"></i>
                </button>
              </div>

              {deadlineInputMode === 'direct' ? (
                <input
                  ref={deadlineRef}
                  className="deadlineInput"
                  type="datetime-local"
                  value={directDeadlineInput}
                  onChange={(e) => onSetDeadline(e.target.value)}
                  aria-label="Deadline time"
                />
              ) : (
                <div className="deadlineDurationInputs">
                  <input
                    ref={durationStartRef}
                    className="deadlineInput"
                    type="datetime-local"
                    value={durationStartInput}
                    onChange={(e) => onDurationStartInputChange(e.target.value)}
                    aria-label="Deadline start time"
                  />
                  <HoursMinutesInput
                    hoursText={durationHoursInput}
                    minutesText={durationMinutesInput}
                    onChange={onDurationTimeChange}
                    hoursAriaLabel="Deadline duration hours"
                    minutesAriaLabel="Deadline duration minutes"
                    showLabels={false}
                    hoursInputClassName="deadlineDurationInput"
                    minutesInputClassName="deadlineDurationInput"
                    increaseHoursLabel="Increase deadline duration hours by 1"
                    decreaseHoursLabel="Decrease deadline duration hours by 1"
                    increaseMinutesLabel="Increase deadline duration minutes by 10"
                    decreaseMinutesLabel="Decrease deadline duration minutes by 10"
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
                    <label className="fieldLabel" htmlFor="task-name">
                      Name
                    </label>
                    <div className="assignmentInputWrap">
                      <input
                        id="task-name"
                        type="text"
                        value={assignmentName}
                        onChange={(e) => {
                          const nextValue = e.target.value
                          setTaskName(nextValue)
                          if (nextValue.trim().length === 0) {
                            setIsRecentOpen(true)
                          }
                        }}
                        onFocus={() => setIsRecentOpen(true)}
                        onBlur={() => setIsRecentOpen(false)}
                        onKeyDown={(event) => {
                          if (!isRecentOpen || filteredRecentTaskItems.length === 0) return
                          if (event.key === 'ArrowDown') {
                            event.preventDefault()
                            setRecentActiveIndex((current) =>
                              current < filteredRecentTaskItems.length - 1 ? current + 1 : 0
                            )
                          } else if (event.key === 'ArrowUp') {
                            event.preventDefault()
                            setRecentActiveIndex((current) =>
                              current > 0 ? current - 1 : filteredRecentTaskItems.length - 1
                            )
                          } else if (event.key === 'Enter') {
                            if (recentActiveIndex < 0) return
                            event.preventDefault()
                            const picked = filteredRecentTaskItems[recentActiveIndex]
                            if (!picked) return
                            setTaskName(picked)
                            setIsRecentOpen(false)
                          } else if (event.key === 'Escape') {
                            event.preventDefault()
                            setIsRecentOpen(false)
                          }
                        }}
                      placeholder="Name"
                      aria-label="Name"
                      aria-expanded={isRecentOpen && filteredRecentTaskItems.length > 0}
                      aria-controls="task-recent-list"
                    />
                      {isRecentOpen && filteredRecentTaskItems.length > 0 && (
                        <div
                          id="task-recent-list"
                          className="assignmentRecent"
                          role="listbox"
                          aria-label="Recent assignments"
                        >
                          {filteredRecentTaskItems.map((name) => (
                            <button
                              key={name}
                              type="button"
                              className="assignmentRecentItem"
                              data-state={
                                name === filteredRecentTaskItems[recentActiveIndex] ? 'active' : 'idle'
                              }
                              onMouseDown={(event) => {
                                event.preventDefault()
                                setTaskName(name)
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
                  <HoursMinutesInput
                    hoursText={taskHours}
                    minutesText={taskMinutes}
                    onChange={onTaskTimeChange}
                    hoursInputId="task-hours"
                    minutesInputId="task-minutes"
                    hoursAriaLabel="Hours"
                    minutesAriaLabel="Minutes"
                    increaseHoursLabel="Increase hours by 1"
                    decreaseHoursLabel="Decrease hours by 1"
                    increaseMinutesLabel="Increase minutes by 10"
                    decreaseMinutesLabel="Decrease minutes by 10"
                  />
                  <div className="fieldGroup">
                    <span className="fieldLabel fieldLabelSpacer" aria-hidden="true">
                      Action
                    </span>
                    <button
                      onClick={addTaskEntry}
                      disabled={!assignmentName.trim() || minutesFromTimeParts(taskHours, taskMinutes) === null}
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

            {tasks.length > 0 && (
              <div className="assignmentList">
                {tasks.map((entry, index) => (
                  <AssignmentRow
                    key={`${entry.text}-${index}`}
                    title={entry.text}
                    meta={
                      <span aria-label="Assignment due time display" className="assignmentDueText">
                        <span className="assignmentDueTime">{fmtTime(adjustedTaskFinishTimes[index])}</span>
                        <span aria-hidden="true"> • </span>
                        <span className="assignmentDueDuration">
                          {formatDuration(adjustedTasks[index].minutes)}
                        </span>
                      </span>
                    }
                    action={
                      <button
                        onClick={() => removeTaskEntry(index)}
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
              isOpen={isTasksPanelOpen}
              onToggle={() => setIsTasksPanelOpen((prev) => !prev)}
              panelId="tasks-panel"
            >
              <fieldset disabled={!isTasksPanelOpen} className="messageFieldset">
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
