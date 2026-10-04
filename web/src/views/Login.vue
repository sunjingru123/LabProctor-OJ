<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'

const router = useRouter()
const account = ref('')
const password = ref('')
const showPassword = ref(false)
const remember = ref(true)
const errorMessage = ref('')
const loading = ref(false)

async function login() {
  errorMessage.value = ''
  if (!account.value.trim() || !password.value) {
    errorMessage.value = '请输入学号/工号和密码'
    return
  }
  loading.value = true
  try {
    // Vite proxies /api to the Go API during local development.
    const response = await axios.post('/api/v1/auth/login', {
      username: account.value.trim(),
      password: password.value,
    })
    const user = response.data
    localStorage.setItem('token', user.token)
    localStorage.setItem('role', user.role)
    localStorage.setItem('username', user.username || user.student_id || account.value.trim())
    if (!remember.value) sessionStorage.setItem('session_only', 'true')
    const destination = user.role === 'student' ? '/exam/10000000-0000-0000-0000-000000000001' : '/teacher/dashboard'
    await router.replace(destination)
  } catch (error: any) {
    console.error('[登录异常]', error.response || error)
    errorMessage.value = error.response?.data?.error || '学号或密码错误，请核对后重试'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main>
    <section class="card">
      <h1>LabProctor OJ</h1>
      <h2>机房专属在线编程考试系统</h2>
      <p class="sub">统一身份认证 · 安全机考 · 全程留痕</p>
      <form @submit.prevent="login">
        <label>学号 / 工号<input v-model="account" placeholder="请输入您的校内学号或教工号" autocomplete="username"></label>
        <label>登录密码<div class="password"><input v-model="password" :type="showPassword ? 'text' : 'password'" placeholder="请输入登录密码" autocomplete="current-password"><button type="button" @click="showPassword = !showPassword">{{ showPassword ? '隐藏密码' : '显示密码' }}</button></div></label>
        <label class="remember"><input v-model="remember" type="checkbox"> 记住本次登录</label>
        <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
        <button class="login" :disabled="loading">{{ loading ? '正在验证身份…' : '立即进入考场 / 监考系统' }}</button>
      </form>
      <aside><b>测试环境账号</b><br>学生测试账号：20240001 / Student@123<br>教师测试账号：teacher_01 / Teacher@123<br>管理员测试账号：admin / Admin@123</aside>
    </section>
  </main>
</template>

<style scoped>
main{min-height:100vh;display:grid;place-items:center;background:linear-gradient(135deg,#102a43,#1f4b99);font:15px system-ui}.card{width:min(390px,calc(100vw - 32px));padding:36px;background:#fff;border-radius:14px;box-shadow:0 20px 60px #071b33aa}h1{text-align:center;color:#163b70;margin:0;font-size:30px}h2{text-align:center;font-size:18px;margin:8px 0}.sub{text-align:center;color:#667085}form{display:grid;gap:14px;margin-top:24px}label{display:grid;gap:6px;font-weight:600}input{padding:11px;border:1px solid #d0d5dd;border-radius:6px;font:inherit}.password{display:flex}.password input{flex:1;min-width:0}.password button{border:1px solid #d0d5dd;background:#f8f9fa}.remember{display:block;font-weight:normal}.remember input{vertical-align:middle}.login{padding:12px;border:0;border-radius:6px;color:#fff;background:#1f4b99;cursor:pointer}.error{color:#b42318;background:#fef3f2;padding:8px;margin:0}.card aside{margin-top:22px;padding:12px;background:#fff8e6;color:#7a4b00;line-height:1.8;font-size:12px}
</style>
