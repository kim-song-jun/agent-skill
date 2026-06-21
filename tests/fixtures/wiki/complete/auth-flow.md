---
title: Authentication Flow
slug: auth-flow
grade: A
tags: [auth, security]
updated: 2026-06-21
---

# Authentication Flow

**BLUF:** The app uses JWT with 15-minute access tokens and 7-day refresh tokens stored in httpOnly cookies.

## Details

The authentication flow uses a standard OAuth2 pattern with JWTs.

## Provenance

Grade: A
Sources:
- `src/auth/jwt.ts` — primary implementation

## Contradictions

_None known._

## Related

- [Database Schema](db-schema.md) — users table stores hashed passwords
