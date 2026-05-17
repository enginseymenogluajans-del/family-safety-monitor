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

// DEBUG — remove after confirming auth works
console.log("[api.js] BACKEND_URL      :", BACKEND_URL);
console.log("[api.js] VITE_API_URL raw :", import.meta.env.VITE_API_URL);
console.log("[api.js] VITE_API_KEY raw :", import.meta.env.VITE_API_KEY);
console.log(
  "[api.js] API_KEY resolved :",
  API_KEY || "(empty — no key will be sent!)",
);

/**
 * fetch() ile aynı API, sadece X-API-Key header'ını otomatik ekler.
 */
export function apiFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (API_KEY) headers["X-API-Key"] = API_KEY;
  // DEBUG — remove after confirming auth works
  console.log(
    "[apiFetch]",
    url,
    "| X-API-Key:",
    headers["X-API-Key"] || "(not set)",
  );
  return fetch(url, { ...options, headers });
}
