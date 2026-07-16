# ADR 0004: Focus the Jira Plugin on Issue Intake

Status: Accepted
Date: 2026-07-16
Task: KVG-1482

The Jira Plugin is an Issue Intake bridge from Jira into OpenForge, not a Jira
dashboard inside OpenForge. It deliberately excludes AI executability scoring,
Ask AI, Jira Issue creation or refinement, inline editing, Kanban, statistics,
release dashboards, and exports. OpenForge and its Agent Sessions own execution
and refinement workflows, while Jira remains the place for Issue management;
keeping that boundary avoids duplicating Prism or Jira and concentrates the
plugin on discovery, concise context, linking, and native Implementation Runs.
