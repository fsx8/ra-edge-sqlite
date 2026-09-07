export type SortOrder = "ASC" | "DESC";
export type SimpleRestSort = [string, SortOrder];
export type SimpleRestRange = [number, number];

/**
 * A logical filter group. `$or` / `$and` take a non-empty array of filter
 * nodes (which may themselves contain `$or` / `$and`, up to a small nesting
 * depth). Regular filter keys inside the same object are AND-composed with
 * the groups, mirroring PostgREST's `and=(..., or=(...))` semantics:
 *
 * ```
 * { status: "open", $or: [{ assignee: "me" }, { priority_gte: 3 }] }
 * → WHERE status = ? AND (assignee = ? OR priority >= ?)
 * ```
 */
export interface SimpleRestLogicalFilter {
  $or?: SimpleRestFilterNode[];
  $and?: SimpleRestFilterNode[];
  [key: string]: unknown;
}

export type SimpleRestFilterNode = SimpleRestLogicalFilter;

export type SimpleRestFilter =
  | Record<string, unknown>
  | {
      q?: string;
      id?: Array<string | number>;
      _includeDeleted?: boolean;
      $or?: SimpleRestFilterNode[];
      $and?: SimpleRestFilterNode[];
      [key: string]: unknown;
    };

export interface ListQuery {
  sort?: string; // JSON encoded SimpleRestSort
  range?: string; // JSON encoded SimpleRestRange
  filter?: string; // JSON encoded SimpleRestFilter
}

export type FilterOperator =
  "gt" | "gte" | "lt" | "lte" | "contains" | "startsWith" | "endsWith";

export interface ParsedListQuery {
  sort: SimpleRestSort;
  range: SimpleRestRange;
  filter: SimpleRestFilter;
}

/** One distinct value of a facet with its row count. */
export interface FacetValue {
  value: unknown;
  count: number;
}

export interface FacetResponse {
  facets: Record<string, FacetValue[]>;
}

export interface SingleFacetResponse {
  facet: string;
  values: FacetValue[];
}
