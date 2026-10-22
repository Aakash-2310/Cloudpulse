import axios, { AxiosError } from 'axios';
import type { ApiResponse, Paginated } from '../types/common';

/**
 * Shared Axios instance. Requests go to /api on the same origin (Vite proxy in dev, Nginx in Docker),
 * and the JWT travels in an HTTP-only cookie, so no token is ever stored in JavaScript.
 */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public errors?: Array<{ field: string; message: string }>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const UNAUTHORIZED_EVENT = 'cloudpulse:unauthorized';

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ message?: string; errors?: Array<{ field: string; message: string }> }>) => {
    const status = error.response?.status ?? 0;
    let message = error.response?.data?.message;
    if (!message) {
      if (error.code === 'ECONNABORTED') message = 'The request timed out. Please try again.';
      else if (!error.response) message = 'Unable to reach the CloudPulse API. Check that the backend is running.';
      else message = `Request failed (${status})`;
    }
    if (status === 401 && !error.config?.url?.includes('/auth/')) {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    }
    return Promise.reject(new ApiError(message, status, error.response?.data?.errors));
  },
);

/** Removes empty/"all" values so they are not sent as query params. */
export function cleanParams(params: Record<string, unknown> = {}): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || v === 'all') continue;
    out[k] = v as string | number | boolean;
  }
  return out;
}

export async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const res = await api.get<ApiResponse<T>>(url, { params: cleanParams(params) });
  return res.data.data;
}

export async function getPaginated<T, X = Record<string, never>>(
  url: string,
  params?: Record<string, unknown>,
): Promise<Paginated<T> & X> {
  const res = await api.get<ApiResponse<{ items: T[] } & X>>(url, { params: cleanParams(params) });
  const meta = res.data.meta ?? { page: 1, limit: res.data.data.items.length, total: res.data.data.items.length, totalPages: 1 };
  return { ...res.data.data, meta };
}

export async function post<T>(url: string, body?: unknown): Promise<T> {
  const res = await api.post<ApiResponse<T>>(url, body ?? {});
  return res.data.data;
}

export async function put<T>(url: string, body?: unknown): Promise<T> {
  const res = await api.put<ApiResponse<T>>(url, body ?? {});
  return res.data.data;
}

export async function del<T = null>(url: string): Promise<T> {
  const res = await api.delete<ApiResponse<T>>(url);
  return res.data.data;
}

/** Downloads a file response (CSV/JSON report) through the authenticated API. */
export async function download(url: string, params?: Record<string, unknown>): Promise<void> {
  const res = await api.get<Blob>(url, { params: cleanParams(params), responseType: 'blob' });
  const disposition = String(res.headers['content-disposition'] ?? '');
  const match = /filename="?([^";]+)"?/.exec(disposition);
  const filename = match?.[1] ?? 'cloudpulse-report';
  const href = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
