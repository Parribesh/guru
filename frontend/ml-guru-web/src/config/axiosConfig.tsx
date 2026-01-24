import axios from 'axios'
import { API_URL } from './config'

export const axiosInstance = axios.create({
    baseURL: API_URL,
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
    },
})  

// Attach a request id for correlation in backend logs.
axiosInstance.interceptors.request.use((config) => {
    const rid = crypto.randomUUID()
    config.headers = config.headers ?? {}
    config.headers['x-request-id'] = rid
    return config
})
