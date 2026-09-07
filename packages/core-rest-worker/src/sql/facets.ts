import type { FacetConfig, ResourceConfig } from "rest-worker-types";
import { ApiError } from "../middleware/errors.js";
import { softDeleteCondition } from "./builder.js";
import { validateField, validateIdentifier } from "./validator.js";

const DEFAULT_FACET_LIMIT = 50;
const MAX_FACET_LIMIT = 200;

export interface FacetQuery {
  sql: string;
  params: unknown[];
}

function quoteIdent(identifier: string): string {
  return `"${validateIdentifier(identifier, "identifier")}"`;
}

function resolveLimit(facet: FacetConfig, name: string): number {
  if (facet.limit === undefined) return DEFAULT_FACET_LIMIT;
  if (
    typeof facet.limit !== "number" ||
    !Number.isFinite(facet.limit) ||
    facet.limit < 1
  ) {
    throw new ApiError(
      "VALIDATION_ERROR",
      `Facet '${name}' has an invalid 'limit' (expected a positive number)`,
      { facet: name, limit: facet.limit },
    );
  }
  return Math.min(Math.floor(facet.limit), MAX_FACET_LIMIT);
}

function resolveColumns(
  config: ResourceConfig,
  columns: string | string[],
  name: string,
  key: string,
): string[] {
  const list = Array.isArray(columns) ? columns : [columns];
  if (list.length === 0) {
    throw new ApiError(
      "VALIDATION_ERROR",
      `Facet '${name}' declares an empty '${key}' list`,
      { facet: name },
    );
  }
  return list.map((c) =>
    quoteIdent(
      validateField(c, config.selectableFields, "selectable", config.idField),
    ),
  );
}

/**
 * Builds the SQL for one declared facet. Two shapes:
 *
 * - `column`: distinct values + row counts of a plain column.
 * - `jsonEach`: one row per array element of one or more JSON-array columns
 *   (JSON1 `json_each`), unioned; `excludeJsonEach` subtracts per-row
 *   elements (the "scraped + additions − removals" curation pattern).
 *
 * Soft-deleted rows are excluded in both shapes.
 */
export function buildFacetQuery(
  config: ResourceConfig,
  name: string,
  facet: FacetConfig,
): FacetQuery {
  validateIdentifier(name, "facet name");
  const table = quoteIdent(config.tableName);
  const idField = quoteIdent(config.idField);
  const limit = resolveLimit(facet, name);
  const soft = softDeleteCondition(config);
  const softSql = soft ? `WHERE ${soft}` : "";

  const hasColumn = facet.column !== undefined;
  const hasJsonEach = facet.jsonEach !== undefined;
  if (hasColumn === hasJsonEach) {
    throw new ApiError(
      "VALIDATION_ERROR",
      `Facet '${name}' must declare exactly one of 'column' or 'jsonEach'`,
      { facet: name },
    );
  }

  if (hasColumn) {
    const column = quoteIdent(
      validateField(
        facet.column as string,
        config.selectableFields,
        "selectable",
        config.idField,
      ),
    );
    const whereParts = [softSql, `${column} IS NOT NULL`].filter(Boolean);
    const sql = [
      `SELECT ${column} AS value, COUNT(*) AS count`,
      `FROM ${table}`,
      whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "",
      `GROUP BY ${column}`,
      `ORDER BY count DESC, value ASC`,
      `LIMIT ?`,
    ]
      .filter(Boolean)
      .join(" ");
    return { sql, params: [limit] };
  }

  const poolColumns = resolveColumns(
    config,
    facet.jsonEach as string | string[],
    name,
    "jsonEach",
  );
  const excludeColumn =
    facet.excludeJsonEach === undefined
      ? null
      : quoteIdent(
          validateField(
            facet.excludeJsonEach,
            config.selectableFields,
            "selectable",
            config.idField,
          ),
        );

  const union = poolColumns
    .map((col) => {
      const branch = `SELECT s.${idField} AS __row_id, je.value AS value FROM ${table} s, json_each(s.${col}) je`;
      return softSql ? `${branch} ${softSql}` : branch;
    })
    .join(" UNION ALL ");

  const exclusion = excludeColumn
    ? `AND NOT EXISTS (SELECT 1 FROM ${table} s2, json_each(s2.${excludeColumn}) je2 WHERE s2.${idField} = e.__row_id AND je2.value = e.value)`
    : "";

  const sql = [
    `WITH facet_pool AS (${union})`,
    `SELECT e.value AS value, COUNT(*) AS count FROM facet_pool e`,
    `WHERE e.value IS NOT NULL ${exclusion}`.trim(),
    `GROUP BY e.value`,
    `ORDER BY count DESC, value ASC`,
    `LIMIT ?`,
  ].join(" ");
  return { sql, params: [limit] };
}
