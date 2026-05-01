import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  buildAssignmentHistoryEntry,
  exportAssignmentHistoryCsv,
  exportAssignmentHistoryJson,
  filterAssignmentHistoryEntriesByMonth,
  sumAssignmentHistoryEntryMinutes,
  type AssignmentHistoryEntry,
} from './utils/assignmentHistoryUnified'
import { AccordionItem } from './components/Accordion'
import { AssignmentRow } from './components/AssignmentRow'
import { fromLegacyAssignmentDraft, toLegacyAssignmentDraft } from './utils/assignmentAdapters'
import { buildAssignment, type Assignment } from './utils/assignmentModel'
import { formatDeadlineExtensionMessage, formatDuration, type TaskEntry } from './utils/deadlineHistory'
import { clearTextAfterDeadlineChange } from './utils/deadlineChange'
import { formatNextAssignmentMessage } from './utils/nextAssignmentMessage'
import { syncNextAssignmentMessageStartWithDeadline } from './utils/nextAssignmentMessageStart'
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
  applyMinutesDeltaWithCarry,
  calculateTaskFinishTimes,
  minutesFromTimeParts,
  normalizeTaskTimeParts,
  pickTaskBatchBase,
  pickTaskFinishStart,
  roundMinutesToStep,
  stepHoursText,
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
const LS_DEADLINE_EXTENSION_CONFIRMED_BY_KEY = 'aliveline:deadline-extension-confirmed-by'
const LS_NEXT_ASSIGNMENT_KEY = 'aliveline:next-assignment'
const LS_NEXT_ASSIGNMENT_CONFIRMED_BY_KEY = 'aliveline:next-assignment-confirmed-by'
const LS_NEXT_ASSIGNMENT_START_KEY = 'aliveline:next-assignment-start-iso'
const LS_PANEL_ASSIGNMENT_HISTORY_OPEN_KEY = 'aliveline:panel-assignment-history-open'
const LS_PANEL_TASKS_OPEN_KEY = 'aliveline:panel-tasks-open'
const LS_PANEL_NEXT_ASSIGNMENT_MESSAGE_OPEN_KEY = 'aliveline:panel-next-assignment-message-open'
const LS_SCHEDULE_VIEW_MODE_KEY = 'aliveline:schedule-view'
const LS_SCHEDULE_VIEW_ADJUSTED_KEY = 'aliveline:schedule-view-adjusted'
const LS_ADJUSTED_ANCHOR_KEY = 'aliveline:adjusted-anchor-iso'
const LS_ASSIGNMENT_HISTORY_KEY = 'aliveline:assignment-history'
const LS_DAILY_CLEAR_KEY = 'aliveline:daily-clear'
const LS_REMINDER_NOTIFIED_KEY = 'aliveline:reminder-notified'
const LS_REMINDER_REQUESTED_KEY = 'aliveline:reminder-requested'
const LS_DEADLINE_EXTENSION_REMINDER_NOTIFIED_KEY = 'aliveline:deadline-extension-reminder-notified'
const LS_DEADLINE_EXTENSION_REMINDER_REQUESTED_KEY = 'aliveline:deadline-extension-reminder-requested'
const LS_ASSIGNMENT_DRAFT_KEY = 'aliveline:assignment-draft'
const BASE_DEADLINE_MULTIPLIER = 1
const ADJUSTED_DEADLINE_MULTIPLIER = 1
const BASE_TASK_MULTIPLIER = 1
const ADJUSTED_TASK_MULTIPLIER = 0.8
const ADJUSTED_SUFFIX = ' (-20%)'

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

type AssignmentDraftV2 = {
  rootAssignmentId: string
  assignments: Assignment[]
  deadlineIso: string
  assignmentTitle: string
  owner: string
  tasks: TaskEntry[]
  comments: string[]
}

function readStoredAssignmentDraft(rootAssignmentId = 'legacy-root') {
  const saved = localStorage.getItem(LS_ASSIGNMENT_DRAFT_KEY)
  if (!saved) return null
  try {
    const parsed = JSON.parse(saved) as {
      rootAssignmentId?: unknown
      assignments?: unknown
    }
    if (typeof parsed.rootAssignmentId !== 'string') return null
    if (!Array.isArray(parsed.assignments)) return null
    const legacyDraft = toLegacyAssignmentDraft(
      parsed.assignments as Assignment[],
      rootAssignmentId
    )
    if (Number.isNaN(new Date(legacyDraft.deadlineIso).getTime())) return null
    const byId = new Map((parsed.assignments as Assignment[]).map((assignment) => [assignment.id, assignment]))
    const root = byId.get(rootAssignmentId) ?? byId.get(parsed.rootAssignmentId)
    return {
      rootAssignmentId: parsed.rootAssignmentId,
      assignments: parsed.assignments as Assignment[],
      deadlineIso: legacyDraft.deadlineIso,
      assignmentTitle: legacyDraft.assignmentTitle,
      owner: root?.owner ?? '',
      tasks: sanitizeTaskEntries(legacyDraft.tasks),
      comments: root?.comments ?? [],
    } as AssignmentDraftV2
  } catch {
    return null
  }
}

function normalizeTasksViaUnified(deadline: Date, assignmentTitle: string, tasks: TaskEntry[]) {
  return toLegacyAssignmentDraft(
    fromLegacyAssignmentDraft({
      assignmentTitle,
      deadlineIso: deadline.toISOString(),
      tasks,
    }),
    'legacy-root'
  ).tasks
}

function buildDraftAssignments(
  rootAssignmentId: string,
  deadline: Date,
  assignmentTitle: string,
  owner: string,
  tasks: TaskEntry[],
  taskFinishTimes: Date[],
  comments: string[]
) {
  const taskAssignments = tasks.map((task, index) =>
    buildAssignment({
      id: rootAssignmentId === 'legacy-root' ? `legacy-task-${index}` : `${rootAssignmentId}-task-${index}`,
      title: task.text,
      deadlineIso: (taskFinishTimes[index] ?? deadline).toISOString(),
      estimateMinutes: task.minutes,
    })
  )

  const root = buildAssignment({
    id: rootAssignmentId,
    title: assignmentTitle,
    owner,
    deadlineIso: deadline.toISOString(),
    relations: taskAssignments.map((task) => ({ assignmentId: task.id, type: 'extends' })),
    comments,
  })

  return [root, ...taskAssignments]
}

function mergeDraftAssignmentsForRoot(
  existingAssignments: Assignment[],
  rootAssignmentId: string,
  nextRootAssignments: Assignment[]
) {
  const byId = new Map(existingAssignments.map((assignment) => [assignment.id, assignment]))
  const previousRoot = byId.get(rootAssignmentId)
  const previousChildIds = new Set(
    (previousRoot?.relations ?? [])
      .filter((relation) => relation.type === 'extends')
      .map((relation) => relation.assignmentId)
  )

  const keptAssignments = existingAssignments.filter(
    (assignment) => assignment.id !== rootAssignmentId && !previousChildIds.has(assignment.id)
  )

  return [...keptAssignments, ...nextRootAssignments]
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

type ScheduleViewMode = 'original' | 'adjusted'

function readStoredScheduleViewMode() {
  const savedMode = localStorage.getItem(LS_SCHEDULE_VIEW_MODE_KEY)
  if (savedMode === 'original' || savedMode === 'adjusted') {
    return savedMode
  }

  const savedAdjusted = localStorage.getItem(LS_SCHEDULE_VIEW_ADJUSTED_KEY)
  if (savedAdjusted === 'true') return 'adjusted'
  if (savedAdjusted === 'false') return 'original'
  return 'original'
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
  const storedDraft = useMemo(
    () => readStoredAssignmentDraft(selectedAssignmentId ?? 'legacy-root'),
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
  const [deadlineExtensionConfirmedBy, setDeadlineExtensionConfirmedBy] = useState(
    () => localStorage.getItem(LS_DEADLINE_EXTENSION_CONFIRMED_BY_KEY) ?? ''
  )
  const [nextAssignment, setNextAssignment] = useState(
    () => localStorage.getItem(LS_NEXT_ASSIGNMENT_KEY) ?? ''
  )
  const [nextAssignmentConfirmedBy, setNextAssignmentConfirmedBy] = useState(
    () => localStorage.getItem(LS_NEXT_ASSIGNMENT_CONFIRMED_BY_KEY) ?? ''
  )
  const [nextAssignmentStartAt, setNextAssignmentStartAt] = useState<Date | null>(
    () =>
      syncNextAssignmentMessageStartWithDeadline(
        readStoredDate(LS_NEXT_ASSIGNMENT_START_KEY),
        deadline
      )
  )
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
  const [scheduleViewMode, setScheduleViewMode] = useState<ScheduleViewMode>(() =>
    readStoredScheduleViewMode()
  )
  const [assignmentHistory, setAssignmentHistory] = useState<AssignmentHistoryEntry[]>(() =>
    readStoredAssignmentHistory()
  )
  const [historyMonth, setHistoryMonth] = useState(() =>
    `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`
  )
  const [adjustedAnchorAtDeadlineChange, setAdjustedAnchorAtDeadlineChange] = useState(
    () => readStoredDate(LS_ADJUSTED_ANCHOR_KEY) ?? new Date()
  )
  const isAdjustedView = scheduleViewMode === 'adjusted'

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
    setAdjustedAnchorAtDeadlineChange(now)
  }, [deadline, now])

  const workMsLeft = useMemo(() => workMsBetween(now, deadline), [now, deadline])
  const currentTaskMultiplier = isAdjustedView ? ADJUSTED_TASK_MULTIPLIER : BASE_TASK_MULTIPLIER
  const adjustedDeadline = useMemo(() => {
    if (ADJUSTED_DEADLINE_MULTIPLIER === BASE_DEADLINE_MULTIPLIER) return deadline
    const anchor = adjustedAnchorAtDeadlineChange
    if (deadline.getTime() <= anchor.getTime()) return deadline
    const totalWorkMs = workMsBetween(anchor, deadline)
    const adjustedMinutes = Math.max(
      0,
      roundMinutesToStep((totalWorkMs / 60000) * ADJUSTED_DEADLINE_MULTIPLIER)
    )
    return addWorkMinutes(anchor, adjustedMinutes)
  }, [adjustedAnchorAtDeadlineChange, deadline])
  const adjustedWorkMsLeft = useMemo(
    () => workMsBetween(now, adjustedDeadline),
    [adjustedDeadline, now]
  )
  const displayWorkMsLeft = isAdjustedView ? adjustedWorkMsLeft : workMsLeft
  const parts = useMemo(() => msToParts(displayWorkMsLeft), [displayWorkMsLeft])
  const displayDeadline = isAdjustedView ? adjustedDeadline : deadline
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
        minutes: Math.max(1, roundMinutesToStep(task.minutes * currentTaskMultiplier)),
      })),
    [currentTaskMultiplier, projectionTasks]
  )
  const adjustedTaskFinishTimes = useMemo(
    () => calculateTaskFinishTimes(taskFinishStart, adjustedTasks),
    [adjustedTasks, taskFinishStart]
  )
  useEffect(() => {
    if (!persistDraft) return
    const targetRootId = selectedAssignmentId ?? 'legacy-root'
    const nextRootAssignments = buildDraftAssignments(
      targetRootId,
      deadline,
      deadlineExtensionAssignment,
      assignmentOwner,
      tasks,
      taskFinishTimes,
      comments
    )
    const currentDraft = readStoredAssignmentDraft()
    const assignments = selectedAssignmentId
      ? mergeDraftAssignmentsForRoot(currentDraft?.assignments ?? [], targetRootId, nextRootAssignments)
      : nextRootAssignments
    const nextDraft: AssignmentDraftV2 = {
      rootAssignmentId: currentDraft?.rootAssignmentId ?? 'legacy-root',
      assignments,
      deadlineIso: deadline.toISOString(),
      assignmentTitle: deadlineExtensionAssignment,
      owner: assignmentOwner,
      tasks,
      comments,
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
  const monthlyHistoryMinutes = useMemo(
    () => sumAssignmentHistoryEntryMinutes(monthlyAssignmentHistory),
    [monthlyAssignmentHistory]
  )

  const toggleAdjustedView = () => {
    setScheduleViewMode((prev) => (prev === 'original' ? 'adjusted' : 'original'))
  }

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
    localStorage.setItem(LS_DEADLINE_EXTENSION_CONFIRMED_BY_KEY, deadlineExtensionConfirmedBy)
  }, [deadlineExtensionConfirmedBy])

  useEffect(() => {
    localStorage.setItem(LS_NEXT_ASSIGNMENT_KEY, nextAssignment)
  }, [nextAssignment])

  useEffect(() => {
    localStorage.setItem(LS_NEXT_ASSIGNMENT_CONFIRMED_BY_KEY, nextAssignmentConfirmedBy)
  }, [nextAssignmentConfirmedBy])

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
    localStorage.setItem(LS_SCHEDULE_VIEW_MODE_KEY, scheduleViewMode)
    localStorage.removeItem(LS_SCHEDULE_VIEW_ADJUSTED_KEY)
  }, [scheduleViewMode])

  useEffect(() => {
    localStorage.setItem(LS_ADJUSTED_ANCHOR_KEY, adjustedAnchorAtDeadlineChange.toISOString())
  }, [adjustedAnchorAtDeadlineChange])

  useEffect(() => {
    localStorage.setItem(LS_ASSIGNMENT_HISTORY_KEY, JSON.stringify(assignmentHistory))
  }, [assignmentHistory])

  useEffect(() => {
    if (nextAssignmentStartAt) {
      localStorage.setItem(LS_NEXT_ASSIGNMENT_START_KEY, nextAssignmentStartAt.toISOString())
    } else {
      localStorage.removeItem(LS_NEXT_ASSIGNMENT_START_KEY)
    }
  }, [nextAssignmentStartAt])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNextAssignmentStartAt((prev) =>
      syncNextAssignmentMessageStartWithDeadline(prev, deadline)
    )
  }, [deadline])

  const updateDeadline = (
    nextDeadline: Date,
    options?: { tasks?: TaskEntry[]; resetDrafts?: boolean }
  ) => {
    const sameDeadline = nextDeadline.getTime() === deadline.getTime()
    if (sameDeadline && options?.resetDrafts) {
      setTasks([])
      setChangeBaseDeadline(null)
      setTaskFinishBase(null)
      setAdjustedAnchorAtDeadlineChange(new Date())
      return
    }
    if (sameDeadline) return
    setDeadlineExtensionAssignment(clearTextAfterDeadlineChange(deadlineExtensionAssignment))
    setNextAssignment(clearTextAfterDeadlineChange(nextAssignment))
    setDeadline(nextDeadline)
    if (options?.resetDrafts) {
      setAdjustedAnchorAtDeadlineChange(new Date())
      setTasks([])
      setChangeBaseDeadline(null)
      setTaskFinishBase(null)
    }
  }

  const onSetDeadline = (v: string) => {
    const d = parseDatetimeLocalValue(v)
    if (d) updateDeadline(d, { resetDrafts: true })
  }

  const reset = () => {
    updateDeadline(new Date(), { resetDrafts: true })
  }

  const deadlineMessageInput = useMemo(() => {
    const messageTasks = isAdjustedView ? adjustedTasks : tasks
    const messageDeadline = isAdjustedView ? adjustedDeadline : deadline
    return {
      assignmentTitle: deadlineExtensionAssignment,
      deadlineIso: messageDeadline.toISOString(),
      tasks: messageTasks,
    }
  }, [
    adjustedDeadline,
    adjustedTasks,
    deadline,
    deadlineExtensionAssignment,
    isAdjustedView,
    tasks,
  ])

  const deadlineExtensionMessage = useMemo(() => {
    if (!deadlineExtensionAssignment.trim()) return ''
    if (!deadlineExtensionConfirmedBy.trim()) return ''
    if (tasks.length === 0) return ''
    const messagePreviousDeadline = changeBaseDeadline ?? (isAdjustedView ? adjustedDeadline : deadline)
    return formatDeadlineExtensionMessage({
      previous: messagePreviousDeadline,
      next: new Date(deadlineMessageInput.deadlineIso),
      tasks: deadlineMessageInput.tasks,
      assignment: deadlineMessageInput.assignmentTitle,
      assignee: deadlineExtensionConfirmedBy,
    })
  }, [
    adjustedDeadline,
    deadline,
    deadlineExtensionConfirmedBy,
    changeBaseDeadline,
    deadlineExtensionAssignment,
    deadlineMessageInput,
    isAdjustedView,
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

  const nextAssignmentMessage = useMemo(() => {
    if (!nextAssignmentStartAt) return ''
    if (!deadlineExtensionAssignment.trim()) return ''
    if (!nextAssignment.trim()) return ''
    if (!nextAssignmentConfirmedBy.trim()) return ''
    return formatNextAssignmentMessage({
      completedAssignment: deadlineExtensionAssignment,
      nextAssignment,
      assignee: nextAssignmentConfirmedBy,
      start: nextAssignmentStartAt,
      deadline,
    })
  }, [
    deadline,
    deadlineExtensionAssignment,
    nextAssignment,
    nextAssignmentConfirmedBy,
    nextAssignmentStartAt,
  ])

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
        confirmedBy: deadlineExtensionConfirmedBy,
        nextAssignment,
        nextAssignmentConfirmedBy,
        scheduleView: isAdjustedView ? 'adjusted' : 'original',
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
    const nextTasks = normalizeTasksViaUnified(deadline, deadlineExtensionAssignment, [
      ...tasks,
      entry,
    ])
    const baseDeadline = pickTaskBatchBase(deadline, changeBaseDeadline)
    const dueBase = pickTaskBatchBase(now, taskFinishBase)
    if (!changeBaseDeadline) {
      setChangeBaseDeadline(baseDeadline)
    }
    if (!taskFinishBase) {
      setTaskFinishBase(dueBase)
    }
    const totalMinutes = nextTasks.reduce((sum, task) => sum + task.minutes, 0)
    const nextDeadline = addWorkMinutes(baseDeadline, totalMinutes)
    setTasks(nextTasks)
    setDeadline(nextDeadline)
    setTaskName('')
    setTaskHours('')
    setTaskMinutes('')
    setIsAddAssignmentFormOpen(false)
  }

  const removeTaskEntry = (index: number) => {
    const nextTasks = normalizeTasksViaUnified(
      deadline,
      deadlineExtensionAssignment,
      tasks.filter((_, i) => i !== index)
    )
    setTasks(nextTasks)
    if (nextTasks.length === 0) {
      if (changeBaseDeadline) {
        setDeadline(changeBaseDeadline)
      }
      setChangeBaseDeadline(null)
      setTaskFinishBase(null)
      return
    }

    if (changeBaseDeadline) {
      const totalMinutes = nextTasks.reduce((sum, task) => sum + task.minutes, 0)
      setDeadline(addWorkMinutes(changeBaseDeadline, totalMinutes))
    }
  }

  const onTaskMinutesChange = (value: string) => {
    const normalized = normalizeTaskTimeParts(taskHours, value)
    setTaskHours(normalized.hoursText)
    setTaskMinutes(normalized.minutesText)
  }

  const onStepTaskHours = (delta: number) => {
    setTaskHours((prev) => stepHoursText(prev, delta))
  }

  const onStepTaskMinutes = (delta: number) => {
    const normalized = applyMinutesDeltaWithCarry(taskHours, taskMinutes, delta)
    setTaskHours(normalized.hoursText)
    setTaskMinutes(normalized.minutesText)
  }

  const onExportAssignmentHistoryCsv = () => {
    const content = exportAssignmentHistoryCsv(monthlyAssignmentHistory)
    const suffix = selectedHistoryMonth
      ? `${selectedHistoryMonth.year}-${pad2(selectedHistoryMonth.month)}`
      : 'all'
    downloadTextFile(`assignment-history-${suffix}.csv`, content, 'text/csv;charset=utf-8')
  }

  const onExportAssignmentHistoryJson = () => {
    const content = exportAssignmentHistoryJson(monthlyAssignmentHistory)
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
        title="Deadline extension message"
        isOpen={isTasksPanelOpen}
        onToggle={() => setIsTasksPanelOpen((prev) => !prev)}
        panelId="tasks-panel"
      >
        <fieldset disabled={!isTasksPanelOpen} className="messageFieldset">
          <div className="messageBody">
            <div className="messageFields">
              <div className="fieldGroup">
                <label className="fieldLabel" htmlFor="deadline-extension-assignment">
                  Assignment
                </label>
                <input
                  id="deadline-extension-assignment"
                  type="text"
                  value={deadlineExtensionAssignment}
                  onChange={(e) => setDeadlineExtensionAssignment(e.target.value)}
                  placeholder="Assignment"
                  aria-label="Assignment name"
                />
              </div>
              <div className="fieldGroup">
                <label className="fieldLabel" htmlFor="deadline-extension-confirmed-by">
                  Confirmed by
                </label>
                <input
                  id="deadline-extension-confirmed-by"
                  type="text"
                  value={deadlineExtensionConfirmedBy}
                  onChange={(e) => setDeadlineExtensionConfirmedBy(e.target.value)}
                  placeholder="Confirmed by"
                  aria-label="Confirmed by"
                />
              </div>
            </div>

            <div className="messagePreview" aria-label="Deadline extension message preview">
              {deadlineExtensionMessage ||
                'Fill all fields to generate a deadline extension message preview.'}
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
            <div className="nextAssignmentMessageFields">
              <div className="fieldGroup">
                <label
                  className="fieldLabel"
                  htmlFor="next-assignment-message-completed-assignment"
                >
                  Completed assignment
                </label>
                <input
                  id="next-assignment-message-completed-assignment"
                  type="text"
                  value={deadlineExtensionAssignment}
                  onChange={(e) => setDeadlineExtensionAssignment(e.target.value)}
                  placeholder="Completed assignment"
                  aria-label="Completed assignment"
                />
              </div>
              <div className="fieldGroup">
                <label className="fieldLabel" htmlFor="next-assignment-message-next-assignment">
                  Next assignment
                </label>
                <input
                  id="next-assignment-message-next-assignment"
                  type="text"
                  value={nextAssignment}
                  onChange={(e) => setNextAssignment(e.target.value)}
                  placeholder="Next assignment"
                  aria-label="Next assignment"
                />
              </div>
              <div className="fieldGroup nextAssignmentMessageConfirmedBy">
                <label className="fieldLabel" htmlFor="next-assignment-message-confirmed-by">
                  Confirmed by
                </label>
                <input
                  id="next-assignment-message-confirmed-by"
                  type="text"
                  value={nextAssignmentConfirmedBy}
                  onChange={(e) => setNextAssignmentConfirmedBy(e.target.value)}
                  placeholder="Confirmed by"
                  aria-label="Next assignment message confirmed by"
                />
              </div>
              <div className="fieldGroup nextAssignmentStartAt">
                <label className="fieldLabel" htmlFor="next-assignment-message-start-at">
                  Start time
                </label>
                <input
                  id="next-assignment-message-start-at"
                  type="datetime-local"
                  value={nextAssignmentStartAt ? toDatetimeLocalValue(nextAssignmentStartAt) : ''}
                  disabled
                  readOnly
                  aria-label="Start time"
                />
              </div>
            </div>

            <div className="messagePreview" aria-label="Next assignment message preview">
              {nextAssignmentMessage || 'Fill all fields to generate a next assignment message.'}
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
              {monthlyAssignmentHistory.length} assignments, {(monthlyHistoryMinutes / 60).toFixed(2)} hours
            </div>
            <div className="historyExportActions">
              <button onClick={onExportAssignmentHistoryCsv} className="btn-secondary">
                <i className="las la-file-csv" aria-hidden="true"></i> Export CSV
              </button>
              <button onClick={onExportAssignmentHistoryJson} className="btn-secondary">
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
                <div className="deadline">
                  <button
                    type="button"
                    className="valueToggle deadlineValue"
                    aria-label="Toggle original and adjusted schedule"
                    onClick={toggleAdjustedView}
                  >
                    <span aria-label="Current deadline display">
                      {fmtDateTimeWithWeekday(displayDeadline)}
                      {isAdjustedView ? ADJUSTED_SUFFIX : ''}
                    </span>
                  </button>
                </div>
              </div>

              <div className="block">
                <div className="label">Remaining (work time)</div>
                <div className="remaining">
                  <button
                    type="button"
                    className="valueToggle remainingValue"
                    aria-label="Toggle schedule display from remaining work time"
                    onClick={toggleAdjustedView}
                  >
                    <span aria-label="Remaining work time display">
                      {parts.days > 0 && `${parts.days}d `}
                      {parts.hours}h {parts.minutes}m {parts.seconds}s
                      {isAdjustedView ? ADJUSTED_SUFFIX : ''}
                    </span>
                  </button>
                </div>
              </div>
              {showEarlyFinishReminder && (
                <div className="reminder">Reminder: ask for more work before 9:00 AM.</div>
              )}
              {showDeadlineExtensionReminder && <div className="reminder">Reminder: post the deadline extension message.</div>}
              {!isInWorkTime(now) && (
                <div className="overdue metaTextMutedSm">
                  Counting from {fmtDateTimeWithWeekday(workStartAt)}.
                </div>
              )}
            </div>

            <div className="controls">
              <input
                ref={deadlineRef}
                className="deadlineInput"
                type="datetime-local"
                value={toDatetimeLocalValue(deadline)}
                onChange={(e) => onSetDeadline(e.target.value)}
                aria-label="Deadline time"
              />

              <button
                onClick={reset}
                className="resetButton btn-secondary"
                aria-label="Reset deadline to now"
              >
                Reset
              </button>
            </div>
          </div>

          <div className="assignmentSection">
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
                <div className="fieldGroup">
                  <label className="fieldLabel" htmlFor="task-hours">
                    Hours
                  </label>
                  <div className="assignmentHoursInputWrap">
                    <input
                      id="task-hours"
                      type="number"
                      min="0"
                      step="1"
                      value={taskHours}
                      onChange={(e) => setTaskHours(e.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'ArrowUp') {
                          event.preventDefault()
                          onStepTaskHours(1)
                          return
                        }

                        if (event.key === 'ArrowDown') {
                          event.preventDefault()
                          onStepTaskHours(-1)
                        }
                      }}
                      placeholder="Hours"
                      aria-label="Hours"
                    />
                    <div className="assignmentHoursStepButtons">
                      <button
                        type="button"
                        className="assignmentStepButton"
                        data-dir="up"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => onStepTaskHours(1)}
                        aria-label="Increase hours by 1"
                      />
                      <button
                        type="button"
                        className="assignmentStepButton"
                        data-dir="down"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => onStepTaskHours(-1)}
                        aria-label="Decrease hours by 1"
                      />
                    </div>
                  </div>
                </div>
                <div className="fieldGroup">
                  <label className="fieldLabel" htmlFor="task-minutes">
                    Minutes
                  </label>
                  <div className="assignmentMinutesInputWrap">
                    <input
                      id="task-minutes"
                      type="number"
                      min="-60"
                      step="1"
                      value={taskMinutes}
                      onChange={(e) => onTaskMinutesChange(e.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'ArrowUp') {
                          event.preventDefault()
                          onStepTaskMinutes(10)
                          return
                        }

                        if (event.key === 'ArrowDown') {
                          event.preventDefault()
                          onStepTaskMinutes(-10)
                        }
                      }}
                      placeholder="Minutes"
                      aria-label="Minutes"
                    />
                    <div className="assignmentMinutesStepButtons">
                      <button
                        type="button"
                        className="assignmentStepButton"
                        data-dir="up"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => onStepTaskMinutes(10)}
                        aria-label="Increase minutes by 10"
                      />
                      <button
                        type="button"
                        className="assignmentStepButton"
                        data-dir="down"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => onStepTaskMinutes(-10)}
                        aria-label="Decrease minutes by 10"
                      />
                    </div>
                  </div>
                </div>
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

            {tasks.length > 0 && (
              <div className="assignmentList">
                {tasks.map((entry, index) => (
                  <AssignmentRow
                    key={`${entry.text}-${index}`}
                    title={entry.text}
                    middle={
                      <button
                        type="button"
                        className="valueToggle assignmentDueValue"
                        aria-label="Toggle schedule display from assignment due time"
                        onClick={toggleAdjustedView}
                      >
                        <span aria-label="Assignment due time display" className="assignmentDueText">
                          <span className="assignmentDueTime">
                            {isAdjustedView
                              ? fmtTime(adjustedTaskFinishTimes[index])
                              : fmtTime(taskFinishTimes[index])}
                          </span>
                          <span aria-hidden="true"> • </span>
                          <span className="assignmentDueDuration">
                            {isAdjustedView
                              ? `${formatDuration(adjustedTasks[index].minutes)}${ADJUSTED_SUFFIX}`
                              : formatDuration(entry.minutes)}
                          </span>
                        </span>
                      </button>
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

            {comments.length > 0 && (
              <div className="assignmentList">
                {comments.map((comment, index) => (
                  <AssignmentRow
                    key={`${comment}-${index}`}
                    title={comment}
                    middle={<span aria-hidden="true"></span>}
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

          {showMessagesSection ? messagesSection : null}
        </div>
      </div>
    </div>
  )
}
