import createClient from "openapi-fetch";

import type { paths } from "./schema";

// Typed fetch client over /openapi.json. Same-origin (path-routed
// ingress) so an empty baseUrl is correct. credentials: "include"
// makes the browser send the session cookie set by /auth/callback.
//
// Usage:
//   const { data, error } = await api.GET("/api/families");
//   if (error) ... else for (const f of data) ...
//
// data and error are precisely typed from schema.ts. No casts needed
// — if /api/families ever returns a different shape, tsc breaks here.
export const api = createClient<paths>({
  baseUrl: "",
  credentials: "include",
});
