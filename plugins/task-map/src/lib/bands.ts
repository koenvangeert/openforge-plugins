import type { TaskDetail } from '@openforge-app/plugin-sdk/domain'
import {
  CANVAS_PADDING,
  CARD_GAP,
  CARD_HEIGHT,
  CARD_WIDTH,
  cardKey,
  isOpen,
  layoutCards,
  type CardPosition,
  type CardPositions,
  type CardSlot,
  type MapCard,
  type OpenTask,
} from './cards'
import type { CanvasPoint } from './viewport'

export const OTHER_BAND_TITLE = 'No label / Other'
export const BAND_HEADING_HEIGHT = 40
export const BAND_PADDING = 16
export const SEED_CARDS_PER_ROW = 4

export type Band = {
  label: string | null
  x: number
  y: number
  width: number
  height: number
}

export interface MapBand extends Band {
  cards: MapCard[]
}

export interface MapSize {
  width: number
  height: number
}

export function bandWidthFor(perRow: number): number {
  return perRow * CARD_WIDTH + (perRow - 1) * CARD_GAP + BAND_PADDING * 2
}

export const MIN_BAND_WIDTH = bandWidthFor(1)
export const MIN_BAND_HEIGHT = BAND_HEADING_HEIGHT + CARD_HEIGHT + BAND_PADDING

export function cardsPerRow(width: number): number {
  const content = width - BAND_PADDING * 2 + CARD_GAP
  return Math.max(1, Math.floor(content / (CARD_WIDTH + CARD_GAP)))
}

export function bandTitle(band: Pick<Band, 'label'>): string {
  return band.label ?? OTHER_BAND_TITLE
}

// A Band's title is not its identity: a Task Label could be named "No label / Other".
export function bandKey(label: string | null): string {
  return JSON.stringify(label)
}

export function bandOrigin(band: Pick<Band, 'x' | 'y'>): CanvasPoint {
  return { x: band.x + BAND_PADDING, y: band.y + BAND_HEADING_HEIGHT }
}

function contentHeight(slots: readonly CardSlot[]): number {
  const rows = slots.reduce((lowest, slot) => Math.max(lowest, slot.y + CARD_HEIGHT), 0)
  return BAND_HEADING_HEIGHT + rows + BAND_PADDING
}

function activeTasks(tasks: readonly TaskDetail[]): OpenTask[] {
  return tasks.filter(isOpen)
}

export function labelsInUse(tasks: readonly TaskDetail[]): string[] {
  const names = new Set<string>()
  for (const task of activeTasks(tasks)) {
    for (const label of task.labels) names.add(label.name)
  }
  return [...names].sort((left, right) => left.localeCompare(right))
}

function taggedWith(tasks: readonly OpenTask[], label: string): OpenTask[] {
  return tasks.filter((task) => task.labels.some((carried) => carried.name === label))
}

function untagged(tasks: readonly OpenTask[], curated: ReadonlySet<string>): OpenTask[] {
  return tasks.filter((task) => !task.labels.some((carried) => curated.has(carried.name)))
}

function membersOf(
  tasks: readonly OpenTask[],
  curated: ReadonlySet<string>,
  label: string | null,
): OpenTask[] {
  return label === null ? untagged(tasks, curated) : taggedWith(tasks, label)
}

function sizedBand(label: string | null, y: number, members: readonly OpenTask[]): Band {
  const width = bandWidthFor(SEED_CARDS_PER_ROW)
  return {
    label,
    x: CANVAS_PADDING,
    y,
    width,
    height: Math.max(MIN_BAND_HEIGHT, contentHeight(layoutCards(members, SEED_CARDS_PER_ROW))),
  }
}

export function seedBands(tasks: readonly TaskDetail[]): Band[] {
  const open = activeTasks(tasks)
  const curated = new Set(labelsInUse(tasks))

  const bands: Band[] = []
  let top = CANVAS_PADDING
  for (const label of [...curated, null]) {
    const band = sizedBand(label, top, membersOf(open, curated, label))
    bands.push(band)
    top += band.height + CARD_GAP
  }
  return bands
}

function dedupeBands(bands: readonly Band[]): Band[] {
  const byLabel = new Map<string | null, Band>()
  for (const band of bands) if (!byLabel.has(band.label)) byLabel.set(band.label, band)
  return [...byLabel.values()]
}

function bottomOf(bands: readonly Band[]): number {
  return bands.reduce((lowest, band) => Math.max(lowest, band.y + band.height), 0)
}

export function withOtherBand(bands: readonly Band[]): Band[] {
  if (bands.some((band) => band.label === null)) return [...bands]
  return [...bands, sizedBand(null, bottomOf(bands) + CARD_GAP, [])]
}

export function curatedLabels(bands: readonly Band[]): string[] {
  return bands.flatMap((band) => (band.label === null ? [] : [band.label]))
}

function toCard(band: Band, slot: CardSlot, position: CardPosition | undefined): MapCard {
  const origin = bandOrigin(band)
  const offset = position ?? slot
  return {
    ...slot,
    key: cardKey(band.label, slot.taskId),
    band: band.label,
    // Clamped here rather than at the drop: the offset is Band-relative, so a
    // Band moved left afterwards would otherwise carry its cards off the canvas.
    x: Math.max(origin.x + offset.x, 0),
    y: Math.max(origin.y + offset.y, 0),
  }
}

export function assembleBands(
  tasks: readonly TaskDetail[],
  bands: readonly Band[],
  positions: CardPositions = [],
): MapBand[] {
  const placed = withOtherBand(dedupeBands(bands))
  const curated = new Set(curatedLabels(placed))
  const open = activeTasks(tasks)
  const stored = new Map(positions.map((position) => [cardKey(position.band, position.taskId), position]))

  return placed.map((band) => {
    const width = Math.max(band.width, MIN_BAND_WIDTH)
    const slots = layoutCards(membersOf(open, curated, band.label), cardsPerRow(width))
    const drawn = { ...band, width, height: Math.max(band.height, contentHeight(slots)) }
    return {
      ...drawn,
      cards: slots.map((slot) => toCard(drawn, slot, stored.get(cardKey(band.label, slot.taskId)))),
    }
  })
}

export function bandCards(bands: readonly MapBand[]): MapCard[] {
  return bands.flatMap((band) => band.cards)
}

/**
 * A card is not clamped to its Band: membership is read from the Task's labels,
 * so where a card rests can never change the Task it stands for.
 */
export function dragCardTo(
  bands: readonly MapBand[],
  key: string,
  point: CanvasPoint,
): CardPosition | null {
  const band = bands.find((candidate) => candidate.cards.some((card) => card.key === key))
  const card = band?.cards.find((candidate) => candidate.key === key)
  if (!band || !card) return null

  const origin = bandOrigin(band)
  return {
    band: band.label,
    taskId: card.taskId,
    x: point.x - origin.x,
    y: point.y - origin.y,
  }
}

export function moveBand(bands: readonly Band[], label: string | null, point: CanvasPoint): Band[] {
  return bands.map((band) =>
    band.label === label
      ? { ...band, x: Math.max(point.x, 0), y: Math.max(point.y, 0) }
      : band,
  )
}

export function resizeBand(bands: readonly Band[], label: string | null, size: MapSize): Band[] {
  return bands.map((band) =>
    band.label === label
      ? {
          ...band,
          width: Math.max(size.width, MIN_BAND_WIDTH),
          height: Math.max(size.height, MIN_BAND_HEIGHT),
        }
      : band,
  )
}

export function withCuratedLabels(
  bands: readonly Band[],
  tasks: readonly TaskDetail[],
  labels: readonly string[],
): Band[] {
  const wanted = new Set(labels)
  const kept = withOtherBand(dedupeBands(bands)).filter(
    (band) => band.label === null || wanted.has(band.label),
  )
  const known = new Set(curatedLabels(kept))
  const open = activeTasks(tasks)

  const added: Band[] = []
  let top = bottomOf(kept) + CARD_GAP
  for (const label of labels) {
    if (known.has(label)) continue
    known.add(label)
    const band = sizedBand(label, top, taggedWith(open, label))
    added.push(band)
    top += band.height + CARD_GAP
  }
  return [...kept, ...added]
}

export function mapExtent(bands: readonly MapBand[]): MapSize {
  const corners = [
    { x: CANVAS_PADDING, y: CANVAS_PADDING },
    ...bands.map((band) => ({ x: band.x + band.width, y: band.y + band.height })),
    ...bandCards(bands).map((card) => ({ x: card.x + CARD_WIDTH, y: card.y + CARD_HEIGHT })),
  ]
  return {
    width: Math.max(...corners.map((corner) => corner.x)) + CANVAS_PADDING,
    height: Math.max(...corners.map((corner) => corner.y)) + CANVAS_PADDING,
  }
}
