// How long a Refine may take before the host gives up on it.
//
// OpenForge aborts any plugin backend call at `plugin_rpc.rs DEFAULT_TIMEOUT` (30s).
// That deadline is the real one: a transport that allows itself longer does not get
// more time, it just loses control of the failure — the host's generic "timed out
// waiting for plugin backend response" replaces the message the transport worked out,
// and any retry scheduled past the deadline can never deliver its result.
//
// So every attempt a transport makes has to fit inside this budget, retries included.

/** Mirrors `src-tauri/src/plugin_rpc.rs` DEFAULT_TIMEOUT. */
export const HOST_DEADLINE_MS = 30_000

// Refine also reads the repo README and pays an RPC round trip either side of the
// model call, none of which is free. Leave that outside the model's own budget.
const OVERHEAD_MS = 5_000

/** The wall clock a transport may spend on model calls, retries included. */
export const AI_BUDGET_MS = HOST_DEADLINE_MS - OVERHEAD_MS
