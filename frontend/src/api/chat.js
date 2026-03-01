import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

export const sendMessage = (session_id, message, history = []) =>
  api.post('/chat', { session_id, message, history })
