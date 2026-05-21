export interface WahaConfig {
  apiKey: string;
  baseUrl: string;
}

const apiKey = useState<string>("waha_api_key", () => "");
const baseUrl = useState<string>("waha_base_url", () => "");
let initPromise: Promise<void> | null = null;

//
// Return the origin (e.g. https://waha.example.com) so that all $fetch calls
// use absolute URLs rooted at the server origin, not at the Nuxt app.baseURL
// (/dashboard/).  Without this, Nuxt's ofetch prefixes every path with
// /dashboard/, turning /api/sessions into /dashboard/api/sessions which the
// static file server serves as the SPA HTML instead of the real API response.
//
function apiBase(): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "";
}

export function useWahaApi() {
  async function init(): Promise<void> {
    if (apiKey.value) return;
    if (initPromise) return initPromise;
    initPromise = fetchConfig();
    return initPromise;
  }

  async function fetchConfig(): Promise<void> {
    try {
      const data = await $fetch<WahaConfig>(
        `${apiBase()}/api/dashboard/config`,
        { credentials: "same-origin" },
      );
      apiKey.value = data.apiKey || "";
      baseUrl.value = apiBase();
    } catch (err: unknown) {
      // 401 = not logged in → redirect to login page
      const status =
        err &&
        typeof err === "object" &&
        "status" in err &&
        typeof (err as { status: unknown }).status === "number"
          ? (err as { status: number }).status
          : 0;
      if (status === 401 && typeof window !== "undefined") {
        window.location.href = "/dashboard/login.html";
        return;
      }
      baseUrl.value = apiBase();
    }
  }

  function headers(): Record<string, string> {
    return apiKey.value ? { "X-Api-Key": apiKey.value } : {};
  }

  function authHeaders(): Record<string, string> {
    return apiKey.value ? { Authorization: `Bearer ${apiKey.value}` } : {};
  }

  async function get<T>(
    path: string,
    extra?: Record<string, unknown>,
  ): Promise<T> {
    await init();
    const merged: Record<string, unknown> = {
      ...extra,
      headers: { ...headers(), ...(extra?.headers as Record<string, string>) },
    };
    try {
      return await $fetch<T>(`${apiBase()}${path}`, merged);
    } catch (e: any) {
      throwOnPlus403(e);
    }
  }

  async function post<T>(path: string, body?: unknown): Promise<T> {
    await init();
    try {
      return await $fetch<T>(`${apiBase()}${path}`, {
        method: "POST",
        headers: headers(),
        body: body as Record<string, unknown>,
      });
    } catch (e: any) {
      throwOnPlus403(e);
    }
  }

  async function put<T>(path: string, body?: unknown): Promise<T> {
    await init();
    try {
      return await $fetch<T>(`${apiBase()}${path}`, {
        method: "PUT",
        headers: headers(),
        body: body as Record<string, unknown>,
      });
    } catch (e: any) {
      throwOnPlus403(e);
    }
  }

  async function del<T>(path: string): Promise<T> {
    await init();
    try {
      return await $fetch<T>(`${apiBase()}${path}`, {
        method: "DELETE",
        headers: headers(),
      });
    } catch (e: any) {
      throwOnPlus403(e);
    }
  }

  return {
    apiKey: readonly(apiKey),
    baseUrl: readonly(baseUrl),
    init,
    headers,
    authHeaders,
    get,
    post,
    put,
    del,
  };
}

export function extractApiError(e: any): string {
  const data = e?.response?._data || e?.data || {};
  if (typeof data === "string") return data;
  return data?.message || data?.error || e?.message || "Unknown error";
}

function throwOnPlus403(e: any): never {
  const status = e?.response?.status || e?.status || 0;
  const data = e?.response?._data || e?.data || {};
  if (status === 403 && typeof data === "object" && data?.message?.includes?.("AvailableInPlusVersion")) {
    throw new Error("This feature requires WAHA Plus");
  }
  throw e;
}
