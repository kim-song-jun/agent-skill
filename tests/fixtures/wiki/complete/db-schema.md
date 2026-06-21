---
title: Database Schema
slug: db-schema
grade: B
tags: [database, schema]
updated: 2026-06-21
---

# Database Schema

**BLUF:** PostgreSQL with 3 core tables: users, sessions, and audit_log.

## Details

The database uses PostgreSQL 15 with three core tables.

## Provenance

Grade: B
Sources:
- `docs/schema.md` — secondary documentation

## Contradictions

_None known._

## Related

- [Authentication Flow](auth-flow.md) — auth uses the users table
