export type AssignmentStatus = 'todo' | 'in_progress' | 'done'

export type AssignmentRelationType = 'blocks' | 'extends' | 'relates_to'

export type AssignmentRelation = {
  assignmentId: string
  type: AssignmentRelationType
}

export type Assignment = {
  id: string
  title: string
  deadlineIso: string
  status: AssignmentStatus
  estimateMinutes?: number
  relations: AssignmentRelation[]
}

type BuildAssignmentInput = {
  id: string
  title: string
  deadlineIso: string
  status?: AssignmentStatus
  estimateMinutes?: number
  relations?: AssignmentRelation[]
}

function normalizeEstimateMinutes(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined
  return Math.round(value)
}

function normalizeRelations(relations: AssignmentRelation[] | undefined) {
  if (!Array.isArray(relations)) return [] as AssignmentRelation[]

  const seen = new Set<string>()
  const normalized: AssignmentRelation[] = []

  for (const relation of relations) {
    const assignmentId = relation.assignmentId.trim()
    if (!assignmentId) continue
    const dedupeKey = `${relation.type}:${assignmentId}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    normalized.push({ assignmentId, type: relation.type })
  }

  return normalized
}

export function buildAssignment(input: BuildAssignmentInput): Assignment {
  return {
    id: input.id,
    title: input.title.trim(),
    deadlineIso: input.deadlineIso,
    status: input.status ?? 'todo',
    estimateMinutes: normalizeEstimateMinutes(input.estimateMinutes),
    relations: normalizeRelations(input.relations),
  }
}

export function relationIdsByType(assignment: Assignment, type: AssignmentRelationType) {
  return assignment.relations
    .filter((relation) => relation.type === type)
    .map((relation) => relation.assignmentId)
}

export function hasDependencyCycle(assignments: Assignment[]) {
  const graph = new Map<string, string[]>()

  for (const assignment of assignments) {
    graph.set(assignment.id, relationIdsByType(assignment, 'blocks'))
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()

  function dfs(node: string): boolean {
    if (visiting.has(node)) return true
    if (visited.has(node)) return false

    visiting.add(node)
    const neighbors = graph.get(node) ?? []

    for (const neighbor of neighbors) {
      if (!graph.has(neighbor)) continue
      if (dfs(neighbor)) return true
    }

    visiting.delete(node)
    visited.add(node)
    return false
  }

  for (const node of graph.keys()) {
    if (dfs(node)) return true
  }

  return false
}
