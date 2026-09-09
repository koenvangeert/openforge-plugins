class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver

if (typeof MouseEvent !== 'undefined' && typeof globalThis.PointerEvent === 'undefined') {
  globalThis.PointerEvent = class extends MouseEvent {
    readonly pointerId: number

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 1
    }
  } as unknown as typeof PointerEvent

  Element.prototype.setPointerCapture ??= () => undefined
  Element.prototype.releasePointerCapture ??= () => undefined
}
