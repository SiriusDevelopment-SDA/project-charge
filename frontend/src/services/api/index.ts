import axios from 'axios'
// const API_URL = "https://apicobranca.coraxy.com.br/api"
const API_URL = "http://127.0.0.1:3000/api"
export const Api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json', 
  },
  timeout: 10000,
})

Api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});
