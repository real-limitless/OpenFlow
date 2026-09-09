export interface SdkHttpRequestOptions {
    method?: string;
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
    timeoutMs?: number;
}
export interface SdkHttpResponse {
    status: number;
    headers: Record<string, string>;
    body: unknown;
}
/**
 * Minimal HTTP helper for node authors.
 * Builtins may still use specialized logic in http-request executor.
 */
export declare function sdkHttpRequest(options: SdkHttpRequestOptions): Promise<SdkHttpResponse>;
