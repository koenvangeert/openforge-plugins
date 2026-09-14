// @vitest-environment jsdom
import { fireEvent, waitFor } from '@testing-library/svelte'
import { describe, expect, it } from 'vitest'
import { buildLabelAssignment, buildSeededTask } from '../__fixtures__/tasks'
import { CANVAS_PADDING, CARD_GAP, CARD_HEIGHT } from '../lib/cards'
import { bandWidthFor, BAND_HEADING_HEIGHT, BAND_PADDING, OTHER_BAND_TITLE } from '../lib/bands'
import {
  band,
  bandOfCard,
  cardIn,
  cardOf,
  cardPoint,
  cards,
  drag,
  flushWrites,
  handleOf,
  headingOf,
  openMap,
  pointOf,
  rectOf,
  taskWrites,
} from './TaskMapView.testUtils'

describe('TaskMapView card drag', () => {
  it('rests a card where it is dropped inside its own Band', async () => {
    const map = await openMap([buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' })])
    const before = cardPoint('T-1')

    await drag(cardOf('T-1'), 60, 40)

    expect(cardPoint('T-1')).toEqual({ x: before.x + 60, y: before.y + 40 })
    expect(map.api.__testing.calls.navigationRequests).toEqual([])
  })

  it('rests a card dropped outside its own Band there, and leaves the Task alone', async () => {
    const map = await openMap(
      [
        buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' }),
        buildSeededTask({ id: 'T-2', title: 'Split the reader' }),
      ],
      { labels: [buildLabelAssignment('T-1', 'api'), buildLabelAssignment('T-2', 'auth')] },
    )
    const before = cardPoint('T-2')

    await drag(cardOf('T-2'), 900, -200)

    expect(bandOfCard('T-2')).toBe('auth')
    expect(cardPoint('T-2')).toEqual({ x: before.x + 900, y: before.y - 200 })
    expect(taskWrites(map.api)).toEqual([])
  })

  it('stops a card dragged off the top of the canvas at its edge', async () => {
    await openMap([buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' })])

    await drag(cardOf('T-1'), 0, -1000)

    expect(cardPoint('T-1').y).toBe(0)
  })

  it('writes one position for one drag gesture', async () => {
    const map = await openMap([buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' })])

    await drag(cardOf('T-1'), 80, 60, 12)
    await flushWrites()

    expect(map.positionWrites).toEqual([[{ band: null, taskId: 'T-1', x: 80, y: 60 }]])
  })

  it('restores a dragged position when the View is reopened', async () => {
    const map = await openMap([buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' })])
    await drag(cardOf('T-1'), 60, 40)
    const dropped = cardPoint('T-1')

    await map.reopen()

    expect(cardPoint('T-1')).toEqual(dropped)
  })

  it('restores a dragged position after the app restarts', async () => {
    const map = await openMap([buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' })])
    await drag(cardOf('T-1'), 60, 40)
    const dropped = cardPoint('T-1')

    await map.restart()

    expect(cardPoint('T-1')).toEqual(dropped)
  })

  it('restores every position of three cards dragged one after another', async () => {
    const map = await openMap([
      buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' }),
      buildSeededTask({ id: 'T-2', title: 'Split the reader' }),
      buildSeededTask({ id: 'T-3', title: 'Archive the runs' }),
    ])

    await drag(cardOf('T-1'), 40, 30)
    await drag(cardOf('T-2'), 50, 60)
    await drag(cardOf('T-3'), 60, 90)
    const dropped = ['T-1', 'T-2', 'T-3'].map(cardPoint)

    await map.reopen()

    expect(['T-1', 'T-2', 'T-3'].map(cardPoint)).toEqual(dropped)
  })

  it('moves the copy the user dragged and leaves the other copy alone', async () => {
    const map = await openMap([buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' })], {
      labels: [buildLabelAssignment('T-1', 'auth', 'api')],
    })
    const untouched = pointOf(cardIn('api', 'T-1'))

    await drag(cardIn('auth', 'T-1'), 60, 40)
    await flushWrites()

    expect(pointOf(cardIn('api', 'T-1'))).toEqual(untouched)
    expect(map.positionWrites).toEqual([[{ band: 'auth', taskId: 'T-1', x: 60, y: 40 }]])
  })

  it('draws a card at its stored position rather than where layering would put it', async () => {
    const map = await openMap([
      buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' }),
      buildSeededTask({ id: 'T-2', title: 'Split the reader', dependsOn: ['T-1'] }),
    ])
    const layered = cardPoint('T-2')

    await map.store('cardPositions', [{ band: null, taskId: 'T-2', x: 0, y: 0 }])
    await map.reopen()

    expect(cardPoint('T-2').y).toBeLessThan(layered.y)
    expect(cardPoint('T-2')).toEqual({
      x: rectOf(OTHER_BAND_TITLE).x + BAND_PADDING,
      y: rectOf(OTHER_BAND_TITLE).y + BAND_HEADING_HEIGHT,
    })
  })

  it('lays a Task out again once its labels move it to another Band', async () => {
    const task = buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' })
    const assignment = buildLabelAssignment('T-1', 'auth')
    const map = await openMap([task, buildSeededTask({ id: 'T-2', title: 'Split the reader' })], {
      labels: [assignment, buildLabelAssignment('T-2', 'api')],
    })
    await drag(cardOf('T-1'), 120, 0)
    expect(cardPoint('T-1').x).toBe(CANVAS_PADDING + BAND_PADDING + 120)

    assignment.labels.splice(0, 1, ...buildLabelAssignment('T-1', 'api').labels)
    map.change()

    await waitFor(() => expect(bandOfCard('T-1')).toBe('api'))
    expect(cardPoint('T-1').x).toBe(rectOf('api').x + BAND_PADDING)
  })

  it('restores the position a Task held in a Band it left and came back to', async () => {
    const assignment = buildLabelAssignment('T-1', 'auth')
    const map = await openMap(
      [
        buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' }),
        buildSeededTask({ id: 'T-2', title: 'Split the reader' }),
      ],
      { labels: [assignment, buildLabelAssignment('T-2', 'api')] },
    )
    await drag(cardOf('T-1'), 120, 0)
    const dropped = cardPoint('T-1')

    const relabel = (...names: string[]) => {
      assignment.labels.splice(0, assignment.labels.length, ...buildLabelAssignment('T-1', ...names).labels)
      map.change()
    }
    relabel('api')
    await waitFor(() => expect(bandOfCard('T-1')).toBe('api'))
    relabel('auth')
    await waitFor(() => expect(bandOfCard('T-1')).toBe('auth'))

    expect(cardPoint('T-1')).toEqual(dropped)
  })

  it('leaves every card alone for a position stored for a card off the map', async () => {
    const map = await openMap([buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' })])
    const layered = cardPoint('T-1')

    await map.store('cardPositions', [{ band: null, taskId: 'T-gone', x: 300, y: 300 }])
    await map.reopen()

    expect(cardPoint('T-1')).toEqual(layered)
  })

  it('reads a position written for one Project for that Project alone', async () => {
    const map = await openMap([
      buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' }),
      buildSeededTask({ id: 'T-9', title: 'Rotate the tokens', projectId: 'P-2' }),
    ])
    await drag(cardOf('T-1'), 60, 40)
    const dropped = cardPoint('T-1')

    await map.openProject('P-2')

    expect(cardPoint('T-9')).toEqual({ x: dropped.x - 60, y: dropped.y - 40 })
  })

  it('opens a Task clicked without dragging it', async () => {
    const map = await openMap([buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' })])

    await fireEvent.click(cardOf('T-1'), { detail: 1 })

    expect(map.api.__testing.calls.navigationRequests).toEqual([{ viewId: 'board', taskId: 'T-1' }])
  })

  it('opens no Task on the click that ends a drag', async () => {
    const map = await openMap([buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' })])

    await drag(cardOf('T-1'), 60, 40)
    await fireEvent.click(cardOf('T-1'), { detail: 1 })

    expect(map.api.__testing.calls.navigationRequests).toEqual([])
  })

  it('opens a Task activated from the keyboard after a card was dragged', async () => {
    const map = await openMap([
      buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' }),
      buildSeededTask({ id: 'T-2', title: 'Split the reader' }),
    ])

    await drag(cardOf('T-1'), 60, 40)
    await fireEvent.click(cardOf('T-2'))

    expect(map.api.__testing.calls.navigationRequests).toEqual([{ viewId: 'board', taskId: 'T-2' }])
  })

  it('keeps a dropped position that a re-read already in flight could not see', async () => {
    const map = await openMap([buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' })])

    map.change()
    await drag(cardOf('T-1'), 60, 40)
    const dropped = cardPoint('T-1')
    await flushWrites()

    expect(cardPoint('T-1')).toEqual(dropped)
    await map.reopen()
    expect(cardPoint('T-1')).toEqual(dropped)
  })
})

describe('TaskMapView Band drag', () => {
  it('moves a Band by its heading and carries its cards with it', async () => {
    await openMap([buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' })])
    const before = rectOf(OTHER_BAND_TITLE)
    const card = cardPoint('T-1')

    await drag(headingOf(OTHER_BAND_TITLE), 120, 80)

    expect(rectOf(OTHER_BAND_TITLE)).toMatchObject({ x: before.x + 120, y: before.y + 80 })
    expect(cardPoint('T-1')).toEqual({ x: card.x + 120, y: card.y + 80 })
  })

  it('writes the moved rectangle once for one drag gesture', async () => {
    const map = await openMap([buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' })])
    const before = rectOf(OTHER_BAND_TITLE)
    map.bandWrites.length = 0

    await drag(headingOf(OTHER_BAND_TITLE), 120, 80, 12)
    await flushWrites()

    expect(map.bandWrites).toEqual([
      [expect.objectContaining({ label: null, x: before.x + 120, y: before.y + 80 })],
    ])
  })

  it('keeps a Band where it was dropped when the View is reopened', async () => {
    const map = await openMap([buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' })])
    await drag(headingOf(OTHER_BAND_TITLE), 120, 80)
    const dropped = rectOf(OTHER_BAND_TITLE)
    await flushWrites()

    await map.reopen()

    expect(rectOf(OTHER_BAND_TITLE)).toEqual(dropped)
  })

  it('reflows the rows when the user narrows a Band by its corner', async () => {
    await openMap([
      buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' }),
      buildSeededTask({ id: 'T-2', title: 'Split the reader' }),
    ])
    expect(cardPoint('T-1').y).toBe(cardPoint('T-2').y)

    await drag(handleOf(OTHER_BAND_TITLE), bandWidthFor(1) - bandWidthFor(4), 0)

    expect(rectOf(OTHER_BAND_TITLE).width).toBe(bandWidthFor(1))
    expect(cardPoint('T-2').x).toBe(cardPoint('T-1').x)
    expect(cardPoint('T-2').y).toBe(cardPoint('T-1').y + CARD_HEIGHT + CARD_GAP)
  })

  it('keeps a resized Band when the View is reopened', async () => {
    const map = await openMap([buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' })])

    await drag(handleOf(OTHER_BAND_TITLE), 200, 120)
    const resized = rectOf(OTHER_BAND_TITLE)
    await flushWrites()
    await map.reopen()

    expect(rectOf(OTHER_BAND_TITLE)).toEqual(resized)
  })

  it('opens no Task when a Band is dragged', async () => {
    const map = await openMap([buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' })])

    await drag(headingOf(OTHER_BAND_TITLE), 120, 80)

    expect(map.api.__testing.calls.navigationRequests).toEqual([])
    expect(taskWrites(map.api)).toEqual([])
  })
})
