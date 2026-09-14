import type { TaskDetail } from '@openforge-app/plugin-sdk/domain'
import { CARD_GAP, CARD_HEIGHT, CARD_WIDTH, isOpen, type MapCard } from './cards'

export interface DependencyArrow {
  dependencyTaskId: string
  dependentTaskId: string
}

export interface ArrowPoint {
  x: number
  y: number
}

export interface RoutedArrow extends DependencyArrow {
  /** Unique per card pair, so a Task drawn twice does not collide with itself. */
  key: string
  path: string
}

const LANE_OFFSET = CARD_GAP / 2

function arrowKey(arrow: DependencyArrow): string {
  return `${arrow.dependencyTaskId}->${arrow.dependentTaskId}`
}

function byDependentThenDependency(left: DependencyArrow, right: DependencyArrow): number {
  if (left.dependentTaskId !== right.dependentTaskId) {
    return left.dependentTaskId < right.dependentTaskId ? -1 : 1
  }
  if (left.dependencyTaskId === right.dependencyTaskId) return 0
  return left.dependencyTaskId < right.dependencyTaskId ? -1 : 1
}

export function selectArrows(tasks: readonly TaskDetail[]): DependencyArrow[] {
  const onMap = new Set(tasks.filter(isOpen).map((task) => task.id))
  const arrows = new Map<string, DependencyArrow>()

  for (const task of tasks) {
    if (!onMap.has(task.id)) continue
    for (const dependencyTaskId of task.dependsOn) {
      if (dependencyTaskId === task.id) continue
      if (!onMap.has(dependencyTaskId)) continue
      const arrow = { dependencyTaskId, dependentTaskId: task.id }
      arrows.set(arrowKey(arrow), arrow)
    }
  }

  return [...arrows.values()].sort(byDependentThenDependency)
}

export function arrowPathData(points: readonly ArrowPoint[]): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`).join(' ')
}

function centerX(card: MapCard): number {
  return card.x + CARD_WIDTH / 2
}

function elbow(blocker: MapCard, waiter: MapCard): ArrowPoint[] {
  const waiterAbove = waiter.y + CARD_HEIGHT <= blocker.y
  const waiterBelow = waiter.y >= blocker.y + CARD_HEIGHT

  const start = { x: centerX(blocker), y: waiterAbove ? blocker.y : blocker.y + CARD_HEIGHT }
  const end = { x: centerX(waiter), y: waiterBelow ? waiter.y : waiter.y + CARD_HEIGHT }
  if (start.x === end.x) return [start, end]

  const lane = waiterAbove ? start.y - LANE_OFFSET : start.y + LANE_OFFSET
  return [start, { x: start.x, y: lane }, { x: end.x, y: lane }, end]
}

function cardsByTaskId(cards: readonly MapCard[]): Map<string, MapCard[]> {
  const grouped = new Map<string, MapCard[]>()
  for (const card of cards) {
    const known = grouped.get(card.taskId)
    if (known) known.push(card)
    else grouped.set(card.taskId, [card])
  }
  return grouped
}

export function routeArrows(
  arrows: readonly DependencyArrow[],
  cards: readonly MapCard[],
): RoutedArrow[] {
  const byTaskId = cardsByTaskId(cards)

  return arrows.flatMap((arrow) => {
    const blockers = byTaskId.get(arrow.dependencyTaskId) ?? []
    const waiters = byTaskId.get(arrow.dependentTaskId) ?? []

    return blockers.flatMap((blocker) =>
      waiters.map((waiter) => ({
        ...arrow,
        key: `${blocker.key}->${waiter.key}`,
        path: arrowPathData(elbow(blocker, waiter)),
      })),
    )
  })
}
