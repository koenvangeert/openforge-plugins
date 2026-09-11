import type { TaskDetail } from '@openforge-app/plugin-sdk/domain'
import {
  CANVAS_PADDING,
  CARD_GAP,
  CARD_HEIGHT,
  CARD_WIDTH,
  isOpen,
  layoutCards,
  type MapCard,
} from './cards'

export const OTHER_REGION_TITLE = 'No label / Other'
export const REGION_HEADING_HEIGHT = 40

export interface MapRegion {
  label: string | null
  y: number
  height: number
  cards: MapCard[]
}

export interface MapExtent {
  width: number
  height: number
}

export function seedRegionLabels(tasks: readonly TaskDetail[]): string[] {
  const names = new Set<string>()
  for (const task of tasks) {
    if (!isOpen(task)) continue
    for (const label of task.labels) names.add(label.name)
  }
  return [...names].sort((left, right) => left.localeCompare(right))
}

export function primaryRegionLabel(
  task: TaskDetail,
  curatedLabels: readonly string[],
): string | null {
  const carried = new Set(task.labels.map((label) => label.name))
  return curatedLabels.find((label) => carried.has(label)) ?? null
}

export function regionTitle(region: MapRegion): string {
  return region.label ?? OTHER_REGION_TITLE
}

export function regionCards(regions: readonly MapRegion[]): MapCard[] {
  return regions.flatMap((region) => region.cards)
}

function regionHeight(cards: readonly MapCard[], originY: number): number {
  const bottom = cards.reduce(
    (lowest, card) => Math.max(lowest, card.y + CARD_HEIGHT),
    originY + REGION_HEADING_HEIGHT + CARD_HEIGHT,
  )
  return bottom - originY
}

export function assembleRegions(
  tasks: readonly TaskDetail[],
  curatedLabels: readonly string[],
): MapRegion[] {
  const curated = [...new Set(curatedLabels)]
  const placed = tasks
    .filter(isOpen)
    .map((task) => ({ task, primary: primaryRegionLabel(task, curated) }))

  const regions: MapRegion[] = []
  let y = CANVAS_PADDING
  for (const label of [...curated, null]) {
    const members = placed.filter((entry) => entry.primary === label).map((entry) => entry.task)
    const cards = layoutCards(members, y + REGION_HEADING_HEIGHT)
    const height = regionHeight(cards, y)
    regions.push({ label, y, height, cards })
    y += height + CARD_GAP
  }
  return regions
}

export function mapExtent(regions: readonly MapRegion[]): MapExtent {
  const right = regionCards(regions).reduce(
    (widest, card) => Math.max(widest, card.x + CARD_WIDTH),
    CANVAS_PADDING + CARD_WIDTH,
  )
  const bottom = regions.reduce(
    (lowest, region) => Math.max(lowest, region.y + region.height),
    CANVAS_PADDING,
  )
  return { width: right + CANVAS_PADDING, height: bottom + CANVAS_PADDING }
}
