/**
 * Merkezi API istemcisi — tüm backend isteklerine otomatik X-API-Key header'ı ekler.
 * VITE_API_KEY: frontend-react/.env dosyasına yaz (backend API_SECRET_KEY ile aynı olmalı)
 * Yedek: localStorage'da "api_key" anahtarı varsa kullanılır.
 */
export const BACKEND_URL =
  import.meta.env.VITE_API_URL || "http://localhost:8000";

const API_KEY =
  import.meta.env.VITE_API_KEY ||
  (typeof localStorage !== "undefined" && localStorage.getItem("api_key")) ||
  "";

/**
 * fetch() ile aynı API, sadece X-API-Key header'ını otomatik ekler.
 */
export function apiFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (API_KEY) headers["X-API-Key"] = API_KEY;
  return fetch(url, { ...options, headers });
}
