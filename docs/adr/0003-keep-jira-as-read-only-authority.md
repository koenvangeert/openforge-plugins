# ADR 0003: Keep Jira as the read-only authority

Status: Accepted
Date: 2026-07-16
Task: KVG-1482

The Jira Plugin reads Jira Issue data to support discovery, preview, and Issue
Intake, but never creates, updates, transitions, or deletes Jira Issues. Users
return to Jira for those changes; the plugin writes only OpenForge-owned Tasks
and Issue Links. This avoids duplicating Jira's editing, permission, validation,
and conflict behavior while keeping the plugin focused on moving work into
OpenForge, at the deliberate cost of leaving Issue maintenance in Jira.
