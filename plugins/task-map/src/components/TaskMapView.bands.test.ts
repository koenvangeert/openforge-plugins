// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/svelte'
import { describe, expect, it } from 'vitest'
import { buildLabelAssignment, buildSeededTask, FIXTURE_PROJECT_ID } from '../__fixtures__/tasks'
import { CANVAS_PADDING } from '../lib/cards'
import { bandWidthFor, BAND_HEADING_HEIGHT, BAND_PADDING, OTHER_BAND_TITLE } from '../lib/bands'
import {
  band,
  bandOfCard,
  bandTitles,
  bandsOfCard,
  cardIds,
  cardIdsIn,
  cardIn,
  drag,
  flushWrites,
  headingOf,
  openMap,
  pointOf,
  rectOf,
  renderView,
} from './TaskMapView.testUtils'

describe('TaskMapView Bands', () => {
  it('seeds one Band per label the active Tasks carry, plus No label / Other', async () => {
    renderView(
      [
        buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' }),
        buildSeededTask({ id: 'T-2', title: 'Split the reader' }),
        buildSeededTask({ id: 'T-3', title: 'Archive the runs', status: 'done' }),
      ],
      FIXTURE_PROJECT_ID,
      [
        buildLabelAssignment('T-1', 'auth'),
        buildLabelAssignment('T-2', 'api'),
        buildLabelAssignment('T-3', 'archived'),
      ],
    )
    await screen.findByRole('button', { name: /Rotate the tokens/ })

    expect(bandTitles()).toEqual(['api', 'auth', OTHER_BAND_TITLE])
  })

  it('draws a Task once in every Band whose label it carries', async () => {
    renderView(
      [buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' })],
      FIXTURE_PROJECT_ID,
      [buildLabelAssignment('T-1', 'auth', 'api')],
    )
    await screen.findAllByRole('button', { name: /Rotate the tokens/ })

    expect(bandTitles()).toEqual(['api', 'auth', OTHER_BAND_TITLE])
    expect(cardIds()).toEqual(['T-1', 'T-1'])
    expect(bandsOfCard('T-1')).toEqual(['api', 'auth'])
    expect(cardIdsIn(OTHER_BAND_TITLE)).toEqual([])
  })

  it('draws a Task carrying no curated label in No label / Other', async () => {
    renderView(
      [
        buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' }),
        buildSeededTask({ id: 'T-2', title: 'Split the reader' }),
      ],
      FIXTURE_PROJECT_ID,
      [buildLabelAssignment('T-1', 'auth')],
    )
    await screen.findByRole('button', { name: /Rotate the tokens/ })

    expect(bandOfCard('T-1')).toBe('auth')
    expect(bandOfCard('T-2')).toBe(OTHER_BAND_TITLE)
  })

  it('draws each Band at the rectangle stored for it', async () => {
    const map = await openMap([buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' })], {
      labels: [buildLabelAssignment('T-1', 'auth')],
    })

    await map.store('bands', [
      { label: 'auth', x: 500, y: 300, width: bandWidthFor(2), height: 400 },
      band(null, 40, 900),
    ])
    await map.reopen()

    expect(rectOf('auth')).toEqual({
      label: 'auth',
      x: 500,
      y: 300,
      width: bandWidthFor(2),
      height: 400,
    })
    expect(pointOf(cardIn('auth', 'T-1'))).toEqual({
      x: 500 + BAND_PADDING,
      y: 300 + BAND_HEADING_HEIGHT,
    })
    expect(rectOf(OTHER_BAND_TITLE)).toMatchObject({ x: 40, y: 900 })
  })

  it('draws a curated Band no active Task belongs to, and leaves it empty', async () => {
    const map = await openMap([buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' })])

    await map.store('bands', [band('ops', CANVAS_PADDING, CANVAS_PADDING), band(null, CANVAS_PADDING, 400)])
    await map.reopen()

    expect(bandTitles()).toEqual(['ops', OTHER_BAND_TITLE])
    expect(cardIdsIn('ops')).toEqual([])
    expect(bandOfCard('T-1')).toBe(OTHER_BAND_TITLE)
  })
})

describe('TaskMapView Band curation', () => {
  async function openEditor(): Promise<void> {
    await fireEvent.click(screen.getByRole('button', { name: 'Edit bands' }))
    await screen.findByTestId('band-settings')
  }

  async function labelledMap() {
    const map = await openMap(
      [
        buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' }),
        buildSeededTask({ id: 'T-2', title: 'Split the reader' }),
      ],
      { labels: [buildLabelAssignment('T-1', 'auth'), buildLabelAssignment('T-2', 'api')] },
    )
    return map
  }

  it('offers the label names the active Tasks carry', async () => {
    const map = await labelledMap()
    await map.store('bands', [band(null, CANVAS_PADDING, CANVAS_PADDING)])
    await map.reopen()

    await openEditor()

    expect(screen.getByRole('button', { name: 'api' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'auth' })).toBeTruthy()
  })

  it('persists a Band the user added and draws its Tasks in it', async () => {
    const map = await labelledMap()
    await map.store('bands', [band(null, CANVAS_PADDING, CANVAS_PADDING)])
    await map.reopen()
    await openEditor()

    await fireEvent.click(screen.getByRole('button', { name: 'auth' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(bandTitles()).toEqual([OTHER_BAND_TITLE, 'auth']))
    expect(bandOfCard('T-1')).toBe('auth')
    expect(bandOfCard('T-2')).toBe(OTHER_BAND_TITLE)

    await flushWrites()
    await map.reopen()

    expect(bandTitles()).toEqual([OTHER_BAND_TITLE, 'auth'])
    expect(bandOfCard('T-1')).toBe('auth')
  })

  it('moves a Task into No label / Other when the only Band it carried is removed', async () => {
    const map = await labelledMap()
    expect(bandOfCard('T-1')).toBe('auth')
    await openEditor()

    await fireEvent.click(screen.getByRole('button', { name: 'Remove the auth band' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(bandTitles()).toEqual(['api', OTHER_BAND_TITLE]))
    expect(bandOfCard('T-1')).toBe(OTHER_BAND_TITLE)
    expect(bandOfCard('T-2')).toBe('api')

    await flushWrites()
    await map.reopen()

    expect(bandTitles()).toEqual(['api', OTHER_BAND_TITLE])
    expect(bandOfCard('T-1')).toBe(OTHER_BAND_TITLE)
  })

  it('keeps a removed Band off the map as the Tasks change', async () => {
    const map = await labelledMap()
    await openEditor()
    await fireEvent.click(screen.getByRole('button', { name: 'Remove the auth band' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(bandTitles()).toEqual(['api', OTHER_BAND_TITLE]))

    map.change()
    await flushWrites()

    expect(bandTitles()).toEqual(['api', OTHER_BAND_TITLE])
  })

  it('leaves a Band where the user placed it when another Band is added', async () => {
    const map = await labelledMap()
    await drag(headingOf('api'), 300, 200)
    const placed = rectOf('api')
    await openEditor()

    await fireEvent.click(screen.getByRole('button', { name: 'Remove the auth band' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(bandTitles()).toEqual(['api', OTHER_BAND_TITLE]))
    expect(rectOf('api')).toEqual(placed)
    await flushWrites()
  })

  it('places a re-added Band afresh rather than where the removed one sat', async () => {
    const map = await labelledMap()
    await drag(headingOf('auth'), 900, 100)
    expect(rectOf('auth').x).toBe(CANVAS_PADDING + 900)

    await openEditor()
    await fireEvent.click(screen.getByRole('button', { name: 'Remove the auth band' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(bandTitles()).toEqual(['api', OTHER_BAND_TITLE]))

    await openEditor()
    await fireEvent.click(screen.getByRole('button', { name: 'auth' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(bandTitles()).toContain('auth'))

    expect(rectOf('auth').x).toBe(CANVAS_PADDING)
    map.change()
    await flushWrites()
    expect(rectOf('auth').x).toBe(CANVAS_PADDING)
  })

  it('keeps the editor open with the reason when the Band set cannot be stored', async () => {
    const map = await labelledMap()
    map.refuse('bands')
    await openEditor()

    await fireEvent.click(screen.getByRole('button', { name: 'Remove the auth band' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect((await screen.findByRole('alert')).textContent).toContain('the host went away')
    expect(screen.getByTestId('band-settings')).toBeTruthy()
    expect(bandTitles()).toEqual(['api', 'auth', OTHER_BAND_TITLE])
  })

  it('leaves the Bands alone when the editor is cancelled', async () => {
    await labelledMap()
    await openEditor()

    await fireEvent.click(screen.getByRole('button', { name: 'Remove the auth band' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByTestId('band-settings')).toBeNull())
    expect(bandTitles()).toEqual(['api', 'auth', OTHER_BAND_TITLE])
  })
})
