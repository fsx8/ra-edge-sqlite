# ra-cloudflare-d1

## 1.1.0

### Minor Changes

- [`64b6a16`](https://github.com/fsx8/ra-edge-sqlite/commit/64b6a16b40dde05c4417a752c4222e526266d768) Thanks [@fsx8](https://github.com/fsx8)! - Add logical filter groups and facets.

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

### Patch Changes

- Updated dependencies [[`64b6a16`](https://github.com/fsx8/ra-edge-sqlite/commit/64b6a16b40dde05c4417a752c4222e526266d768)]:
  - rest-worker-types@1.2.0

## 1.0.1

### Patch Changes

- Updated dependencies [[`ba16d0c`](https://github.com/fsx8/ra-edge-sqlite/commit/ba16d0c3a23169b2a22fdc30cdfabbf2d8272d5e)]:
  - rest-worker-types@1.1.0

## 1.0.0

### Major Changes

- [`502b369`](https://github.com/fsx8/ra-edge-sqlite/commit/502b36920c35b258508bcde3da505ccbaedeb6e3) Thanks [@fsx8](https://github.com/fsx8)! - 1.0.0 — the project is now **ra-edge-sqlite**: React-Admin data providers and
  Simple-REST Workers for SQLite-flavored edge databases (Cloudflare D1 and
  Turso/libSQL). All packages align at 1.0.0 and now publish from a single,
  database-agnostic core.

  ## The big picture

  The DB-agnostic REST engine was extracted into **`core-rest-worker`**, behind a
  tiny two-method adapter contract (`RestWorkerDb { execute; executeMany }`). D1
  and Turso are now thin adapters over that core. Because both speak the same
  Simple-REST dialect, there is a **single provider implementation**
  (`ra-cloudflare-d1`) that `ra-turso` re-exports under Turso-branded names — one
  bug fix ships to both. Adding a third backend (Neon, Supabase, local SQLite, …)
  is now a ~20-line adapter.

  ## New packages
  - **`core-rest-worker`** — the engine: SQL builder, middleware (auth, CORS,
    errors, rate limiting), routes, and `createRestApp(config, { adapter })`,
    plus the `RestWorkerDb` adapter contract.
  - **`turso-rest-worker`** — thin libSQL adapter (`createTursoRestApi`) over
    core. Targets Cloudflare Workers via `@libsql/client/web`.
  - **`ra-turso`** — Turso-branded react-admin provider; aliased re-export of
    `ra-cloudflare-d1` (`createTursoDataProvider`). No runtime code of its own.
  - **`create-turso-rest-worker`** — CLI scaffolder for a Turso Worker, the Turso
    counterpart to `create-d1-rest-worker`. Auto-discovers schema by querying
    Turso directly over libSQL (`PRAGMA table_info`) — Turso has no hosted schema
    API equivalent to the Cloudflare D1 API.

  ## Renames (breaking)
  - **Package rename: `@ra-cloudflare-d1/types` → `rest-worker-types`.** The old
    name is orphaned on npm (deprecate `@ra-cloudflare-d1/types` manually).
    Update your dependency and imports.
  - **Type rename: `D1RestConfig` → `RestWorkerConfig`** (the config type was
    never D1-specific). `d1-rest-worker` now re-exports it as `RestWorkerConfig`.
  - `d1-rest-worker` is now a thin adapter over `core-rest-worker`. Its public
    `createD1RestApi(config, opts?)` API and behavior are unchanged, but the
    re-exported config type was renamed (breaks `import type { D1RestConfig }`).

  ## Migration

  Rename the `@ra-cloudflare-d1/types` dependency to `rest-worker-types`, and any
  `D1RestConfig` references to `RestWorkerConfig`. D1 provider users are otherwise
  unaffected. Turso users now have `turso-rest-worker` + `ra-turso` (and
  `create-turso-rest-worker` to scaffold a Worker).

### Patch Changes

- Updated dependencies [[`502b369`](https://github.com/fsx8/ra-edge-sqlite/commit/502b36920c35b258508bcde3da505ccbaedeb6e3)]:
  - rest-worker-types@1.0.0

## 0.2.1

### Patch Changes

- Updated dependencies [[`eea3522`](https://github.com/fsx8/ra-cloudflare-d1/commit/eea352208cb637a120ad0c9ac4ca0d5542a478cb)]:
  - @ra-cloudflare-d1/types@0.3.0

## 0.2.0

### Minor Changes

- [`0c3b969`](https://github.com/fsx8/ra-cloudflare-d1/commit/0c3b96963e0914dc8c689225d54f8c1b7d18d664) Thanks [@fsx8](https://github.com/fsx8)! - Initial public release.

### Patch Changes

- Updated dependencies [[`0c3b969`](https://github.com/fsx8/ra-cloudflare-d1/commit/0c3b96963e0914dc8c689225d54f8c1b7d18d664)]:
  - @ra-cloudflare-d1/types@0.2.0
