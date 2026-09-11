// jsdom implements no PointerEvent, so a MouseEvent carries the clientX/clientY the
// drag handlers read while still dispatching under the pointer event's own name.
export function pointerEvent(type: string, clientX: number, clientY: number): MouseEvent {
  return new MouseEvent(type, { clientX, clientY, bubbles: true, cancelable: true })
}
