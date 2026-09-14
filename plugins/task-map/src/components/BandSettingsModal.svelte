<script lang="ts">
  import { Plus, X } from '@lucide/svelte'
  import Button from '@openforge-app/plugin-sdk/ui/Button.svelte'
  import IconButton from '@openforge-app/plugin-sdk/ui/IconButton.svelte'
  import Modal from '@openforge-app/plugin-sdk/ui/Modal.svelte'
  import { OTHER_BAND_TITLE } from '../lib/bands'

  interface Props {
    availableLabels: string[]
    curatedLabels: string[]
    busy?: boolean
    error?: string | null
    onClose: () => void
    onSave: (labels: string[]) => void
  }

  let { availableLabels, curatedLabels, busy = false, error = null, onClose, onSave }: Props = $props()

  // The editor opens on the Bands as they are and owns them until Save, so a
  // later read of the same set must not reset what the user picked.
  // svelte-ignore state_referenced_locally
  let chosen = $state<string[]>([...curatedLabels])

  const offered = $derived(availableLabels.filter((label) => !chosen.includes(label)))
  const unused = $derived(new Set(chosen.filter((label) => !availableLabels.includes(label))))

  function add(label: string): void {
    chosen = [...chosen, label]
  }

  function remove(label: string): void {
    chosen = chosen.filter((kept) => kept !== label)
  }

  function save(): void {
    // The set crosses the Electron IPC boundary, which structured-clones the
    // payload. A raw $state proxy is not cloneable and would throw.
    onSave($state.snapshot(chosen))
  }
</script>

<Modal ariaLabel="Bands" closeLabel="Close" maxWidth="30rem" testId="band-settings" {onClose}>
  {#snippet header()}
    <h3 class="band-settings-title">Bands</h3>
  {/snippet}

  <div class="band-settings-body">
    <p class="band-settings-hint">
      A Task is drawn in every band whose label it carries. Drag a band on the map to place it.
    </p>

    <div class="band-settings-group">
      <span class="band-settings-legend">Bands on the map</span>
      {#each chosen as label (label)}
        <div class="band-settings-row">
          <span class="band-settings-name">{label}</span>
          {#if unused.has(label)}
            <span class="band-settings-note">no active Tasks</span>
          {/if}
          <IconButton
            label={`Remove the ${label} band`}
            size="sm"
            disabled={busy}
            onClick={() => remove(label)}
          >
            <X size={14} aria-hidden="true" />
          </IconButton>
        </div>
      {/each}
      <div class="band-settings-row" data-other="true">
        <span class="band-settings-name">{OTHER_BAND_TITLE}</span>
        <span class="band-settings-note">always on the map</span>
      </div>
    </div>

    {#if offered.length > 0}
      <div class="band-settings-group">
        <span class="band-settings-legend">Add a band</span>
        <div class="band-settings-offered">
          {#each offered as label (label)}
            <Button variant="outline" size="sm" disabled={busy} onClick={() => add(label)}>
              <Plus size={14} aria-hidden="true" />
              {label}
            </Button>
          {/each}
        </div>
      </div>
    {/if}
  </div>

  <div class="band-settings-actions">
    {#if error}
      <p class="band-settings-error" role="alert">{error}</p>
    {/if}
    <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>Cancel</Button>
    <Button variant="primary" size="sm" disabled={busy} onClick={save}>Save</Button>
  </div>
</Modal>

<style>
  .band-settings-title {
    margin: 0;
    font-size: var(--of-text-base);
    font-weight: var(--of-weight-semibold);
  }

  .band-settings-body {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--of-space4);
    overflow-y: auto;
    padding: var(--of-space4);
  }

  .band-settings-hint {
    margin: 0;
    font-size: var(--of-text-sm);
    line-height: var(--of-line-height-sm);
    color: var(--of-text-secondary);
  }

  .band-settings-group {
    display: flex;
    flex-direction: column;
    gap: var(--of-space2);
  }

  .band-settings-legend {
    font-size: var(--of-text-xs);
    font-weight: var(--of-weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--of-text-secondary);
  }

  .band-settings-row {
    display: flex;
    align-items: center;
    gap: var(--of-space2);
    padding: var(--of-space1) var(--of-space2);
    border: var(--of-border-width) solid var(--of-border);
    border-radius: var(--of-radius-control);
  }

  .band-settings-row[data-other='true'] {
    border-style: dashed;
  }

  .band-settings-name {
    flex: 1;
    overflow: hidden;
    font-size: var(--of-text-sm);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .band-settings-note {
    font-size: var(--of-text-xs);
    color: var(--of-text-muted);
  }

  .band-settings-offered {
    display: flex;
    flex-wrap: wrap;
    gap: var(--of-space2);
  }

  .band-settings-error {
    flex: 1;
    margin: 0;
    font-size: var(--of-text-sm);
    color: var(--of-danger);
  }

  .band-settings-actions {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: flex-end;
    gap: var(--of-space2);
    padding: var(--of-space3) var(--of-space4);
    border-top: var(--of-border-width) solid var(--of-border);
  }
</style>
