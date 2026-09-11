import type { TaskDetail } from '@openforge-app/plugin-sdk/domain'
import {
  CANVAS_PADDING,
  CARD_GAP,
  CARD_HEIGHT,
  CARD_WIDTH,
  CARDS_PER_ROW,
  isOpen,
  layoutCards,
  type CardPosition,
  type CardPositions,
  type MapCard,
} from './cards'

export const OTHER_REGION_TITLE = 'No label / Other'
export const REGION_HEADING_HEIGHT = 40
export const BAND_CONTENT_WIDTH = CARD_WIDTH * CARDS_PER_ROW + CARD_GAP * (CARDS_PER_ROW - 1)

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

export interface CanvasPoint {
  x: number
  y: number
}

type RegionBox = Pick<MapRegion, 'label' | 'y'>

function regionOrigin(region: RegionBox): CanvasPoint {
  return { x: CANVAS_PADDING, y: region.y + REGION_HEADING_HEIGHT }
}

function clampToRegion(region: RegionBox, point: CanvasPoint): CanvasPoint {
  const origin = regionOrigin(region)
  return {
    x: Math.min(Math.max(point.x, origin.x), origin.x + BAND_CONTENT_WIDTH - CARD_WIDTH),
    // No lower bound: the band grows to hold a card dragged below its rows.
    y: Math.max(point.y, origin.y),
  }
}

function toCanvasPoint(region: RegionBox, position: CardPosition): CanvasPoint {
  const origin = regionOrigin(region)
  return clampToRegion(region, { x: origin.x + position.x, y: origin.y + position.y })
}

function toRegionOffset(region: RegionBox, point: CanvasPoint): CardPosition {
  const origin = regionOrigin(region)
  const rested = clampToRegion(region, point)
  return { region: region.label, x: rested.x - origin.x, y: rested.y - origin.y }
}

function regionOfCard(regions: readonly MapRegion[], taskId: string): MapRegion | null {
  return regions.find((region) => region.cards.some((card) => card.taskId === taskId)) ?? null
}

export function dragCardTo(
  regions: readonly MapRegion[],
  taskId: string,
  point: CanvasPoint,
): CardPosition | null {
  const region = regionOfCard(regions, taskId)
  return region ? toRegionOffset(region, point) : null
}

// A position for a Task that left the map is not stale, only unused: a Completed
// Task must not lose where the user put it.
export function stalePositionIds(
  regions: readonly MapRegion[],
  positions: CardPositions,
): string[] {
  const bandOf = new Map(
    regions.flatMap((region) => region.cards.map((card) => [card.taskId, region.label] as const)),
  )
  return Object.entries(positions)
    .filter(([taskId, position]) => bandOf.has(taskId) && bandOf.get(taskId) !== position.region)
    .map(([taskId]) => taskId)
}

function placeCard(region: RegionBox, card: MapCard, position: CardPosition | undefined): MapCard {
  if (!position || position.region !== region.label) return card
  return { ...card, ...toCanvasPoint(region, position) }
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

type UnstackedRegion = Pick<MapRegion, 'label' | 'y' | 'cards'>

function stackRegions(regions: readonly UnstackedRegion[]): MapRegion[] {
  let top = CANVAS_PADDING
  return regions.map((region) => {
    const shift = top - region.y
    const cards = shift ? region.cards.map((card) => ({ ...card, y: card.y + shift })) : region.cards
    const stacked = { ...region, y: top, cards, height: regionHeight(cards, top) }
    top += stacked.height + CARD_GAP
    return stacked
  })
}

export function assembleRegions(
  tasks: readonly TaskDetail[],
  curatedLabels: readonly string[],
  positions: CardPositions = {},
): MapRegion[] {
  const curated = [...new Set(curatedLabels)]
  const placed = tasks
    .filter(isOpen)
    .map((task) => ({ task, primary: primaryRegionLabel(task, curated) }))

  return stackRegions(
    [...curated, null].map((label) => {
      const members = placed.filter((entry) => entry.primary === label).map((entry) => entry.task)
      return {
        label,
        y: 0,
        cards: layoutCards(members, REGION_HEADING_HEIGHT).map((card) =>
          placeCard({ label, y: 0 }, card, positions[card.taskId]),
        ),
      }
    }),
  )
}

export function withDraggedCard(
  regions: readonly MapRegion[],
  taskId: string,
  position: CardPosition,
): readonly MapRegion[] {
  if (!regionOfCard(regions, taskId)) return regions

  return stackRegions(
    regions.map((region) => ({
      ...region,
      cards: region.cards.map((card) =>
        card.taskId === taskId ? placeCard(region, card, position) : card,
      ),
    })),
  )
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
