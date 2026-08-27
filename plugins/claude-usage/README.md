# Claude Usage

Prices the Claude Code transcripts on this machine and charts what they cost.

Adds one **sidebar** view, `Claude usage`, reachable without picking a Project
first. The plugin is **app-enabled**: it is switched on once from Global
Settings, because a figure spanning every Project cannot belong to one of them.

## What it shows

- Spend today, over 7 days, over 30 days, and across everything indexed
- A 30-day daily bar chart split by cost component (input, output, cache write, cache read)
- Spend per Project, and the top Tasks inside them
- Spend per model, with token volumes
- Anything that ran outside OpenForge, reported rather than hidden
- A banner naming any model the price table has no rate for

The sidebar row itself carries the 30-day figure, so the number is visible
without opening the view.

## How the numbers are produced

Claude Code writes one JSONL transcript per session under
`~/.claude/projects/<encoded-cwd>/`, plus nested `<session>/subagents/*.jsonl`
for subagent runs. A background service walks both, and re-reads only the files
whose size or mtime changed.

Three details decide whether the total is right:

- **One API response is billed once, but written many times.** Claude Code
  appends one record per content block, each repeating the response's usage.
  Counting records roughly doubles the total, so records are collapsed by
  `message.id`.
- **The last record for a `message.id` wins.** A streamed response's earlier
  records carry a partial `output_tokens`. Keeping the first record instead
  undercounts output by about a quarter.
- **Subagent transcripts are billed too.** Their responses are disjoint from the
  parent's, and skipping them loses a double-digit percentage of the total.

Prices come from a table in `src/pricing.ts`, in USD per million tokens, with
separate rates for input, output, five-minute cache writes, one-hour cache
writes, and cache reads. The rates were recovered from Claude Code's own
`cost-state` totals and reproduce them exactly. `claude-opus-5[1m]` bills at the
base model's rates, so the long-context suffix is normalised away.

A model with no table entry is **excluded** from every spend figure and named on
the dashboard. There is no fallback rate: a guessed price would make a wrong
number indistinguishable from a right one. Update `PRICE_TABLE` when Anthropic
changes prices or ships a model.

## The index only grows

Claude Code prunes its own transcripts after roughly a month. For any pruned
period the plugin's index is the only surviving record, so it is not a cache:

- Rows are stored per transcript. Re-reading a file replaces that file's rows and
  touches nothing else.
- An entry whose transcript has been deleted is kept forever.
- **Rescan transcripts** merges. It never rebuilds from scratch, which would
  erase every pruned period.
- Rows hold token counts, never dollars. Spend is computed from the price table
  on every read, so correcting a rate re-prices all recorded history at once.

Rows are bucketed by UTC hour and presented in local days, so the stored data
does not depend on the timezone that aggregated it.

Buckets are keyed by the working directory Claude Code recorded, not by Task, so
attribution is resolved at read time. A Task created today therefore picks up the
spend its worktree already accumulated.

## Every figure is a floor

The price table is exact. Each `cost-state` record carries Claude Code's own
per-model token counts *and* its own dollar figure, so the table can be checked
without trusting anything this plugin computes: across 69 such samples it
reproduces Claude Code's cost to the sixth decimal place, error 0.000000%.

What is incomplete is the source data. Comparing token counts on sessions with a
single `cost-state` snapshot (no resume, so the windows line up exactly), the
transcript is consistently short of what Claude Code itself accounted for:

| class       | typical shortfall | worst seen |
| ----------- | ----------------- | ---------- |
| cache read  | 2 to 9%           | 33%        |
| cache write | 0.3 to 1%         | 26%        |
| output      | 0.4 to 1.3%       | 45%        |
| input       | 86 to 99%         | 99%        |

Some responses are billed with no usage record written anywhere in the transcript.
Input is worst hit and financially irrelevant (0.1% of spend); cache read carries
half the cost and is short by a few percent. The direction never reverses, so
**every figure shown is a lower bound on real spend, never an over-count.**

`cost-state` is a weak oracle and is never displayed. `totalCostUSD` and
`startTime` reset on different schedules across a resume, so bounding a
comparison by either one alone skews it (by line index: +61%; by `startTime`:
-14%). Only its `modelUsage` block, which pairs tokens with cost in one record,
is a sound check.

## Daily spend chart

Chart.js draws the 30-day stacked bar chart on a canvas. That is deliberate: the
host compiles Tailwind for its own markup, so a plugin that paints with utility
classes depends on the host happening to use the same ones. `bg-accent` was
absent, which blanked the cache-write segment and left a gap mid-bar. Series
colours now come from the theme's CSS variables, read at mount, and
`dailyChartConfig.ts` holds the data mapping so it is testable without a canvas.

## Refresh interval

The backend rescans transcripts every 5 minutes by default, re-reading only files
whose size or modification time changed. Set a different interval (1 to 240
minutes) under the plugin's card on the global settings page. The timer reads the
setting on every tick, so a change applies once the current interval elapses
without restarting the service. An open dashboard re-reads the index every minute.

## Development

```bash
npm test && npm run typecheck
npm run build
```

Point `CLAUDE_CONFIG_DIR` at another directory to read a relocated Claude Code
install.
