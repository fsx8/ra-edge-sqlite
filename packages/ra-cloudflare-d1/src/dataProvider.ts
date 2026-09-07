import type {
  CreateParams,
  CreateResult,
  DeleteManyParams,
  DeleteManyResult,
  DeleteParams,
  DeleteResult,
  GetListParams,
  GetListResult,
  GetManyParams,
  GetManyReferenceParams,
  GetManyReferenceResult,
  GetManyResult,
  GetOneParams,
  GetOneResult,
  Identifier,
  UpdateManyParams,
  UpdateManyResult,
  UpdateParams,
  UpdateResult,
} from "ra-core";
import type {
  FacetResponse,
  FacetValue,
  SingleFacetResponse,
} from "rest-worker-types";
import { buildListQuery } from "./queryBuilder.js";
import { httpClient } from "./httpClient.js";
import { parseTotal } from "./responseParser.js";
import { applyTransforms } from "./transforms.js";
import type { D1ProviderOptions, D1DataProvider } from "./types.js";

export type FacetsResult = FacetResponse;
export type SingleFacetResult = SingleFacetResponse;
export type { FacetValue };

type RecordRow = Record<string, unknown>;

function toIds(ids: unknown[]): Identifier[] {
  return ids.map((id): Identifier => {
    if (typeof id === "string" || typeof id === "number") return id;
    return String(id);
  });
}

function signalOf(params: unknown): AbortSignal | undefined {
  if (params && typeof params === "object" && "signal" in params) {
    const s = (params as { signal?: unknown }).signal;
    return s instanceof AbortSignal ? s : undefined;
  }
  return undefined;
}

export function createD1DataProvider(
  options: D1ProviderOptions,
): D1DataProvider {
  const apiUrl = options.apiUrl.replace(/\/$/, "");
  const useBulk = options.useBulkOperations ?? true;

  const fetchJson = async (
    url: string,
    init?: RequestInit,
    signal?: AbortSignal,
  ) => {
    const res = await httpClient(
      url,
      { ...init, signal },
      { apiKey: options.apiKey, fetchImpl: options.httpClient },
    );
    const json: unknown = await res.json().catch(() => null);
    return { res, json };
  };

  const provider: D1DataProvider = {
    async getList(
      resource: string,
      params: GetListParams,
    ): Promise<GetListResult> {
      const { page, perPage } = params.pagination ?? { page: 1, perPage: 25 };
      const start = (page - 1) * perPage;
      const end = start + perPage - 1;
      const sortField = params.sort?.field ?? "id";
      const sortOrder = params.sort?.order ?? "ASC";
      const query = buildListQuery({
        sort: [sortField, sortOrder],
        range: [start, end],
        filter: params.filter ?? {},
      });
      const url = `${apiUrl}/${resource}?${query}`;
      const { res, json } = await fetchJson(url, undefined, signalOf(params));
      const total = parseTotal(res.headers);
      const data = applyTransforms(
        resource,
        json,
        options.transforms,
      ) as RecordRow[];
      return { data, total };
    },

    async getOne(
      resource: string,
      params: GetOneParams,
    ): Promise<GetOneResult> {
      const url = `${apiUrl}/${resource}/${encodeURIComponent(String(params.id))}`;
      const { json } = await fetchJson(url, undefined, signalOf(params));
      const data = applyTransforms(
        resource,
        json,
        options.transforms,
      ) as RecordRow;
      return { data };
    },

    async getMany(
      resource: string,
      params: GetManyParams,
    ): Promise<GetManyResult> {
      if (params.ids.length === 0) return { data: [] };
      const filter = { id: toIds(params.ids) };
      const query = buildListQuery({
        sort: ["id", "ASC"],
        range: [0, params.ids.length - 1],
        filter,
      });
      const url = `${apiUrl}/${resource}?${query}`;
      const { json } = await fetchJson(url, undefined, signalOf(params));
      const data = applyTransforms(
        resource,
        json,
        options.transforms,
      ) as RecordRow[];
      return { data };
    },

    async getManyReference(
      resource: string,
      params: GetManyReferenceParams,
    ): Promise<GetManyReferenceResult> {
      const { page, perPage } = params.pagination ?? { page: 1, perPage: 25 };
      const start = (page - 1) * perPage;
      const end = start + perPage - 1;
      const filter = {
        ...((params.filter ?? {}) as Record<string, unknown>),
        [params.target]: params.id,
      };
      const sortField = params.sort?.field ?? "id";
      const sortOrder = params.sort?.order ?? "ASC";
      const query = buildListQuery({
        sort: [sortField, sortOrder],
        range: [start, end],
        filter,
      });
      const url = `${apiUrl}/${resource}?${query}`;
      const { res, json } = await fetchJson(url, undefined, signalOf(params));
      const total = parseTotal(res.headers);
      const data = applyTransforms(
        resource,
        json,
        options.transforms,
      ) as RecordRow[];
      return { data, total };
    },

    async create(
      resource: string,
      params: CreateParams,
    ): Promise<CreateResult> {
      const url = `${apiUrl}/${resource}`;
      const { json } = await fetchJson(
        url,
        { method: "POST", body: JSON.stringify(params.data) },
        signalOf(params),
      );
      const data = applyTransforms(
        resource,
        json,
        options.transforms,
      ) as RecordRow;
      return { data };
    },

    async update(
      resource: string,
      params: UpdateParams,
    ): Promise<UpdateResult> {
      const url = `${apiUrl}/${resource}/${encodeURIComponent(String(params.id))}`;
      const { json } = await fetchJson(
        url,
        { method: "PUT", body: JSON.stringify(params.data) },
        signalOf(params),
      );
      const data = applyTransforms(
        resource,
        json,
        options.transforms,
      ) as RecordRow;
      return { data };
    },

    async updateMany(
      resource: string,
      params: UpdateManyParams,
    ): Promise<UpdateManyResult> {
      const ids = toIds(params.ids);
      if (useBulk) {
        const url = `${apiUrl}/${resource}/__bulkUpdate`;
        const { json } = await fetchJson(
          url,
          { method: "POST", body: JSON.stringify({ ids, data: params.data }) },
          signalOf(params),
        );
        const payload = json as { data?: unknown } | null;
        return { data: (payload?.data ?? ids) as Identifier[] };
      }

      await Promise.all(
        ids.map((id) =>
          fetchJson(
            `${apiUrl}/${resource}/${encodeURIComponent(String(id))}`,
            { method: "PUT", body: JSON.stringify(params.data) },
            signalOf(params),
          ),
        ),
      );
      return { data: ids };
    },

    async delete(
      resource: string,
      params: DeleteParams,
    ): Promise<DeleteResult> {
      const url = `${apiUrl}/${resource}/${encodeURIComponent(String(params.id))}`;
      const { json } = await fetchJson(
        url,
        { method: "DELETE" },
        signalOf(params),
      );
      const data = (json ?? { id: params.id }) as RecordRow;
      return { data };
    },

    async deleteMany(
      resource: string,
      params: DeleteManyParams,
    ): Promise<DeleteManyResult> {
      const ids = toIds(params.ids);
      if (useBulk) {
        const url = `${apiUrl}/${resource}/__bulkDelete`;
        const { json } = await fetchJson(
          url,
          { method: "POST", body: JSON.stringify({ ids }) },
          signalOf(params),
        );
        const payload = json as { data?: unknown } | null;
        return { data: (payload?.data ?? ids) as Identifier[] };
      }

      await Promise.all(
        ids.map((id) =>
          fetchJson(
            `${apiUrl}/${resource}/${encodeURIComponent(String(id))}`,
            { method: "DELETE" },
            signalOf(params),
          ),
        ),
      );
      return { data: ids };
    },

    async getFacets(
      resource: string,
      facet?: string,
    ): Promise<FacetsResult | SingleFacetResult> {
      const url = `${apiUrl}/${resource}/__facets${facet ? `/${encodeURIComponent(facet)}` : ""}`;
      const { json } = await fetchJson(url, { method: "GET" });
      if (facet) {
        const payload = json as SingleFacetResponse | null;
        return {
          facet: payload?.facet ?? facet,
          values: payload?.values ?? [],
        };
      }
      const payload = json as FacetResponse | null;
      return { facets: payload?.facets ?? {} };
    },
  };

  provider.supportAbortSignal = true;
  return provider;
}
