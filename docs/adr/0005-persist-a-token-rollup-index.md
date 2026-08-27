# ADR 0005: Persist a token rollup index rather than rescanning transcripts

Status: Accepted
Date: 2026-08-27

The Claude Code Usage plugin derives **Spend** from Claude Code's transcripts in
`~/.claude/projects`. A full scan of all 434 MB of them takes 1.10 s from Node,
so maintaining a background service and a persisted **Spend Index** is visibly
more machinery than reading the transcripts on demand would need today. We
persist the index anyway, for two reasons that are not apparent from the scan
time.

The first is growth: the scan is linear in recorded history, and a figure that is
cheap at 434 MB becomes a multi-second spinner on every visit at a few
gigabytes. The second, and the decisive one, is that **Claude Code prunes its own
transcripts** after roughly a month. At the time of writing the oldest surviving
transcript was 35 days old, with a visible gap in the record, and a cleanup ran
during our own measurements. The transcripts are therefore not a durable source:
for any period old enough to have been pruned, the Spend Index is the only
surviving evidence that the money was spent. A plugin that recomputed from the
transcripts on demand would report a total that silently shrank over time.

Two consequences follow. The index only ever grows by merging newly-read files
into what it already holds, and a rebuild merges rather than replaces, because a
destructive rebuild would erase exactly the pruned history the index exists to
preserve. And index rows store token counts, never dollars, so that correcting
the **Price Table** re-prices all retained history on the next render without a
migration or a rebuild, so the index cannot become the thing that shows wrong
money.
