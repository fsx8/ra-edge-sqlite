# ra-edge-sqlite

[![CI](https://github.com/fsx8/ra-edge-sqlite/actions/workflows/ci.yml/badge.svg)](https://github.com/fsx8/ra-edge-sqlite/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/ra-cloudflare-d1?label=ra-cloudflare-d1)](https://www.npmjs.com/package/ra-cloudflare-d1)
[![npm](https://img.shields.io/npm/v/ra-turso?label=ra-turso)](https://www.npmjs.com/package/ra-turso)
[![npm](https://img.shields.io/npm/v/d1-rest-worker?label=d1-rest-worker)](https://www.npmjs.com/package/d1-rest-worker)
[![npm](https://img.shields.io/npm/v/turso-rest-worker?label=turso-rest-worker)](https://www.npmjs.com/package/turso-rest-worker)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

[React-Admin](https://marmelab.com/react-admin/) data providers backed by
**[Cloudflare D1](https://developers.cloudflare.com/d1/)** and
**[Turso](https://turso.tech) (libSQL)**, each powered by a thin REST Worker.
Ship a full admin CRUD experience over either database in minutes — pagination,
filtering, sorting, search, soft delete, bulk operations, and field transforms,
all behind a configurable allow-list.

Both backends are Simple-REST dialect providers, so they drop in anywhere
`ra-data-simple-rest` would. They share one engine
([`core-rest-worker`](https://www.npmjs.com/package/core-rest-worker)) and one
provider implementation, so behavior is identical and maintenance is shared.

## How it fits together

Each database has a Worker + provider pair:

| Package                                                                              | What it is                                                                                          |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| [`d1-rest-worker`](https://www.npmjs.com/package/d1-rest-worker)                     | Cloudflare Worker (Hono) exposing the REST API over your **D1** database.                           |
| [`ra-cloudflare-d1`](https://www.npmjs.com/package/ra-cloudflare-d1)                 | React-Admin data provider that talks to the D1 Worker.                                              |
| [`turso-rest-worker`](https://www.npmjs.com/package/turso-rest-worker)               | Cloudflare Worker (Hono) exposing the REST API over your **Turso** database.                        |
| [`ra-turso`](https://www.npmjs.com/package/ra-turso)                                 | React-Admin data provider that talks to the Turso Worker.                                           |
| [`create-d1-rest-worker`](https://www.npmjs.com/package/create-d1-rest-worker)       | Interactive CLI that scaffolds a ready-to-deploy D1 Worker, with optional schema auto-discovery.    |
| [`create-turso-rest-worker`](https://www.npmjs.com/package/create-turso-rest-worker) | Interactive CLI that scaffolds a ready-to-deploy Turso Worker, with optional schema auto-discovery. |
| [`core-rest-worker`](https://www.npmjs.com/package/core-rest-worker)                 | The shared, DB-agnostic engine + the `RestWorkerDb` adapter contract (for adding other backends).   |
| `rest-worker-types`                                                                  | Shared TypeScript types consumed by the other packages. (internal)                                  |

## Quick start

### 1. Scaffold and deploy the Worker

```bash
npx create-d1-rest-worker
cd d1-rest-worker
pnpm install
pnpm exec wrangler secret put API_KEY   # the Bearer token clients will use
pnpm run deploy
```

Add `--auto-discover` to have the CLI introspect your D1 database via the
Cloudflare API and generate per-table column/filter/sort/search configuration
automatically.

### 2. Install the data provider

```bash
pnpm add ra-cloudflare-d1
```

### 3. Wire it into React-Admin

```ts
import { createD1DataProvider } from "ra-cloudflare-d1";

export const dataProvider = createD1DataProvider({
  apiUrl: "https://YOUR_WORKER_URL/api",
  apiKey: "sk_...",
});
```

That's it — `getList`, `getOne`, `getMany`, `create`, `update`, `delete`, and
their `*Many`/bulk variants are all supported.

## Quick start — Turso

Prefer Turso? Scaffold a Worker with the CLI (mirrors the D1 flow, and
introspects your schema by querying Turso over libSQL):

```bash
npx create-turso-rest-worker --auto-discover
cd turso-rest-worker
pnpm install
pnpm exec wrangler secret put API_KEY
pnpm exec wrangler secret put TURSO_AUTH_TOKEN
pnpm run deploy
```

Or write the Worker by hand — it takes your database URL and auth token directly:

```ts
import { createTursoRestApi } from "turso-rest-worker";

export default {
  async fetch(request, env) {
    return createTursoRestApi(
      {
        apiKey: env.API_KEY,
        corsOrigins: ["https://admin.example.com"],
        resources: {/* same shape as the D1 example below */},
      },
      { url: env.TURSO_CONNECTION_URL, authToken: env.TURSO_AUTH_TOKEN },
    ).fetch(request);
  },
};
```

On the client:

```ts
import { createTursoDataProvider } from "ra-turso";

export const dataProvider = createTursoDataProvider({
  apiUrl: "https://YOUR_WORKER_URL/api",
  apiKey: "sk_...",
});
```

> **Security:** The `apiKey` is sent from the browser and is retrievable by
> visitors — treat it as a **public** credential, not a secret. To limit
> exposure, set `corsOrigins` to your admin panel's exact origin(s) instead of
> `"*"`; browsers will block cross-origin requests because every API call is
> preflighted (the `Authorization` header triggers it). This stops other
> websites from abusing the key but does **not** prevent server-side use (curl,
> scripts). For production, put the Worker behind Cloudflare Access or JWT
> validation. See [docs/quick-start.md](docs/quick-start.md).

## Features

- **Simple REST compatible** — drop-in for `ra-data-simple-rest`.
- **Allow-list security** — only operator-declared tables/columns are selectable,
  filterable, sortable, or searchable; all identifiers are validated and values
  are SQL-parameterized.
- **Optional rate limiting** — Cloudflare's native Rate Limiting binding, zero
  latency, works on the Free plan. Defaults to per-API-key limits.
- **Pagination, filtering & sorting** — inclusive range pagination with a
  configurable `maxPerPage` cap; operator suffixes (`_gt`, `_gte`, `_lt`,
  `_lte`, `_contains`, `_startsWith`, `_endsWith`), `IN` arrays, and `q`
  full-text-ish search.
- **Logical filter groups** — `$or` / `$and` keys inside the filter JSON
  combine sub-filters with OR/AND, arbitrarily nestable (PostgREST-style):
  `?filter={"status":"open","$or":[{"assignee":"me"},{"priority_gte":3}]}`.
  Fields inside groups are validated against the same `filterableFields`
  allow-list; nesting is depth-capped and groups are member-capped.
- **Facets** — declare `facets` on a resource to expose
  `GET /:resource/__facets[/:facet]`: distinct values + counts for a plain
  column, or JSON1 `json_each` expansion of one or more JSON-array columns
  (with per-row exclusion via `excludeJsonEach`, e.g. the
  "scraped + additions − removals" curation pattern). The react-admin
  provider exposes this as `dataProvider.getFacets(resource, facet?)`.
- **Soft delete** — timestamp or boolean soft-delete columns, excluded by default
  and includable via `?includeDeleted=true`.
- **Bulk operations** — `updateMany`/`deleteMany` chunked over a single batched
  request, with a permissive fallback to individual requests.
- **Field transforms** — server-side boolean/date/JSON coercion, optional to
  mirror on the client.
- **Schema endpoint** — `GET /__schema` introspects configured tables for tooling.
- **TypeScript-first** — strict, type-checked, with published `.d.ts` and maps.

## Manual Worker setup

Prefer to write the Worker yourself? It's one function call:

```ts
import { createD1RestApi } from "d1-rest-worker";

export default {
  async fetch(request, env, ctx) {
    return createD1RestApi({
      apiKey: env.API_KEY,
      corsOrigins: ["https://admin.example.com"], // whitelist your admin UI
      // rateLimit: { binding: env.API_RATE_LIMITER }, // optional, needs wrangler binding
      resources: {
        posts: {
          tableName: "posts",
          idField: "id",
          selectableFields: ["id", "title", "body"],
          filterableFields: ["id", "title"],
          sortableFields: ["id", "title"],
          searchableFields: ["title", "body"],
        },
      },
    }).fetch(request, env, ctx);
  },
};
```

The default D1 binding name is `"DB"`; override it with the second argument:
`createD1RestApi(config, { dbBinding: "MY_DB" })`.

## Limitations & caveats

Both backends are **SQLite-flavored**, but a few engine differences are worth
knowing:

- **Bulk-operation atomicity differs.** `updateMany`/`deleteMany` run in a
  single batched request. **D1 batches are not transactional** (partial success
  is possible); **libSQL/Turso batches run in a transaction** and roll back on
  failure. Either way the worker falls back to per-statement requests if the
  batch fails.
- **Turso integer mode.** The Turso adapter uses the default `intMode: "number"`,
  so integers come back as JS numbers (matching D1). Configuring `bigint` /
  `string` modes is not coerced by the adapter.
- **BLOB columns on Turso.** BLOBs arrive as `ArrayBuffer` / `Uint8Array`, which
  `JSON.stringify` cannot serialize. The Turso REST path does not normalize them
  today — avoid BLOB columns in exposed resources, or pre-serialize them. (D1
  returns BLOBs as already-serialized values and is unaffected.)
- **Public API key.** `apiKey` is sent from the browser and is retrievable by
  visitors — treat it as public. Restrict `corsOrigins` and, for production, put
  the Worker behind Cloudflare Access or JWT validation.

## Documentation

- [Quick start](docs/quick-start.md)
- [Deployment options](docs/deployment-options.md) — CLI, template, or manual
- [Configuration reference](docs/configuration-reference.md) — worker & provider config, rate limiting, bulk-operation semantics
- [Filter operators](docs/filter-operators.md)
- [Soft delete](docs/soft-delete.md)
- [Migration guide](docs/migration-guide.md) — coming from `ra-data-simple-rest`

## Development

This is a pnpm + turbo monorepo (Node 24, TypeScript, Vitest). From the repo
root:

```bash
pnpm install
pnpm build        # tsc -p tsconfig.build.json per package
pnpm typecheck    # depends on ^build
pnpm test         # vitest run (integration test is opt-in via INTEGRATION=1)
pnpm lint         # ESLint (type-checked)
pnpm format       # prettier -w .
```

The integration test spins up `workerd` via `getPlatformProxy`; run it locally
with `INTEGRATION=1 pnpm --filter d1-rest-worker test`.

Releases are managed with [Changesets](https://github.com/changesets/changesets):
add a changeset (`pnpm changeset`), and merging the auto-generated "Version
Packages" PR publishes everything under `packages/**` to npm.

## License

[MIT](./LICENSE)
