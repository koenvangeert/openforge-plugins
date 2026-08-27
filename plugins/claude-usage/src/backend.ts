import { defineBackendPlugin } from '@openforge-app/plugin-sdk/backend'
import { readRescanMinutes } from './rescanInterval'
import { resolveTranscriptRoot } from './scanner'
import { createSpendService } from './spendService'

const MINUTE_MS = 60 * 1000

export default defineBackendPlugin({
  activate(openforge, context) {
    const service = createSpendService({
      userData: openforge.fs.userData,
      external: openforge.fs.external,
      projects: openforge.projects,
      tasks: openforge.tasks,
      root: resolveTranscriptRoot(),
      now: () => Date.now(),
      onError: (message, error) => console.warn(`[claude-usage] ${message}`, error),
    })

    let scanAbort: AbortController | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    let inFlight: Promise<unknown> = Promise.resolve()

    const scan = () => {
      inFlight = service.refresh(scanAbort?.signal).catch((error) => {
        if (!scanAbort?.signal.aborted) console.warn('[claude-usage] transcript scan failed', error)
      })
      return inFlight
    }

    /**
     * Rearmed from the setting on every tick rather than held in a setInterval,
     * so changing the interval takes effect without restarting the service.
     */
    const armNextScan = async () => {
      const minutes = await readRescanMinutes(openforge.storage.global)
      if (scanAbort?.signal.aborted) return
      timer = setTimeout(() => {
        void scan().finally(() => {
          if (!scanAbort?.signal.aborted) void armNextScan()
        })
      }, minutes * MINUTE_MS)
    }

    context.subscriptions.add(
      openforge.background.register({
        id: 'spend-index',
        scope: 'global',
        start() {
          scanAbort = new AbortController()
          void scan().finally(() => {
            if (!scanAbort?.signal.aborted) void armNextScan()
          })
        },
        async stop() {
          if (timer) clearTimeout(timer)
          timer = null
          scanAbort?.abort()
          scanAbort = null
          await inFlight
        },
      }),
    )

    context.subscriptions.add(
      openforge.backend.registerMethod('getDashboard', {
        input: { type: 'null' },
        output: { type: 'object' },
        handler: () => service.getDashboard(),
      }),
    )

    context.subscriptions.add(
      openforge.backend.registerMethod<{ taskId: string }>('getTaskSpend', {
        input: {
          type: 'object',
          properties: { taskId: { type: 'string' } },
          required: ['taskId'],
        },
        output: { type: 'object' },
        handler: ({ taskId }) => service.getTaskSpend(taskId),
      }),
    )

    context.subscriptions.add(
      openforge.backend.registerMethod('refresh', {
        input: { type: 'null' },
        output: { type: 'object' },
        handler: async () => {
          const result = await service.refresh(scanAbort?.signal)
          return { ...result, dashboard: await service.getDashboard() }
        },
      }),
    )
  },
})
