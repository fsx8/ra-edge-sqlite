import { describe, expect, it } from "vitest";
import type { ResourceConfig } from "rest-worker-types";
import { buildFacetQuery } from "../src/sql/facets";
import { buildWhereClause } from "../src/sql/builder";
import { ApiError } from "../src/middleware/errors";

function makeResourceConfig(
  overrides: Partial<ResourceConfig> = {},
): ResourceConfig {
  return {
    tableName: "posts",
    idField: "id",
    selectableFields: ["id", "title", "body", "deleted_at", "age"],
    sortableFields: ["id", "title"],
    filterableFields: ["id", "title", "age"],
    searchableFields: ["title", "body"],
    ...overrides,
  };
}

describe("sql/builder — logical filter groups", () => {
  it("$or group produces parenthesized OR with its params", () => {
    const rc = makeResourceConfig();
    const where = buildWhereClause(rc, {
      $or: [{ title: "a" }, { age_gte: 18 }],
    });
    expect(where.sql).toBe("WHERE (title = ? OR age >= ?)");
    expect(where.params).toEqual(["a", 18]);
  });

  it("$and group ANDs its members", () => {
    const rc = makeResourceConfig();
    const where = buildWhereClause(rc, {
      $and: [{ title: "a" }, { age_gte: 18 }],
    });
    expect(where.sql).toBe("WHERE (title = ? AND age >= ?)");
    expect(where.params).toEqual(["a", 18]);
  });

  it("groups compose with plain keys via AND", () => {
    const rc = makeResourceConfig();
    const where = buildWhereClause(rc, {
      q: "hello",
      $or: [{ title: "a" }, { age: 3 }],
    });
    expect(where.sql).toBe(
      "WHERE (title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\') AND (title = ? OR age = ?)",
    );
    expect(where.params).toEqual(["%hello%", "%hello%", "a", 3]);
  });

  it("groups nest arbitrarily (or inside and inside or)", () => {
    const rc = makeResourceConfig();
    const where = buildWhereClause(rc, {
      $or: [
        {
          $and: [{ title: "x" }, { $or: [{ age: 1 }, { age: 2 }] }],
        },
        { title: "y" },
      ],
    });
    expect(where.sql).toBe(
      "WHERE ((title = ? AND (age = ? OR age = ?)) OR title = ?)",
    );
    expect(where.params).toEqual(["x", 1, 2, "y"]);
  });

  it("respects soft delete alongside groups", () => {
    const rc = makeResourceConfig({
      softDelete: { field: "deleted_at", type: "timestamp" },
    });
    const where = buildWhereClause(rc, { $or: [{ title: "a" }] });
    expect(where.sql).toBe("WHERE deleted_at IS NULL AND (title = ?)");
  });

  it("rejects empty / non-array groups", () => {
    const rc = makeResourceConfig();
    expect(() => buildWhereClause(rc, { $or: [] })).toThrow(ApiError);
    expect(() => buildWhereClause(rc, { $or: { title: "a" } })).toThrow(
      ApiError,
    );
  });

  it("rejects members that produce no conditions", () => {
    const rc = makeResourceConfig();
    expect(() => buildWhereClause(rc, { $or: [{}] })).toThrow(ApiError);
  });

  it("rejects non-object members", () => {
    const rc = makeResourceConfig();
    expect(() => buildWhereClause(rc, { $or: ["title"] })).toThrow(ApiError);
  });

  it("rejects nesting beyond the depth cap", () => {
    const rc = makeResourceConfig();
    let node: Record<string, unknown> = { title: "deep" };
    for (let i = 0; i < 15; i++) {
      node = { $or: [node] };
    }
    expect(() => buildWhereClause(rc, node)).toThrow(/maximum depth/);
  });

  it("keeps field allowlist enforcement inside groups", () => {
    const rc = makeResourceConfig();
    expect(() =>
      buildWhereClause(rc, { $or: [{ secret_field: "x" }] }),
    ).toThrow(/not filterable/);
  });

  it("accepts multiple members with the same field (unlike a map)", () => {
    const rc = makeResourceConfig();
    const where = buildWhereClause(rc, {
      $or: [{ age: 1 }, { age: 2 }, { age: 3 }],
    });
    expect(where.sql).toBe("WHERE (age = ? OR age = ? OR age = ?)");
    expect(where.params).toEqual([1, 2, 3]);
  });

  it("wraps multi-condition members so group logic stays intact", () => {
    const rc = makeResourceConfig();
    const where = buildWhereClause(rc, {
      $or: [{ title: "a", age: 1 }, { title: "b" }],
    });
    expect(where.sql).toBe("WHERE ((title = ? AND age = ?) OR title = ?)");
  });
});

describe("sql/facets — buildFacetQuery", () => {
  it("plain column: distinct values with counts, NULLs excluded", () => {
    const rc = makeResourceConfig({
      selectableFields: ["id", "title", "category"],
      facets: {
        category: { column: "category" },
      },
    });
    const q = buildFacetQuery(rc, "category", rc.facets!.category);
    expect(q.sql).toBe(
      'SELECT "category" AS value, COUNT(*) AS count FROM "posts" WHERE "category" IS NOT NULL GROUP BY "category" ORDER BY count DESC, value ASC LIMIT ?',
    );
    expect(q.params).toEqual([50]);
  });

  it("plain column respects soft delete", () => {
    const rc = makeResourceConfig({
      selectableFields: ["id", "title", "category"],
      softDelete: { field: "deleted_at", type: "timestamp" },
      facets: { category: { column: "category" } },
    });
    const q = buildFacetQuery(rc, "category", rc.facets!.category);
    expect(q.sql).toContain(
      'WHERE deleted_at IS NULL AND "category" IS NOT NULL',
    );
  });

  it("jsonEach single column expands elements", () => {
    const rc = makeResourceConfig({
      selectableFields: ["id", "tags_json"],
      facets: { tag: { jsonEach: "tags_json" } },
    });
    const q = buildFacetQuery(rc, "tag", rc.facets!.tag);
    expect(q.sql).toBe(
      'WITH facet_pool AS (SELECT s."id" AS __row_id, je.value AS value FROM "posts" s, json_each(s."tags_json") je) ' +
        "SELECT e.value AS value, COUNT(*) AS count FROM facet_pool e " +
        "WHERE e.value IS NOT NULL GROUP BY e.value ORDER BY count DESC, value ASC LIMIT ?",
    );
    expect(q.params).toEqual([50]);
  });

  it("jsonEach unions multiple columns and subtracts the exclusion column", () => {
    const rc = makeResourceConfig({
      selectableFields: [
        "id",
        "tags_json",
        "tags_add_json",
        "tags_remove_json",
      ],
      facets: {
        tag: {
          jsonEach: ["tags_json", "tags_add_json"],
          excludeJsonEach: "tags_remove_json",
          limit: 100,
        },
      },
    });
    const q = buildFacetQuery(rc, "tag", rc.facets!.tag);
    expect(q.sql).toBe(
      'WITH facet_pool AS (SELECT s."id" AS __row_id, je.value AS value FROM "posts" s, json_each(s."tags_json") je ' +
        'UNION ALL SELECT s."id" AS __row_id, je.value AS value FROM "posts" s, json_each(s."tags_add_json") je) ' +
        "SELECT e.value AS value, COUNT(*) AS count FROM facet_pool e " +
        'WHERE e.value IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "posts" s2, json_each(s2."tags_remove_json") je2 WHERE s2."id" = e.__row_id AND je2.value = e.value) ' +
        "GROUP BY e.value ORDER BY count DESC, value ASC LIMIT ?",
    );
    expect(q.params).toEqual([100]);
  });

  it("caps limit at 200 and rejects invalid limits", () => {
    const rc = makeResourceConfig({
      selectableFields: ["id", "tags_json"],
      facets: { tag: { jsonEach: "tags_json", limit: 1000 } },
    });
    expect(buildFacetQuery(rc, "tag", rc.facets!.tag).params).toEqual([200]);

    const bad = makeResourceConfig({
      selectableFields: ["id", "tags_json"],
      facets: { tag: { jsonEach: "tags_json", limit: 0 } },
    });
    expect(() => buildFacetQuery(bad, "tag", bad.facets!.tag)).toThrow(
      ApiError,
    );
  });

  it("rejects facets declaring both column and jsonEach, or neither", () => {
    const both = makeResourceConfig({
      selectableFields: ["id", "title", "tags_json"],
      facets: { bad: { column: "title", jsonEach: "tags_json" } },
    });
    expect(() => buildFacetQuery(both, "bad", both.facets!.bad)).toThrow(
      ApiError,
    );

    const neither = makeResourceConfig({
      selectableFields: ["id", "title"],
      facets: { bad: {} },
    });
    expect(() => buildFacetQuery(neither, "bad", neither.facets!.bad)).toThrow(
      ApiError,
    );
  });

  it("validates facet columns against selectableFields", () => {
    const rc = makeResourceConfig({
      selectableFields: ["id", "title"],
      facets: { bad: { column: "secret" } },
    });
    expect(() => buildFacetQuery(rc, "bad", rc.facets!.bad)).toThrow(
      /not selectable/,
    );
  });
});
