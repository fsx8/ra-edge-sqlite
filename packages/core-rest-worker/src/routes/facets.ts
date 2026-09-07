import type { Context } from "hono";
import type { FacetValue, RestWorkerConfig } from "rest-worker-types";
import type { RestAppEnv } from "../db.js";
import { ApiError } from "../middleware/errors.js";
import { buildFacetQuery } from "../sql/facets.js";
import { validateResource } from "../sql/validator.js";

/** Normalize adapter rows into typed facet values. */
function toFacetValues(rows: Record<string, unknown>[]): FacetValue[] {
  return rows.map((row) => ({
    value: row.value,
    count: Number(row.count ?? 0),
  }));
}

/**
 * GET /:resource/__facets — every declared facet of the resource in one
 * round trip: `{ facets: { name: [{ value, count }, ...] } }`.
 */
export async function allFacetsRoute(
  c: Context<RestAppEnv>,
  config: RestWorkerConfig,
) {
  const resource = c.req.param("resource");
  const rc = validateResource(resource, config);
  const db = c.get("db");

  const declared = rc.facets ?? {};
  const names = Object.keys(declared);
  if (names.length === 0) {
    return c.json({ facets: {} });
  }

  const statements = names.map((name) => {
    const facet = declared[name];
    if (!facet) {
      throw new ApiError("VALIDATION_ERROR", `Facet '${name}' has no config`, {
        resource,
        facet: name,
      });
    }
    return buildFacetQuery(rc, name, facet);
  });
  const results = await db.executeMany(
    statements.map((q) => ({ sql: q.sql, params: q.params })),
  );

  const facets: Record<string, FacetValue[]> = {};
  names.forEach((name, i) => {
    facets[name] = toFacetValues(results[i]?.rows ?? []);
  });

  return c.json({ facets });
}

/**
 * GET /:resource/__facets/:facet — a single declared facet:
 * `{ facet: name, values: [{ value, count }, ...] }`.
 */
export async function oneFacetRoute(
  c: Context<RestAppEnv>,
  config: RestWorkerConfig,
) {
  const resource = c.req.param("resource");
  const facetName = c.req.param("facet");
  if (!resource || !facetName) {
    throw new ApiError("VALIDATION_ERROR", "Resource and facet are required");
  }
  const rc = validateResource(resource, config);
  const facet = rc.facets?.[facetName];
  if (!facet) {
    throw new ApiError(
      "NOT_FOUND",
      `Facet '${facetName}' is not declared for resource '${resource}'`,
      { resource, facet: facetName },
    );
  }

  const db = c.get("db");
  const query = buildFacetQuery(rc, facetName, facet);
  const result = await db.execute(query.sql, query.params);

  return c.json({ facet: facetName, values: toFacetValues(result.rows) });
}
