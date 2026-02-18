import axios from 'axios'
// import { useNavigate } from "react-router-dom";

//export const API_URL = 'https://apicobranca.coraxy.com.br/api'
export const API_URL = 'http://127.0.0.1:3000/api'
export const Api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
})