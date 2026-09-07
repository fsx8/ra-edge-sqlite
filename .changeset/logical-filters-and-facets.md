---
"core-rest-worker": minor
"d1-rest-worker": minor
"turso-rest-worker": minor
"ra-cloudflare-d1": minor
"ra-turso": minor
"rest-worker-types": minor
---

Add logical filter groups and facets.

**Logical filter groups** — the filter JSON now accepts `$or` / `$and` keys whose values are non-empty arrays of filter nodes, recursively (depth-capped at 10, member-capped at 100 per group). Plain keys inside the same object are AND-composed with the groups (PostgREST-style):

```
GET /api/posts?filter={"status":"open","$or":[{"assignee":"me"},{"priority_gte":3}]}
```

Fields inside groups are validated against the resource's `filterableFields` allow-list; empty groups, non-object members, condition-less members, and `q`/`_includeDeleted` inside groups are rejected with `VALIDATION_ERROR`.

**Facets** — resources can declare a `facets` map (`FacetConfig` in `rest-worker-types`), exposed via two new routes:

- `GET /api/:resource/__facets` → `{ facets: { name: [{ value, count }, ...] } }`
- `GET /api/:resource/__facets/:facet` → `{ facet, values }`

Two facet shapes: `column` (distinct values + counts of a plain column) and `jsonEach` (expand one or more JSON-array columns via JSON1 `json_each`, optionally subtracting per-row elements of an `excludeJsonEach` column — e.g. "scraped + additions − removals" tag curation). Counts respect soft delete. Facet columns are validated against `selectableFields`.

The react-admin provider gains `dataProvider.getFacets(resource, facet?)` returning the parsed response.
