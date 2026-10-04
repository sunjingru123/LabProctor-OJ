<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'

type Exam = { id: string; title: string; status: string; start_time?: string; end_time?: string; ip_whitelist?: string[]; manual_review?: boolean }
type TestCase = { input: string; output: string }
type Question = { id: string; ordinal: number; title: string; statement: string; max_score: number; time_limit_ms: number; memory_limit_mb: number; template_code: string; has_template: boolean; sample_cases?: TestCase[]; test_cases?: TestCase[] }
type Participant = { id: string; student_id: string; name: string; class_name: string; extra_minutes: number; ip_exempt: boolean }
type QuestionForm = { title: string; statement: string; max_score: number; time_limit_ms: number; memory_limit_mb: number; language: 'C' | 'C++'; template_code: string; sample_cases: TestCase[]; test_cases: TestCase[] }

const router = useRouter()
const identity = localStorage.getItem('username') || '教师'
const fallbackExam = '10000000-0000-0000-0000-000000000001'
const tabs = [{ id: 'monitor', label: '考务监控与成绩归档' }, { id: 'questions', label: '题目管理与导入' }, { id: 'participants', label: '考生范围与名单管理' }] as const
const activeTab = ref<(typeof tabs)[number]['id']>('monitor')
const exams = ref<Exam[]>([])
const selected = ref(fallbackExam)
const questions = ref<Question[]>([])
const participants = ref<Participant[]>([])
const loading = ref(false)
const toast = ref('')
const questionModal = ref(false)
const questionImportModal = ref(false)
const participantImportModal = ref(false)
const privilegeModal = ref(false)
const examModal = ref(false)
const editingExam = ref<Exam | null>(null)
const examForm = ref({ title: '', start_time: '', end_time: '', ip_whitelist: '127.0.0.1/32\n192.168.0.0/16', manual_review: false })
const previewQuestion = ref<Question | null>(null)
const editingQuestion = ref<Question | null>(null)
const privilegeStudent = ref<Participant | null>(null)
const questionFile = ref<File | null>(null)
const participantFile = ref<File | null>(null)

const freshQuestion = (): QuestionForm => ({ title: '', statement: '', max_score: 100, time_limit_ms: 1000, memory_limit_mb: 64, language: 'C++', template_code: '// === STUDENT_CODE_START ===\n\n// === STUDENT_CODE_END ===', sample_cases: [{ input: '', output: '' }], test_cases: [{ input: '', output: '' }] })
const questionForm = ref<QuestionForm>(freshQuestion())
const privilegeForm = ref({ extra_minutes: 0, ip_exempt: false })
const selectedExam = computed(() => exams.value.find((exam) => exam.id === selected.value) || null)
const examTitle = computed(() => selectedExam.value?.title || '当前考试')
function labelForStatus(status?: string) { return ({ draft: '草稿', published: '待开始', pending: '待开始', running: '进行中', ongoing: '进行中', closed: '已结束', ended: '已结束', archived: '已结束' }[status || 'draft'] || status || '草稿') }
const statusLabel = computed(() => labelForStatus(selectedExam.value?.status))
const canEditExam = computed(() => { const status = selectedExam.value?.status || ''; const beforeStart = !selectedExam.value?.start_time || Date.now() < Date.parse(selectedExam.value.start_time); return ['draft', 'published', 'pending'].includes(status) && beforeStart })
const formattedStart = computed(() => formatDate(selectedExam.value?.start_time))
const formattedEnd = computed(() => formatDate(selectedExam.value?.end_time))
const whitelist = computed(() => selectedExam.value?.ip_whitelist?.join(', ') || '未配置')
function formatDate(value?: string) { return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-') : '—' }
function toLocalInput(value?: string) { if (!value) return ''; const date = new Date(value); const pad = (part: number) => String(part).padStart(2, '0'); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}` }

function notify(message: string) { toast.value = message; window.setTimeout(() => { if (toast.value === message) toast.value = '' }, 3500) }
function apiError(error: unknown, fallback: string) { return axios.isAxiosError(error) ? error.response?.data?.error || fallback : fallback }
function logout() { localStorage.clear(); router.replace('/login') }
function download(path: string) { window.open(`/api/v1/teacher/exams/${selected.value}/exports/${path}`, '_blank', 'noopener') }
function downloadText(name: string, content: string, type = 'text/plain;charset=utf-8') { const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([content], { type })); link.download = name; link.click(); URL.revokeObjectURL(link.href) }

async function loadExams() {
  try {
    const { data } = await axios.get<Exam[]>('/api/v1/teacher/exams')
    exams.value = data.length ? data : [{ id: fallbackExam, title: 'LabProctor 模拟考试', status: '进行中' }]
    if (!exams.value.some((exam) => exam.id === selected.value)) selected.value = exams.value[0].id
  } catch { exams.value = [{ id: fallbackExam, title: 'LabProctor 模拟考试', status: '进行中' }] }
}
function openCreateExam() { editingExam.value = null; examForm.value = { title: '', start_time: '', end_time: '', ip_whitelist: '127.0.0.1/32\n192.168.0.0/16', manual_review: false }; examModal.value = true }
function openEditExam() { if (!canEditExam.value) { notify('考试已启动，核心时间与白名单已锁定禁止修改'); return }; if (!selectedExam.value) return; editingExam.value = selectedExam.value; examForm.value = { title: selectedExam.value.title, start_time: toLocalInput(selectedExam.value.start_time), end_time: toLocalInput(selectedExam.value.end_time), ip_whitelist: (selectedExam.value.ip_whitelist || []).join('\n'), manual_review: Boolean(selectedExam.value.manual_review) }; examModal.value = true }
function validExamForm() { return examForm.value.title.trim() && examForm.value.start_time && examForm.value.end_time && new Date(examForm.value.start_time) < new Date(examForm.value.end_time) }
async function saveExam() { if (!validExamForm()) { notify('请填写考试名称，并确保开始时间早于截止时间。'); return }; const ips = examForm.value.ip_whitelist.split(/[\s,]+/).map((ip) => ip.trim()).filter(Boolean); try { const payload = { title: examForm.value.title.trim(), start_time: new Date(examForm.value.start_time).toISOString(), end_time: new Date(examForm.value.end_time).toISOString(), ip_whitelist: ips, manual_review: examForm.value.manual_review }; if (editingExam.value) await axios.put(`/api/v1/teacher/exams/${editingExam.value.id}`, payload); else await axios.post('/api/v1/teacher/exams', payload); examModal.value = false; await loadExams(); notify(editingExam.value ? '考试设置已保存。' : '考试创建成功。') } catch (error) { notify(apiError(error, '考试设置保存失败。')) } }
async function startExam() { if (!selectedExam.value || !canEditExam.value) return; if (!window.confirm('立即开始考试？开始后核心时间与白名单将锁定。')) return; try { await axios.post(`/api/v1/teacher/exams/${selected.value}/start`); await loadExams(); notify('考试已开始，考生可进入答题。') } catch (error) { notify(apiError(error, '考试启动失败。')) } }
async function publishExam() { if (!selectedExam.value || selectedExam.value.status !== 'draft') return; try { await axios.post(`/api/v1/teacher/exams/${selected.value}/publish`); await loadExams(); notify('考试已发布为待开始状态。') } catch (error) { notify(apiError(error, '考试发布失败。')) } }
async function loadResources() {
  loading.value = true
  try {
    const [questionResponse, participantResponse] = await Promise.all([
      axios.get<Question[]>(`/api/v1/teacher/exams/${selected.value}/questions`),
      axios.get<Participant[]>(`/api/v1/teacher/exams/${selected.value}/participants`),
    ])
    questions.value = questionResponse.data
    participants.value = participantResponse.data
  } catch (error) { notify(apiError(error, '无法加载考务数据，请检查后端连接。')) } finally { loading.value = false }
}
onMounted(async () => { await loadExams(); await loadResources() })
watch(selected, loadResources)

function openNewQuestion() { editingQuestion.value = null; questionForm.value = freshQuestion(); questionModal.value = true }
function editQuestion(question: Question) {
  editingQuestion.value = question
  questionForm.value = { title: question.title, statement: question.statement, max_score: question.max_score, time_limit_ms: question.time_limit_ms, memory_limit_mb: question.memory_limit_mb, language: 'C++', template_code: question.template_code, sample_cases: question.sample_cases?.length ? question.sample_cases : [{ input: '', output: '' }], test_cases: question.test_cases?.length ? question.test_cases : [{ input: '', output: '' }] }
  questionModal.value = true
}
function validQuestion() { const value = questionForm.value; return value.title.trim() && value.statement.trim() && value.max_score > 0 && value.time_limit_ms > 0 && value.memory_limit_mb > 0 }
function addCase(kind: 'sample_cases' | 'test_cases') { questionForm.value[kind].push({ input: '', output: '' }) }
function removeCase(kind: 'sample_cases' | 'test_cases', index: number) { if (questionForm.value[kind].length > 1) questionForm.value[kind].splice(index, 1) }
async function saveQuestion() {
  if (!validQuestion()) { notify('请完整填写题目名称、题干和正数限制。'); return }
  try {
    const path = `/api/v1/teacher/exams/${selected.value}/questions${editingQuestion.value ? `/${editingQuestion.value.id}` : ''}`
    await axios({ method: editingQuestion.value ? 'put' : 'post', url: path, data: questionForm.value })
    questionModal.value = false; await loadResources(); notify(editingQuestion.value ? '题目已更新。' : '题目已新增。')
  } catch (error) { notify(apiError(error, '题目保存失败。')) }
}
async function deleteQuestion(question: Question) {
  if (!window.confirm(`确定删除题目“${question.title}”？相关测试用例也会删除。`)) return
  try { await axios.delete(`/api/v1/teacher/exams/${selected.value}/questions/${question.id}`); await loadResources(); notify('题目已删除。') } catch (error) { notify(apiError(error, '题目删除失败。')) }
}

function parseCsv(text: string) {
  const rows = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean).map((line) => line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, '')))
  const headers = rows.shift()?.map((header) => header.toLowerCase()) || []
  return rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] || ''])))
}
function xmlText(node: Element | undefined) { return node?.textContent || '' }
async function unzipEntries(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer()); const view = new DataView(bytes.buffer); const entries = new Map<string, Uint8Array>()
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
    if (view.getUint32(offset, true) !== 0x06054b50) continue
    const count = view.getUint16(offset + 10, true); let cursor = view.getUint32(offset + 16, true)
    for (let index = 0; index < count; index++) {
      if (view.getUint32(cursor, true) !== 0x02014b50) break
      const method = view.getUint16(cursor + 10, true); const compressedSize = view.getUint32(cursor + 20, true); const nameLength = view.getUint16(cursor + 28, true); const extraLength = view.getUint16(cursor + 30, true); const commentLength = view.getUint16(cursor + 32, true); const localOffset = view.getUint32(cursor + 42, true); const name = new TextDecoder().decode(bytes.slice(cursor + 46, cursor + 46 + nameLength)); const localNameLength = view.getUint16(localOffset + 26, true); const localExtraLength = view.getUint16(localOffset + 28, true); const data = bytes.slice(localOffset + 30 + localNameLength + localExtraLength, localOffset + 30 + localNameLength + localExtraLength + compressedSize)
      if (method === 0) entries.set(name, data)
      if (method === 8 && 'DecompressionStream' in window) { const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')); entries.set(name, new Uint8Array(await new Response(stream).arrayBuffer())) }
      cursor += 46 + nameLength + extraLength + commentLength
    }
    break
  }
  return entries
}
async function parseXlsx(file: File) {
  const files = await unzipEntries(file); const decoder = new TextDecoder(); const shared = new DOMParser().parseFromString(decoder.decode(files.get('xl/sharedStrings.xml') || new Uint8Array()), 'text/xml'); const strings = Array.from(shared.querySelectorAll('si')).map((node) => node.textContent || ''); const sheet = new DOMParser().parseFromString(decoder.decode(files.get('xl/worksheets/sheet1.xml') || new Uint8Array()), 'text/xml'); const rows: string[][] = []
  sheet.querySelectorAll('row').forEach((row) => { const values: string[] = []; row.querySelectorAll('c').forEach((cell) => { const ref = cell.getAttribute('r') || 'A1'; const column = ref.replace(/\d/g, '').split('').reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1; const value = xmlText(cell.querySelector('v') || undefined); values[column] = cell.getAttribute('t') === 's' ? strings[Number(value)] || '' : value }); rows.push(values) })
  const headers = (rows.shift() || []).map((value) => value.trim().toLowerCase())
  return rows.filter((row) => row.some(Boolean)).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] || ''])))
}
async function readRows(file: File) { return file.name.toLowerCase().endsWith('.xlsx') ? parseXlsx(file) : parseCsv(await file.text()) }
function pickFile(event: Event, target: 'question' | 'participant') { const file = (event.target as HTMLInputElement).files?.[0] || null; if (target === 'question') questionFile.value = file; else participantFile.value = file }
function questionPayload(value: Record<string, unknown>): QuestionForm { return { ...freshQuestion(), title: String(value.title || value['题目名称'] || ''), statement: String(value.statement || value['题干描述'] || ''), max_score: Number(value.max_score || value['满分'] || 100), time_limit_ms: Number(value.time_limit_ms || value['时间限制(ms)'] || 1000), memory_limit_mb: Number(value.memory_limit_mb || value['内存限制(mb)'] || 64), language: value.language === 'C' ? 'C' : 'C++', template_code: String(value.template_code || ''), sample_cases: Array.isArray(value.sample_cases) ? value.sample_cases as TestCase[] : [], test_cases: Array.isArray(value.test_cases) ? value.test_cases as TestCase[] : [] } }
async function importQuestions() {
  if (!questionFile.value) { notify('请选择 JSON、CSV 或 ZIP 题库文件。'); return }
  try {
    let raw = ''
    if (questionFile.value.name.toLowerCase().endsWith('.zip')) { const entries = await unzipEntries(questionFile.value); raw = new TextDecoder().decode([...entries.entries()].find(([name]) => name.toLowerCase().endsWith('.json'))?.[1]); if (!raw) throw new Error('ZIP 中未找到 JSON 文件') } else raw = await questionFile.value.text()
    const records = questionFile.value.name.toLowerCase().endsWith('.csv') ? parseCsv(raw) : JSON.parse(raw); const list = Array.isArray(records) ? records : records.questions
    if (!Array.isArray(list) || !list.length) throw new Error('未发现题目记录')
    await Promise.all(list.map((item) => axios.post(`/api/v1/teacher/exams/${selected.value}/questions`, questionPayload(item))))
    questionImportModal.value = false; questionFile.value = null; await loadResources(); notify(`已导入 ${list.length} 道题目。`)
  } catch (error) { notify(error instanceof Error ? error.message : apiError(error, '题目导入失败。')) }
}
async function importParticipants() {
  if (!participantFile.value) { notify('请选择学生名单 Excel 或 CSV 文件。'); return }
  try {
    const rows = await readRows(participantFile.value); const students = rows.map((row) => ({ student_id: String(row.student_id || row['学号'] || ''), name: String(row.name || row['姓名'] || ''), class_name: String(row.class_name || row['所属班级'] || '') })).filter((student) => student.student_id && student.name)
    if (!students.length) throw new Error('名单中未找到“学号、姓名、所属班级”记录。')
    const { data } = await axios.post(`/api/v1/teacher/exams/${selected.value}/participants/import`, { students })
    participantImportModal.value = false; participantFile.value = null; await loadResources(); notify(`名单导入完成：本次新增 ${data.added ?? students.length} 名学生。`)
  } catch (error) { notify(error instanceof Error ? error.message : apiError(error, '学生名单导入失败。')) }
}
function configurePrivileges(student: Participant) { privilegeStudent.value = student; privilegeForm.value = { extra_minutes: student.extra_minutes, ip_exempt: student.ip_exempt }; privilegeModal.value = true }
async function savePrivileges() {
  if (!privilegeStudent.value || privilegeForm.value.extra_minutes < 0) { notify('延时分钟数不能小于 0。'); return }
  try { await axios.put(`/api/v1/teacher/exams/${selected.value}/participants/${privilegeStudent.value.id}`, privilegeForm.value); privilegeModal.value = false; await loadResources(); notify('考生特权已保存。') } catch (error) { notify(apiError(error, '特权保存失败。')) }
}
function downloadQuestionTemplate() { downloadText('labproctor-question-template.json', JSON.stringify([{ title: '两数之和', statement: '读入两个整数并输出它们的和。', max_score: 100, time_limit_ms: 1000, memory_limit_mb: 64, language: 'C++', template_code: '// === STUDENT_CODE_START ===\n\n// === STUDENT_CODE_END ===', sample_cases: [{ input: '2 3\\n', output: '5\\n' }], test_cases: [{ input: '10 20\\n', output: '30\\n' }] }], null, 2), 'application/json;charset=utf-8') }
function downloadStudentTemplate() { downloadText('labproctor-student-template.csv', '学号,姓名,所属班级\n20240004,张三,计算机2401\n', 'text/csv;charset=utf-8') }
</script>

<template>
  <main class="dashboard">
    <header class="topbar">
      <div><p class="eyebrow">LABPROCTOR / TEACHER</p><h1>教师考务中心</h1><p class="subtitle">围绕一场考试完成监控、题目配置与考生范围管理。</p></div>
      <div class="identity">教师：{{ identity }} <button class="text-button" @click="logout">退出登录</button></div>
    </header>

    <section class="exam-bar"><label>当前考试<select v-model="selected"><option v-for="exam in exams" :key="exam.id" :value="exam.id">{{ exam.title }} · {{ labelForStatus(exam.status) }}</option></select></label><div class="exam-actions"><button class="secondary" @click="openCreateExam">＋ 创建新考试</button><button class="secondary" @click="openEditExam">⚙️ 修改考试设置与时间</button><button v-if="selectedExam?.status === 'draft'" class="secondary" @click="publishExam">🚀 发布考试</button><button v-if="canEditExam" class="primary" @click="startExam">▶️ 立即开始考试</button></div><span v-if="loading" class="loading">正在同步数据…</span></section>
    <section v-if="selectedExam" class="schedule-card"><div><span>考场状态</span><strong :class="['status-pill', selectedExam.status]">{{ statusLabel }}</strong></div><div><span>开始时间</span><strong>{{ formattedStart }}</strong></div><div><span>截止时间</span><strong>{{ formattedEnd }}</strong></div><div><span>机房 IP 白名单</span><strong>{{ whitelist }}</strong></div><div><span>人工复核</span><strong>{{ selectedExam.manual_review ? '已开启' : '未开启' }}</strong></div></section>
    <nav class="tabs" aria-label="教师考务模块"><button v-for="tab in tabs" :key="tab.id" :class="{ active: activeTab === tab.id }" @click="activeTab = tab.id">{{ tab.label }}</button></nav>

    <section v-if="activeTab === 'monitor'" class="panel monitor">
      <div class="section-title"><div><p class="eyebrow">01 / LIVE & ARCHIVE</p><h2>考务监控与成绩归档</h2></div><span class="exam-chip">{{ examTitle }}</span></div>
      <div class="quick-actions"><RouterLink class="primary" :to="`/teacher/exams/${selected}/proctor`">🖥️ 进入实时监考大屏</RouterLink><RouterLink class="secondary" :to="`/teacher/exams/${selected}/review`">📝 进入人工阅卷复核</RouterLink><button class="secondary" @click="download('sources.zip')">📥 导出学生纯源码 <small>ZIP，不含模板</small></button><button class="secondary" @click="download('grades.xlsx')">📊 导出全场成绩单 <small>Excel</small></button><button class="secondary" @click="download('screen-logs.xlsx')">📋 导出切屏作弊明细 <small>Excel</small></button></div>
      <p class="hint">导出文件根据当前选择的考试生成；人工调整成绩后可重新导出成绩单。</p>
    </section>

    <section v-if="activeTab === 'questions'" class="panel">
      <div class="section-title"><div><p class="eyebrow">02 / QUESTION BANK</p><h2>题目管理与导入</h2></div><div class="toolbar"><button class="secondary" @click="questionImportModal = true">📥 批量导入题目</button><button class="primary" @click="openNewQuestion">＋ 手动新增单题</button></div></div>
      <div class="table-wrap"><table><thead><tr><th>题号</th><th>名称</th><th>满分</th><th>时空限制</th><th>模板</th><th>操作</th></tr></thead><tbody><tr v-if="!questions.length"><td colspan="6" class="empty">尚未配置题目，可新增或批量导入。</td></tr><tr v-for="question in questions" :key="question.id"><td>{{ question.ordinal }}</td><td><strong>{{ question.title }}</strong><small>{{ question.statement }}</small></td><td>{{ question.max_score }}</td><td>{{ question.time_limit_ms }} ms / {{ question.memory_limit_mb }} MB</td><td><span :class="['badge', question.has_template ? 'yes' : 'no']">{{ question.has_template ? '有模板' : '无模板' }}</span></td><td class="row-actions"><button @click="previewQuestion = question">查看预览</button><button @click="editQuestion(question)">编辑</button><button class="danger-text" @click="deleteQuestion(question)">删除</button></td></tr></tbody></table></div>
    </section>

    <section v-if="activeTab === 'participants'" class="panel">
      <div class="section-title"><div><p class="eyebrow">03 / ACCESS CONTROL</p><h2>考生范围与名单管理</h2></div><button class="primary" @click="participantImportModal = true">📥 批量导入学生名单</button></div>
      <div class="table-wrap"><table><thead><tr><th>学号</th><th>姓名</th><th>所属班级</th><th>个人延时</th><th>IP 豁免</th><th>操作</th></tr></thead><tbody><tr v-if="!participants.length"><td colspan="6" class="empty">当前考试暂无考生名单。</td></tr><tr v-for="student in participants" :key="student.id"><td>{{ student.student_id }}</td><td><strong>{{ student.name }}</strong></td><td>{{ student.class_name || '-' }}</td><td>{{ student.extra_minutes ? `${student.extra_minutes} 分钟` : '-' }}</td><td><span :class="['badge', student.ip_exempt ? 'yes' : 'no']">{{ student.ip_exempt ? '已豁免' : '未豁免' }}</span></td><td class="row-actions"><button @click="configurePrivileges(student)">配置考生特权</button></td></tr></tbody></table></div>
    </section>

    <div v-if="toast" class="toast" role="status">{{ toast }}</div>

    <div v-if="questionModal" class="modal-backdrop" @click.self="questionModal = false"><form class="modal question-form" @submit.prevent="saveQuestion"><header><div><p class="eyebrow">QUESTION EDITOR</p><h2>{{ editingQuestion ? '编辑题目' : '手动新增单题' }}</h2></div><button type="button" class="close" @click="questionModal = false">×</button></header><div class="form-grid"><label>题目名称<input v-model.trim="questionForm.title" required maxlength="255"></label><label>编程语言<select v-model="questionForm.language"><option>C++</option><option>C</option></select></label><label>满分<input v-model.number="questionForm.max_score" type="number" min="1" required></label><label>时间限制（ms）<input v-model.number="questionForm.time_limit_ms" type="number" min="1" required></label><label>内存限制（MB）<input v-model.number="questionForm.memory_limit_mb" type="number" min="1" required></label></div><label>题干描述<textarea v-model="questionForm.statement" required rows="5"></textarea></label><label>模板框架代码 <small>请保留学生代码占位标记。</small><textarea v-model="questionForm.template_code" class="code" rows="7" placeholder="// === STUDENT_CODE_START ==="></textarea></label><div class="case-grid"><label>样例输入<textarea v-model="questionForm.sample_cases[0].input" rows="3"></textarea></label><label>样例输出<textarea v-model="questionForm.sample_cases[0].output" rows="3"></textarea></label><label>正式用例输入<textarea v-model="questionForm.test_cases[0].input" rows="3"></textarea></label><label>正式用例输出<textarea v-model="questionForm.test_cases[0].output" rows="3"></textarea></label></div><footer><button type="button" class="secondary" @click="questionModal = false">取消</button><button type="submit" class="primary">保存题目</button></footer></form></div>

    <div v-if="questionImportModal" class="modal-backdrop" @click.self="questionImportModal = false"><section class="modal compact"><header><div><p class="eyebrow">BULK IMPORT</p><h2>批量导入题目</h2></div><button class="close" @click="questionImportModal = false">×</button></header><p>支持 JSON、CSV，或包含 JSON 文件的 ZIP。导入格式请使用系统模板。</p><input type="file" accept=".json,.csv,.zip" @change="pickFile($event, 'question')"><p v-if="questionFile" class="file-name">{{ questionFile.name }}</p><a href="#" @click.prevent="downloadQuestionTemplate">下载系统标准题目导入模板</a><footer><button class="secondary" @click="questionImportModal = false">取消</button><button class="primary" @click="importQuestions">开始导入</button></footer></section></div>

    <div v-if="participantImportModal" class="modal-backdrop" @click.self="participantImportModal = false"><section class="modal compact"><header><div><p class="eyebrow">ROSTER IMPORT</p><h2>批量导入学生名单</h2></div><button class="close" @click="participantImportModal = false">×</button></header><p>支持 Excel（.xlsx）或 CSV，字段为：学号、姓名、所属班级。</p><input type="file" accept=".xlsx,.csv" @change="pickFile($event, 'participant')"><p v-if="participantFile" class="file-name">{{ participantFile.name }}</p><a href="#" @click.prevent="downloadStudentTemplate">下载学生名单导入模板</a><footer><button class="secondary" @click="participantImportModal = false">取消</button><button class="primary" @click="importParticipants">导入并刷新名单</button></footer></section></div>

    <div v-if="privilegeModal" class="modal-backdrop" @click.self="privilegeModal = false"><form class="modal compact" @submit.prevent="savePrivileges"><header><div><p class="eyebrow">CANDIDATE PRIVILEGE</p><h2>配置考生特权</h2></div><button type="button" class="close" @click="privilegeModal = false">×</button></header><p v-if="privilegeStudent"><strong>{{ privilegeStudent.name }}</strong> · {{ privilegeStudent.student_id }}</p><label>个人考试延时（分钟）<input v-model.number="privilegeForm.extra_minutes" type="number" min="0" required></label><label class="toggle"><input v-model="privilegeForm.ip_exempt" type="checkbox"> 机房 IP 豁免</label><footer><button type="button" class="secondary" @click="privilegeModal = false">取消</button><button type="submit" class="primary">保存配置</button></footer></form></div>

    <div v-if="previewQuestion" class="modal-backdrop" @click.self="previewQuestion = null">
      <section class="modal preview">
        <header>
          <div><p class="eyebrow">QUESTION PREVIEW</p><h2>{{ previewQuestion.title }}</h2></div>
          <button type="button" class="close" @click="previewQuestion = null">×</button>
        </header>
        <dl>
          <dt>题号 / 满分</dt><dd>{{ previewQuestion.ordinal }} / {{ previewQuestion.max_score }}</dd>
          <dt>时空限制</dt><dd>{{ previewQuestion.time_limit_ms }} ms / {{ previewQuestion.memory_limit_mb }} MB</dd>
        </dl>
        <p class="statement">{{ previewQuestion.statement }}</p>
        <pre v-if="previewQuestion.template_code">{{ previewQuestion.template_code }}</pre>
        <footer><button type="button" class="primary" @click="previewQuestion = null">关闭预览</button></footer>
      </section>
    </div>

    <div v-if="examModal" class="modal-backdrop" @click.self="examModal = false">
      <form class="modal compact" @submit.prevent="saveExam">
        <header>
          <div><p class="eyebrow">EXAM SCHEDULING</p><h2>{{ editingExam ? '修改考试设置与时间' : '创建新考试' }}</h2></div>
          <button type="button" class="close" @click="examModal = false">×</button>
        </header>
        <label>考试名称<input v-model.trim="examForm.title" required maxlength="255" placeholder="例如：2026 秋季程序设计考试"></label>
        <label>开始时间<input v-model="examForm.start_time" type="datetime-local" required></label>
        <label>截止时间<input v-model="examForm.end_time" type="datetime-local" required></label>
        <label>
          机房 IP CIDR 白名单
          <small>每行一个网段，也支持逗号分隔。</small>
          <textarea v-model="examForm.ip_whitelist" rows="4" placeholder="192.168.0.0/16&#10;127.0.0.1/32"></textarea>
        </label>
        <label class="toggle"><input v-model="examForm.manual_review" type="checkbox"> 开启人工复核</label>
        <footer>
          <button type="button" class="secondary" @click="examModal = false">取消</button>
          <button type="submit" class="primary">保存考试设置</button>
        </footer>
      </form>
    </div>
  </main>
</template>

<style scoped>
:global(*){box-sizing:border-box}.dashboard{min-height:100vh;padding:38px clamp(18px,5vw,76px) 70px;background:radial-gradient(circle at 94% 3%,#d7f5ea 0,transparent 25rem),linear-gradient(140deg,#f8f5ed,#eef5f1);color:#172a25;font:15px/1.5 Georgia,"Noto Serif SC",serif}.topbar,.section-title,.exam-bar,header,footer{display:flex;align-items:center;justify-content:space-between;gap:18px}.topbar{margin-bottom:25px}.topbar h1,h2{margin:0;font-family:Georgia,"Noto Serif SC",serif}.topbar h1{font-size:clamp(28px,4vw,43px);letter-spacing:-.04em}.subtitle{margin:5px 0 0;color:#60716b}.eyebrow{margin:0 0 4px;color:#17735d;font:700 11px/1.2 ui-monospace,monospace;letter-spacing:.12em}.identity{padding:10px 13px;border:1px solid #c8d7cf;border-radius:99px;background:#ffffffaa;white-space:nowrap}.text-button,.row-actions button,a{border:0;background:none;color:#176f59;text-decoration:underline;cursor:pointer;font:inherit}.exam-bar{padding:16px 20px;border:1px solid #cddbd2;background:#fffdf8;border-radius:13px;box-shadow:0 10px 30px #153d2810;flex-wrap:wrap}.exam-bar label{display:flex;align-items:center;gap:11px;font-weight:700}.exam-actions{display:flex;gap:8px;flex-wrap:wrap}.loading{color:#17735d}.schedule-card{display:grid;grid-template-columns:repeat(5,1fr);gap:1px;margin-top:10px;background:#cfddd4;border:1px solid #cfddd4;border-radius:11px;overflow:hidden}.schedule-card>div{display:flex;min-height:80px;padding:13px 15px;flex-direction:column;justify-content:center;background:#fffdf8}.schedule-card span{font-size:12px;color:#6d7e75}.schedule-card strong{margin-top:5px;font-size:14px;word-break:break-word}.status-pill{width:max-content;padding:4px 9px;border-radius:99px;background:#e8eee9;color:#456057}.status-pill.draft{background:#f3eee1;color:#86651e}.status-pill.running{background:#dcf4e9;color:#08724f}.tabs{display:flex;gap:4px;margin:26px 0 0;border-bottom:1px solid #cbd9d0}.tabs button{padding:12px 17px;border:0;background:transparent;color:#50645c;font:700 14px Georgia,"Noto Serif SC",serif;cursor:pointer}.tabs .active{border-bottom:3px solid #13765e;color:#0f4e3f}.panel{padding:28px 0}.section-title h2{font-size:27px}.toolbar,.quick-actions,.row-actions{display:flex;flex-wrap:wrap;gap:9px}.exam-chip,.badge{display:inline-block;border-radius:99px;padding:4px 9px;font-size:12px}.exam-chip{background:#e1f2ea;color:#12624e}.primary,.secondary{border-radius:7px;padding:11px 15px;border:1px solid #176f59;background:#176f59;color:#fff;text-decoration:none;cursor:pointer;font:700 14px Georgia,"Noto Serif SC",serif}.secondary{background:#fffdf8;color:#176f59;border-color:#a9c6b9}.quick-actions{display:grid;grid-template-columns:repeat(auto-fit,minmax(205px,1fr));margin-top:22px}.quick-actions>*{min-height:84px;display:flex;align-items:center;justify-content:center;text-align:center;flex-direction:column}.quick-actions small{font-weight:400;opacity:.78}.hint{color:#62736c}.table-wrap{overflow:auto;border:1px solid #cddbd2;border-radius:10px;background:#fffdf8}table{width:100%;border-collapse:collapse;min-width:710px}th,td{padding:13px 15px;border-bottom:1px solid #e1e8e3;text-align:left;vertical-align:top}th{background:#eff7f2;color:#3c5a4e;font-size:12px;letter-spacing:.04em}td small{display:block;max-width:330px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#718078}.empty{text-align:center;padding:35px;color:#697a72}.badge.yes{background:#dcf4e9;color:#08724f}.badge.no{background:#f1f0eb;color:#68736e}.danger-text{color:#b32828}.toast{position:fixed;right:25px;bottom:25px;z-index:20;max-width:min(400px,calc(100vw - 50px));padding:13px 17px;border-radius:8px;background:#143a2f;color:#fff;box-shadow:0 12px 30px #0003}.modal-backdrop{position:fixed;inset:0;z-index:10;display:grid;place-items:center;padding:18px;background:#10271fcc}.modal{width:min(800px,100%);max-height:92vh;overflow:auto;padding:25px;border-radius:13px;background:#fffdf8;box-shadow:0 25px 80px #0006}.modal.compact{width:min(510px,100%)}.modal header{margin-bottom:18px}.modal h2{font-size:25px}.close{border:0;background:none;color:#557066;font-size:29px;line-height:1;cursor:pointer}.modal p{color:#52665d}.modal label{display:grid;gap:6px;margin:14px 0;font-weight:700}.modal input:not([type=checkbox]),.modal select,.modal textarea{width:100%;padding:9px 10px;border:1px solid #b8c9c0;border-radius:6px;background:#fff;font:14px Georgia,"Noto Serif SC",serif}.modal textarea{resize:vertical}.form-grid,.case-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 16px}.form-grid label{margin-top:0}.code,pre{font:13px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace}.toggle{display:flex!important;align-items:center;gap:8px}.modal footer{margin-top:23px;justify-content:flex-end}.modal a{color:#08755a;font-weight:700}.file-name{padding:8px;background:#eef7f1;border-radius:5px}.preview dl{display:grid;grid-template-columns:130px 1fr;gap:5px}.preview dt{font-weight:700}.preview dd{margin:0}.statement{white-space:pre-wrap}.preview pre{padding:13px;overflow:auto;background:#142b23;color:#d7f0e2;border-radius:7px}@media(max-width:650px){.dashboard{padding:25px 16px}.topbar,.section-title{align-items:flex-start;flex-direction:column}.identity{white-space:normal}.tabs{overflow:auto}.tabs button{white-space:nowrap}.toolbar{width:100%}.toolbar button{flex:1}.form-grid,.case-grid{grid-template-columns:1fr}.quick-actions{grid-template-columns:1fr}.schedule-card{grid-template-columns:1fr}.modal{padding:19px}.exam-bar label{align-items:flex-start;flex-direction:column}.exam-bar select{max-width:100%}}
</style>
