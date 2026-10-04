import { createApp } from 'vue'
import axios from 'axios'
import App from './App.vue'
import router from './router'

axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

const app = createApp(App)
app.use(router)
app.mount('#app')
