export interface ResourceFieldTransformConfig {
  booleans?: string[];
  dates?: string[];
  json?: string[];
}

export interface SoftDeleteConfig {
  field: string;
  type: "timestamp" | "boolean";
}

/**
 * Declares one facet for the `GET /:resource/__facets` endpoints.
 *
 * Two shapes:
 * - plain column: distinct values of `column` with row counts;
 * - JSON-array expansion: one value per array element across one or more
 *   JSON-array `jsonEach` columns (JSON1 `json_each`), optionally minus the
 *   elements of an `excludeJsonEach` column (per-row exclusion — e.g. the
 *   "scraped + additions − removals" tag-curation pattern).
 */
export interface FacetConfig {
  /** Plain column to facet over. Must be listed in selectableFields. */
  column?: string;
  /**
   * One or more JSON-array columns whose elements are expanded and counted
   * together. Must be listed in selectableFields. Mutually exclusive with
   * `column`.
   */
  jsonEach?: string | string[];
  /** JSON-array column whose per-row elements are excluded from counts. */
  excludeJsonEach?: string;
  /** Max distinct values returned (default 50, capped at 200). */
  limit?: number;
}

export interface ResourceConfig {
  tableName: string;
  idField: string;
  selectableFields: string[];
  sortableFields: string[];
  filterableFields: string[];
  searchableFields: string[];
  softDelete?: SoftDeleteConfig;
  transforms?: ResourceFieldTransformConfig;
  /** Declared facets exposed via `GET /:resource/__facets[/:facet]`. */
  facets?: Record<string, FacetConfig>;
}

export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface RateLimitConfig {
  binding: RateLimitBinding;
  key?: (request: Request) => string;
}

export interface RestWorkerConfig {
  resources: Record<string, ResourceConfig>;
  /**
   * Bearer token checked against the request's `Authorization` header.
   * Required when `requireApiKey` is not `false` (the default); ignored when
   * `requireApiKey: false`.
   */
  apiKey?: string;
  /**
   * Defaults to `true` (bearer-token auth enforced). Set to `false` to skip
   * application-level auth entirely — only safe when the worker is fronted by
   * a trusted authenticating proxy (Cloudflare Access, an API gateway, etc.).
   */
  requireApiKey?: boolean;
  corsOrigins: string[] | "*";
  basePath?: string;
  enableSchemaEndpoint?: boolean;
  maxPerPage?: number;
  rateLimit?: RateLimitConfig;
}

export interface SchemaFieldInfo {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  defaultValue?: string | null;
  transform?: "boolean" | "date" | "json";
}

export interface SchemaResourceInfo {
  fields: SchemaFieldInfo[];
  filterable: string[];
  sortable: string[];
  searchable: string[];
}

export interface SchemaResponse {
  resources: Record<string, SchemaResourceInfo>;
}
