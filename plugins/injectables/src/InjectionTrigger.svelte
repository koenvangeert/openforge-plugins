<script lang="ts">
  import { onMount } from 'svelte'
  import type { PluginInjectionPointProps } from '@openforge-app/plugin-sdk/frontend'
  import InjectablePicker from './InjectablePicker.svelte'

  // Only api/projectId/onInsert are used here; context/location/taskId are part of the
  // injection-point contract but this trigger doesn't need them.
  let { api, projectId, onInsert }: PluginInjectionPointProps = $props()

  let open = $state(false)
  let triggerEl = $state<HTMLElement | null>(null)

  // Where focus sat when the picker opened, so it can be handed back on close. The
  // picker's Modal focuses its own input on open but restores nothing on close, and a
  // running session's host `onInsert` writes to the terminal without refocusing it —
  // so without this the terminal keeps the inserted text while the keyboard goes to
  // <body>. In the create/edit dialogs the host's prompt field refocuses itself, so
  // this simply hands focus back to that same field.
  let previouslyFocused: HTMLElement | null = null

  function openPicker() {
    // Capture before opening, so it is the field the user came from rather than the
    // Modal's input.
    previouslyFocused = document.activeElement as HTMLElement | null
    open = true
  }

  // Runs after the picker has left the DOM on any close (insert, Escape, click-away,
  // close button), by which point focus has fallen to <body>; restore it once.
  $effect(() => {
    if (open) return
    const target = previouslyFocused
    previouslyFocused = null
    target?.focus()
  })

  // Both the app's Modal and the SDK's mark their overlay with role="dialog".
  const DIALOG = '[role="dialog"]'

  /**
   * Whether this trigger is the one that should answer the shortcut. Several triggers
   * can be mounted at once — a task's session sits behind the create-task dialog — so
   * exactly one has to claim the key, or a single press opens two pickers.
   */
  function shouldRespond(): boolean {
    const owningDialog = triggerEl?.closest(DIALOG) ?? null
    // Inside a dialog: answer only while focus is in that same dialog.
    if (owningDialog) return owningDialog.contains(document.activeElement)
    // Outside every dialog (the session): stand down while any dialog is open.
    return document.querySelector(DIALOG) === null
  }

  function handleKeydown(event: KeyboardEvent) {
    // Deliberately no isInputFocused() bail: the point is to summon this while you are
    // typing a prompt. Alt is excluded so Option+Cmd+I still opens devtools.
    if (!event.metaKey || event.altKey || event.key.toLowerCase() !== 'i') return
    if (open || !shouldRespond()) return
    // Cmd+I is italics in a text field, which is exactly where this fires.
    event.preventDefault()
    openPicker()
  }

  // onMount's teardown rather than $effect cleanup: the listener belongs to this
  // component's lifetime, not to any prop value, so it is released only on unmount.
  onMount(() => {
    document.addEventListener('keydown', handleKeydown)
    return () => document.removeEventListener('keydown', handleKeydown)
  })
</script>

<!--
  onmousedown preventDefault so clicking the trigger does not pull focus off the field
  the user came from (a running session's terminal). Without it, that field is the
  button by the time openPicker() records where to hand focus back, and insert leaves
  focus stranded on the button. The click still opens the picker.
-->
<button
  bind:this={triggerEl}
  data-testid="injection-trigger"
  class="btn btn-ghost btn-xs gap-1"
  title="Insert injectable (⌘I)"
  onmousedown={(e) => e.preventDefault()}
  onclick={openPicker}
  type="button">
  <span aria-hidden="true">✨</span>
  <span>Insert injectable</span>
</button>

<InjectablePicker
  {api}
  projectId={projectId}
  open={open}
  onClose={() => (open = false)}
  onSelect={(inj) => {
    onInsert(inj.invocationText)
    open = false
  }}
/>
