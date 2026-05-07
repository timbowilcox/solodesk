import "server-only";

import { getConnection, recordConnectionResponse } from "@/lib/connections/get";

export type ResendCredentials = {
  api_key: string;
  webhook_signing_secret?: string;
};

export type ResendScopeMetadata = {
  from_address?: string; // e.g. 'hello@solodesk.ai'
  domain_id?: string;
};

export type ResendClient = {
  connectionId: string;
  auditId: string;
  credentials: ResendCredentials;
  scopeMetadata: ResendScopeMetadata;
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
};

const BASE_URL = "https://api.resend.com";

export async function resendClient(opts: {
  ventureId: string;
  loopRunId: string | null;
  requestSummary: string;
}): Promise<ResendClient> {
  const conn = await getConnection<ResendCredentials>({
    ventureId: opts.ventureId,
    provider: "resend",
    loopRunId: opts.loopRunId,
    requestSummary: opts.requestSummary,
  });
  return {
    connectionId: conn.connectionId,
    auditId: conn.auditId,
    credentials: conn.credentials,
    scopeMetadata: conn.scopeMetadata as ResendScopeMetadata,
    fetch: async (path, init = {}) => {
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${conn.credentials.api_key}`);
      headers.set("Content-Type", "application/json");
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
