import type { DataProvider } from "ra-core";
import type { FacetResponse, SingleFacetResponse } from "rest-worker-types";

export interface D1ProviderOptions {
  apiUrl: string;
  apiKey: string;
  httpClient?: typeof fetch;
  useBulkOperations?: boolean;
  transforms?: {
    booleanFields?: Record<string, string[]>;
    dateFields?: Record<string, string[]>;
    jsonFields?: Record<string, string[]>;
  };
}

/**
 * Fetches declared facets (`GET /:resource/__facets[/:facet]`). Requires the
 * worker resource to declare `facets` (see rest-worker-types FacetConfig).
 */
export type GetFacetsMethod = (
  resource: string,
  facet?: string,
) => Promise<FacetResponse | SingleFacetResponse>;

export type D1DataProvider = DataProvider & {
  supportAbortSignal?: boolean;
  getFacets?: GetFacetsMethod;
};
