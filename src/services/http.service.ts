/**
 * A minimal HTTP client wrapper using native fetch. These methods
 * return a response object with a `body` property containing the parsed
 * JSON and a `statusCode` for the HTTP response code.
 */
export const http = {
  async get(
    path: string,
    opts?: Record<string, unknown>
  ): Promise<{ body: any; statusCode: number }> {
    const response = await fetch(path, {
      method: "GET",
      headers: opts?.headers as HeadersInit,
    });
    const body = await response.json();
    return { body, statusCode: response.status };
  },
  async post(
    path: string,
    opts?: Record<string, unknown>
  ): Promise<{ body: any; statusCode: number }> {
    const response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(opts?.headers as Record<string, string>),
      },
      body: JSON.stringify(opts?.body),
    });
    const body = await response.json();
    return { body, statusCode: response.status };
  },
};
