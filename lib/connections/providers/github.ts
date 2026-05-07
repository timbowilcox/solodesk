import "server-only";

import { getConnection, recordConnectionResponse } from "@/lib/connections/get";

export type GitHubCredentials = {
  token: string; // PAT or app-installation token
  webhook_secret?: string;
};

export type GitHubScopeMetadata = {
  org?: string;
  repo?: string; // 'owner/name' if scoped to one repo
  installation_id?: string;
  app_id?: string;
};

export type GitHubClient = {
  connectionId: string;
  auditId: string;
  credentials: GitHubCredentials;
  scopeMetadata: GitHubScopeMetadata;
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
};

const BASE_URL = "https://api.github.com";

export async function githubClient(opts: {
  ventureId: string;
  loopRunId: string | null;
  requestSummary: string;
}): Promise<GitHubClient> {
  const conn = await getConnection<GitHubCredentials>({
    ventureId: opts.ventureId,
    provider: "github",
    loopRunId: opts.loopRunId,
    requestSummary: opts.requestSummary,
  });
  return {
    connectionId: conn.connectionId,
    auditId: conn.auditId,
    credentials: conn.credentials,
    scopeMetadata: conn.scopeMetadata as GitHubScopeMetadata,
    fetch: async (path, init = {}) => {
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${conn.credentials.token}`);
      headers.set("Accept", "application/vnd.github+json");
      headers.set("X-GitHub-Api-Version", "2022-11-28");
      const response = await fetch(`${BASE_URL}${path}`, {
        ...init,
        headers,
      });
      void recordConnectionResponse({
        auditId: conn.auditId,
        responseStatus: response.status,
      });
      return response;
    },
  };
}
