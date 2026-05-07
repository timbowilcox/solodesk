import "server-only";

import { getConnection, recordConnectionResponse } from "@/lib/connections/get";

export type VercelCredentials = {
  token: string;
};

export type VercelScopeMetadata = {
  team_id?: string;
  project_id?: string;
  project_slug?: string;
};

export type VercelClient = {
  connectionId: string;
  auditId: string;
  credentials: VercelCredentials;
  scopeMetadata: VercelScopeMetadata;
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
};

const BASE_URL = "https://api.vercel.com";

export async function vercelClient(opts: {
  ventureId: string;
  loopRunId: string | null;
  requestSummary: string;
}): Promise<VercelClient> {
  const conn = await getConnection<VercelCredentials>({
    ventureId: opts.ventureId,
    provider: "vercel",
    loopRunId: opts.loopRunId,
    requestSummary: opts.requestSummary,
  });
  const scope = conn.scopeMetadata as VercelScopeMetadata;
  return {
    connectionId: conn.connectionId,
    auditId: conn.auditId,
    credentials: conn.credentials,
    scopeMetadata: scope,
    fetch: async (path, init = {}) => {
      // Auto-append teamId if scope_metadata supplies one.
      let url = `${BASE_URL}${path}`;
      if (scope.team_id && !path.includes("teamId=")) {
        url += url.includes("?") ? `&teamId=${scope.team_id}` : `?teamId=${scope.team_id}`;
      }
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${conn.credentials.token}`);
      const response = await fetch(url, { ...init, headers });
      void recordConnectionResponse({
        auditId: conn.auditId,
        responseStatus: response.status,
      });
      return response;
    },
  };
}
