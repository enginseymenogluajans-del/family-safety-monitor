import Constants from "expo-constants";

const extra = Constants.expoConfig?.extra ?? {};
export const BACKEND_URL: string =
  extra.BACKEND_URL ?? "http://192.168.1.138:8000";
export const API_KEY: string = extra.API_KEY ?? "";

export async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": API_KEY,
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}
