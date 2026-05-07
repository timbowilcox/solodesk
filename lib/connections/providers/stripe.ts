import "server-only";

import { getConnection, recordConnectionResponse } from "@/lib/connections/get";

export type StripeCredentials = {
  secret_key: string;
  publishable_key?: string;
  account_id?: string;
};

export type StripeScopeMetadata = {
  environment?: "prod" | "sandbox";
  account_email?: string;
};

export type StripeClient = {
  connectionId: string;
  auditId: string;
  credentials: StripeCredentials;
  scopeMetadata: StripeScopeMetadata;
  /**
   * Make an authenticated request to the Stripe API. URL is appended to
   * https://api.stripe.com. Records the HTTP status to connection_audit
   * after the response lands.
   */
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
};

const BASE_URL = "https://api.stripe.com";

export async function stripeClient(opts: {
  ventureId: string;
  loopRunId: string | null;
  requestSummary: string;
}): Promise<StripeClient> {
  const conn = await getConnection<StripeCredentials>({
    ventureId: opts.ventureId,
    provider: "stripe",
    loopRunId: opts.loopRunId,
    requestSummary: opts.requestSummary,
  });
  return {
    connectionId: conn.connectionId,
    auditId: conn.auditId,
    credentials: conn.credentials,
    scopeMetadata: conn.scopeMetadata as StripeScopeMetadata,
    fetch: async (path, init = {}) => {
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${conn.credentials.secret_key}`);
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
