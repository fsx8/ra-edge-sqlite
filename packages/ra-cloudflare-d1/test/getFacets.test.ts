import { describe, expect, it } from "vitest";
import { createD1DataProvider } from "../src/dataProvider";
import type { D1ProviderOptions } from "../src/types";

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

function makeFetch(responses: Response[]): {
  fetchImpl: typeof fetch;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  let idx = 0;
  const fetchImpl: typeof fetch = (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    calls.push({ url, init });
    const res = responses[idx] ?? responses[responses.length - 1];
    idx++;
    return Promise.resolve(res);
  };
  return { fetchImpl, calls };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function makeProvider(
  responses: Response[],
  opts?: Partial<D1ProviderOptions>,
): { provider: ReturnType<typeof createD1DataProvider>; calls: FetchCall[] } {
  const { fetchImpl, calls } = makeFetch(responses);
  const provider = createD1DataProvider({
    apiUrl: "https://api.test/api",
    apiKey: "k",
    httpClient: fetchImpl,
    ...opts,
  });
  return { provider, calls };
}

describe("getFacets", () => {
  it("fetches all facets when no facet name is given", async () => {
    const { provider, calls } = makeProvider([
      jsonResponse({
        facets: {
          work_type: [
            { value: "movie", count: 3 },
            { value: "tvshow", count: 2 },
          ],
        },
      }),
    ]);

    const result = await provider.getFacets!("scenes");

    expect(result).toEqual({
      facets: {
        work_type: [
          { value: "movie", count: 3 },
          { value: "tvshow", count: 2 },
        ],
      },
    });
    expect(calls[0].url).toBe("https://api.test/api/scenes/__facets");
    expect(calls[0].init?.method).toBe("GET");
  });

  it("fetches a single facet when a name is given", async () => {
    const { provider, calls } = makeProvider([
      jsonResponse({
        facet: "tag",
        values: [{ value: "nude", count: 7 }],
      }),
    ]);

    const result = await provider.getFacets!("scenes", "tag");

    expect(result).toEqual({
      facet: "tag",
      values: [{ value: "nude", count: 7 }],
    });
    expect(calls[0].url).toBe("https://api.test/api/scenes/__facets/tag");
  });

  it("sends the bearer token", async () => {
    const { provider, calls } = makeProvider([jsonResponse({ facets: {} })]);
    await provider.getFacets!("scenes");
    expect((calls[0].init?.headers as Headers).get("Authorization")).toBe(
      "Bearer k",
    );
  });
});
