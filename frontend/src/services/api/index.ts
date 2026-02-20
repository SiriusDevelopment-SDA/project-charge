import axios from 'axios'
const API_URL = "http://localhost:3000/api"
// console.log(import.meta.env)
export const Api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json', 
  },
  timeout: 10000,
})