import { createRouter, createWebHistory, type RouteLocationNormalized } from 'vue-router'
import Login from '../views/Login.vue'
import ExamWorkspace from '../views/ExamWorkspace.vue'
import TeacherDashboard from '../views/TeacherDashboard.vue'
import ProctorView from '../views/ProctorView.vue'
import TeacherReview from '../views/TeacherReview.vue'

type Role = 'student' | 'teacher' | 'admin'
type GuardedRoute = RouteLocationNormalized & { meta: { roles?: Role[]; public?: boolean } }
const teacherPath = '/teacher/dashboard'
const defaultExamPath = '/exam/10000000-0000-0000-0000-000000000001'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: Login, meta: { public: true } },
    { path: '/exam/:id', component: ExamWorkspace, meta: { roles: ['student'] } },
    { path: '/teacher/dashboard', component: TeacherDashboard, meta: { roles: ['teacher', 'admin'] } },
    { path: '/teacher', redirect: teacherPath, meta: { roles: ['teacher', 'admin'] } },
    { path: '/teacher/exams/:id/proctor', component: ProctorView, props: true, meta: { roles: ['teacher', 'admin'] } },
    { path: '/teacher/exams/:id/review', component: TeacherReview, props: true, meta: { roles: ['teacher', 'admin'] } },
    { path: '/', redirect: '/login' },
  ],
})

router.beforeEach((to: GuardedRoute) => {
  const token = localStorage.getItem('token')
  const role = localStorage.getItem('role') as Role | null
  if (!token && !to.meta.public && to.path !== '/login') return '/login'
  if (token && to.path === '/login') return role === 'student' ? defaultExamPath : teacherPath
  if (token && to.meta.roles && (!role || !to.meta.roles.includes(role))) {
    if (role === 'student' && to.path.startsWith('/teacher')) {
      window.alert('权限不足：学生无权访问教师考务管理中心')
      return defaultExamPath
    }
    if (role === 'teacher' || role === 'admin') return teacherPath
    return '/login'
  }
  return true
})

export default router
