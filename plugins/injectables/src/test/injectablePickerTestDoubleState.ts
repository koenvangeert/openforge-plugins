// Captures what InjectablePickerTestDouble.svelte last received so tests can
// assert the parent forwards `api`/`projectId` through to the (mocked) picker.
export const receivedPickerProps: { api: unknown; projectId: string | null } = {
  api: undefined,
  projectId: null,
}
