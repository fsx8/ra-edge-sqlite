import { describe, expect, it } from "vitest";
import type { RestWorkerConfig } from "rest-worker-types";
import { createRestApp } from "../src/app";
import type { DbStatement, RestWorkerDb } from "../src/db";

interface CapturedCall {
  sql: string;
  params: unknown[];
}

function capturingDb(
  rowsFor: (call: CapturedCall, index: number) => Record<string, unknown>[],
): { db: RestWorkerDb; calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  return {
    calls,
    db: {
      execute(sql: string, params: unknown[]) {
        const call = { sql, params };
        const rows = rowsFor(call, calls.push(call) - 1);
        return Promise.resolve({ rows, changes: 0 });
      },
      executeMany(statements: DbStatement[]) {
        const results = statements.map((s) => {
          const call = { sql: s.sql, params: s.params };
          const rows = rowsFor(call, calls.push(call) - 1);
          return { rows, changes: 0 };
        });
        return Promise.resolve(results);
      },
    },
  };
}

function configWithFacets(): RestWorkerConfig {
  return {
    corsOrigins: "*",
    requireApiKey: false,
    resources: {
      scenes: {
        tableName: "scenes",
        idField: "doc_id",
        selectableFields: [
          "doc_id",
          "work_type",
          "tags_json",
          "tags_add_json",
          "tags_remove_json",
        ],
        filterableFields: ["work_type"],
        sortableFields: ["doc_id"],
        searchableFields: ["doc_id"],
        facets: {
          work_type: { column: "work_type" },
          tag: {
            jsonEach: ["tags_json", "tags_add_json"],
            excludeJsonEach: "tags_remove_json",
            limit: 25,
          },
        },
      },
    },
  };
}

describe("facets routes", () => {
  it("GET /:resource/__facets returns all declared facets", async () => {
    const { db, calls } = capturingDb((call, index) =>
      index === 0
        ? [
            { value: "movie", count: 3 },
            { value: "tvshow", count: 2 },
          ]
        : [{ value: "nude", count: 5 }],
    );
    const app = createRestApp(configWithFacets(), { adapter: () => db });

    const res = await app.request("/api/scenes/__facets");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      facets: Record<string, Array<{ value: unknown; count: number }>>;
    };

    expect(Object.keys(body.facets).sort()).toEqual(["tag", "work_type"]);
    expect(body.facets.work_type).toEqual([
      { value: "movie", count: 3 },
      { value: "tvshow", count: 2 },
    ]);
    expect(body.facets.tag).toEqual([{ value: "nude", count: 5 }]);

    // Two facet statements were executed (one per declared facet).
    expect(calls).toHaveLength(2);
    expect(calls[0].sql).toContain('"work_type" IS NOT NULL');
    expect(calls[1].sql).toContain("json_each");
    expect(calls[1].params).toEqual([25]);
  });

  it("GET /:resource/__facets/:facet returns one facet", async () => {
    const { db } = capturingDb(() => [{ value: "nude", count: 7 }]);
    const app = createRestApp(configWithFacets(), { adapter: () => db });

    const res = await app.request("/api/scenes/__facets/tag");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      facet: "tag",
      values: [{ value: "nude", count: 7 }],
    });
  });

  it("returns 404 for undeclared facets", async () => {
    const { db } = capturingDb(() => []);
    const app = createRestApp(configWithFacets(), { adapter: () => db });

    const res = await app.request("/api/scenes/__facets/nope");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns empty facets object for resources without facet config", async () => {
    const { db } = capturingDb(() => []);
    const app = createRestApp(
      {
        corsOrigins: "*",
        requireApiKey: false,
        resources: {
          plain: {
            tableName: "plain",
            idField: "id",
            selectableFields: ["id"],
            filterableFields: [],
            sortableFields: [],
            searchableFields: [],
          },
        },
      },
      { adapter: () => db },
    );

    const res = await app.request("/api/plain/__facets");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ facets: {} });
  });

  it("respects bearer auth like other routes", async () => {
    const { db } = capturingDb(() => []);
    const config = configWithFacets();
    config.requireApiKey = true;
    config.apiKey = "secret";
    const app = createRestApp(config, { adapter: () => db });

    const denied = await app.request("/api/scenes/__facets");
    expect(denied.status).toBe(401);

    const allowed = await app.request("/api/scenes/__facets", {
      headers: { Authorization: "Bearer secret" },
    });
    expect(allowed.status).toBe(200);
  });

  it("does not shadow the one-route for plain ids", async () => {
    const { db, calls } = capturingDb((call) =>
      /LIMIT 1/.test(call.sql)
        ? [{ id: "some-doc-id", work_type: "movie" }]
        : [],
    );
    const app = createRestApp(configWithFacets(), { adapter: () => db });
    // The single-facet route handles /__facets/:facet; the one-route still
    // receives plain ids.
    const res = await app.request("/api/scenes/some-doc-id");
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain("doc_id = ? LIMIT 1");
  });
});
