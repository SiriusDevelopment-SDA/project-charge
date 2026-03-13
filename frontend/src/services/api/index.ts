import axios from "axios";

const DEFAULT_API_URL = import.meta.env.DEV
  ? "http://127.0.0.1:3000/api"
  : "https://apicobranca.coraxy.com.br/api";

const configuredApiUrl = String(import.meta.env.VITE_API_URL ?? "").trim();

const API_URL = (configuredApiUrl || DEFAULT_API_URL).replace(/\/+$/, "");

export const Api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 10000,
});

Api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});
