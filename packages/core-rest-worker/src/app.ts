import { Hono } from "hono";
import type { RestWorkerConfig } from "rest-worker-types";
import type { RestAppEnv, RestWorkerDb } from "./db.js";
import { authMiddleware } from "./middleware/auth.js";
import { corsMiddleware } from "./middleware/cors.js";
import { handleError } from "./middleware/errors.js";
import { rateLimitMiddleware } from "./middleware/rateLimit.js";
import { bulkDeleteRoute } from "./routes/bulkDelete.js";
import { bulkUpdateRoute } from "./routes/bulkUpdate.js";
import { createRoute } from "./routes/create.js";
import { deleteRoute } from "./routes/delete.js";
import { allFacetsRoute, oneFacetRoute } from "./routes/facets.js";
import { listRoute } from "./routes/list.js";
import { oneRoute } from "./routes/one.js";
import { schemaRoute } from "./routes/schema.js";
import { updateRoute } from "./routes/update.js";

export interface CreateRestAppOptions {
  adapter: (env: unknown) => RestWorkerDb;
}

export function createRestApp(
  config: RestWorkerConfig,
  opts: CreateRestAppOptions,
) {
  const app = new Hono<RestAppEnv>();
  app.onError((err, c) => handleError(err, c));
  app.use("*", corsMiddleware(config));
  if (config.rateLimit) {
    app.use("*", rateLimitMiddleware(config.rateLimit));
  }
  // `requireApiKey` defaults to true (bearer-token auth enforced). Opt out with
  // `requireApiKey: false` only when a trusted authenticating proxy (Cloudflare
  // Access, a gateway, ...) already gates every request before the worker.
  if (config.requireApiKey !== false) {
    if (!config.apiKey) {
      throw new Error(
        "RestWorkerConfig.apiKey is required when requireApiKey is not false. " +
          "If the worker is fronted by a trusted authenticating proxy " +
          "(e.g. Cloudflare Access), set requireApiKey: false to skip " +
          "application-level auth.",
      );
    }
    app.use("*", authMiddleware(config.apiKey));
  }
  app.use("*", async (c, next) => {
    c.set("db", opts.adapter(c.env));
    await next();
  });

  const basePath = config.basePath ?? "/api";
  const api = new Hono<RestAppEnv>();

  api.get("/__schema", (c) => schemaRoute(c, config));
  api.get("/:resource", (c) => listRoute(c, config));
  // Facet routes must precede /:resource/:id so "__facets" is not captured
  // as an id.
  api.get("/:resource/__facets", (c) => allFacetsRoute(c, config));
  api.get("/:resource/__facets/:facet", (c) => oneFacetRoute(c, config));
  api.get("/:resource/:id", (c) => oneRoute(c, config));
  api.post("/:resource", (c) => createRoute(c, config));
  api.put("/:resource/:id", (c) => updateRoute(c, config));
  api.delete("/:resource/:id", (c) => deleteRoute(c, config));
  api.post("/:resource/__bulkUpdate", (c) => bulkUpdateRoute(c, config));
  api.post("/:resource/__bulkDelete", (c) => bulkDeleteRoute(c, config));

  app.route(basePath, api);
  return app;
}
