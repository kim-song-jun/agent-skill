---
title: {{title}}
slug: {{slug}}
grade: {{grade}}
tags: [{{tags}}]
updated: {{updated}}
---

# {{title}}

**BLUF:** {{bluf}}

## Details

{{details}}

## Provenance

Grade: {{grade}}
- A = primary source (official docs, spec, source code)
- B = secondary source (blog post, talk, third-party guide)
- C = inferred / synthesised from context

Sources:
{{#each sources}}
- {{this}}
{{/each}}

## Contradictions

<!-- Record conflicts here rather than silently resolving them. -->
{{contradictions}}

## Related

{{#each related}}
- [{{this.title}}]({{this.file}}) — {{this.note}}
{{/each}}
