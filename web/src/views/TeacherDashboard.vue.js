import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
const router = useRouter();
const identity = localStorage.getItem('username') || '教师';
const fallbackExam = '10000000-0000-0000-0000-000000000001';
const tabs = [{ id: 'monitor', label: '考务监控与成绩归档' }, { id: 'questions', label: '题目管理与导入' }, { id: 'participants', label: '考生范围与名单管理' }];
const activeTab = ref('monitor');
const exams = ref([]);
const selected = ref(fallbackExam);
const questions = ref([]);
const participants = ref([]);
const loading = ref(false);
const toast = ref('');
const questionModal = ref(false);
const questionImportModal = ref(false);
const participantImportModal = ref(false);
const privilegeModal = ref(false);
const examModal = ref(false);
const editingExam = ref(null);
const examForm = ref({ title: '', start_time: '', end_time: '', ip_whitelist: '127.0.0.1/32\n192.168.0.0/16', manual_review: false });
const previewQuestion = ref(null);
const editingQuestion = ref(null);
const privilegeStudent = ref(null);
const questionFile = ref(null);
const participantFile = ref(null);
const freshQuestion = () => ({ title: '', statement: '', max_score: 100, time_limit_ms: 1000, memory_limit_mb: 64, language: 'C++', template_code: '// === STUDENT_CODE_START ===\n\n// === STUDENT_CODE_END ===', sample_cases: [{ input: '', output: '' }], test_cases: [{ input: '', output: '' }] });
const questionForm = ref(freshQuestion());
const privilegeForm = ref({ extra_minutes: 0, ip_exempt: false });
const selectedExam = computed(() => exams.value.find((exam) => exam.id === selected.value) || null);
const examTitle = computed(() => selectedExam.value?.title || '当前考试');
function labelForStatus(status) { return ({ draft: '草稿', published: '待开始', pending: '待开始', running: '进行中', ongoing: '进行中', closed: '已结束', ended: '已结束', archived: '已结束' }[status || 'draft'] || status || '草稿'); }
const statusLabel = computed(() => labelForStatus(selectedExam.value?.status));
const canEditExam = computed(() => { const status = selectedExam.value?.status || ''; const beforeStart = !selectedExam.value?.start_time || Date.now() < Date.parse(selectedExam.value.start_time); return ['draft', 'published', 'pending'].includes(status) && beforeStart; });
const formattedStart = computed(() => formatDate(selectedExam.value?.start_time));
const formattedEnd = computed(() => formatDate(selectedExam.value?.end_time));
const whitelist = computed(() => selectedExam.value?.ip_whitelist?.join(', ') || '未配置');
function formatDate(value) { return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-') : '—'; }
function toLocalInput(value) { if (!value)
    return ''; const date = new Date(value); const pad = (part) => String(part).padStart(2, '0'); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`; }
function notify(message) { toast.value = message; window.setTimeout(() => { if (toast.value === message)
    toast.value = ''; }, 3500); }
function apiError(error, fallback) { return axios.isAxiosError(error) ? error.response?.data?.error || fallback : fallback; }
function logout() { localStorage.clear(); router.replace('/login'); }
function download(path) { window.open(`/api/v1/teacher/exams/${selected.value}/exports/${path}`, '_blank', 'noopener'); }
function downloadText(name, content, type = 'text/plain;charset=utf-8') { const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([content], { type })); link.download = name; link.click(); URL.revokeObjectURL(link.href); }
async function loadExams() {
    try {
        const { data } = await axios.get('/api/v1/teacher/exams');
        exams.value = data.length ? data : [{ id: fallbackExam, title: 'LabProctor 模拟考试', status: '进行中' }];
        if (!exams.value.some((exam) => exam.id === selected.value))
            selected.value = exams.value[0].id;
    }
    catch {
        exams.value = [{ id: fallbackExam, title: 'LabProctor 模拟考试', status: '进行中' }];
    }
}
function openCreateExam() { editingExam.value = null; examForm.value = { title: '', start_time: '', end_time: '', ip_whitelist: '127.0.0.1/32\n192.168.0.0/16', manual_review: false }; examModal.value = true; }
function openEditExam() { if (!canEditExam.value) {
    notify('考试已启动，核心时间与白名单已锁定禁止修改');
    return;
} ; if (!selectedExam.value)
    return; editingExam.value = selectedExam.value; examForm.value = { title: selectedExam.value.title, start_time: toLocalInput(selectedExam.value.start_time), end_time: toLocalInput(selectedExam.value.end_time), ip_whitelist: (selectedExam.value.ip_whitelist || []).join('\n'), manual_review: Boolean(selectedExam.value.manual_review) }; examModal.value = true; }
function validExamForm() { return examForm.value.title.trim() && examForm.value.start_time && examForm.value.end_time && new Date(examForm.value.start_time) < new Date(examForm.value.end_time); }
async function saveExam() { if (!validExamForm()) {
    notify('请填写考试名称，并确保开始时间早于截止时间。');
    return;
} ; const ips = examForm.value.ip_whitelist.split(/[\s,]+/).map((ip) => ip.trim()).filter(Boolean); try {
    const payload = { title: examForm.value.title.trim(), start_time: new Date(examForm.value.start_time).toISOString(), end_time: new Date(examForm.value.end_time).toISOString(), ip_whitelist: ips, manual_review: examForm.value.manual_review };
    if (editingExam.value)
        await axios.put(`/api/v1/teacher/exams/${editingExam.value.id}`, payload);
    else
        await axios.post('/api/v1/teacher/exams', payload);
    examModal.value = false;
    await loadExams();
    notify(editingExam.value ? '考试设置已保存。' : '考试创建成功。');
}
catch (error) {
    notify(apiError(error, '考试设置保存失败。'));
} }
async function startExam() { if (!selectedExam.value || !canEditExam.value)
    return; if (!window.confirm('立即开始考试？开始后核心时间与白名单将锁定。'))
    return; try {
    await axios.post(`/api/v1/teacher/exams/${selected.value}/start`);
    await loadExams();
    notify('考试已开始，考生可进入答题。');
}
catch (error) {
    notify(apiError(error, '考试启动失败。'));
} }
async function publishExam() { if (!selectedExam.value || selectedExam.value.status !== 'draft')
    return; try {
    await axios.post(`/api/v1/teacher/exams/${selected.value}/publish`);
    await loadExams();
    notify('考试已发布为待开始状态。');
}
catch (error) {
    notify(apiError(error, '考试发布失败。'));
} }
async function loadResources() {
    loading.value = true;
    try {
        const [questionResponse, participantResponse] = await Promise.all([
            axios.get(`/api/v1/teacher/exams/${selected.value}/questions`),
            axios.get(`/api/v1/teacher/exams/${selected.value}/participants`),
        ]);
        questions.value = questionResponse.data;
        participants.value = participantResponse.data;
    }
    catch (error) {
        notify(apiError(error, '无法加载考务数据，请检查后端连接。'));
    }
    finally {
        loading.value = false;
    }
}
onMounted(async () => { await loadExams(); await loadResources(); });
watch(selected, loadResources);
function openNewQuestion() { editingQuestion.value = null; questionForm.value = freshQuestion(); questionModal.value = true; }
function editQuestion(question) {
    editingQuestion.value = question;
    questionForm.value = { title: question.title, statement: question.statement, max_score: question.max_score, time_limit_ms: question.time_limit_ms, memory_limit_mb: question.memory_limit_mb, language: 'C++', template_code: question.template_code, sample_cases: question.sample_cases?.length ? question.sample_cases : [{ input: '', output: '' }], test_cases: question.test_cases?.length ? question.test_cases : [{ input: '', output: '' }] };
    questionModal.value = true;
}
function validQuestion() { const value = questionForm.value; return value.title.trim() && value.statement.trim() && value.max_score > 0 && value.time_limit_ms > 0 && value.memory_limit_mb > 0; }
function addCase(kind) { questionForm.value[kind].push({ input: '', output: '' }); }
function removeCase(kind, index) { if (questionForm.value[kind].length > 1)
    questionForm.value[kind].splice(index, 1); }
async function saveQuestion() {
    if (!validQuestion()) {
        notify('请完整填写题目名称、题干和正数限制。');
        return;
    }
    try {
        const path = `/api/v1/teacher/exams/${selected.value}/questions${editingQuestion.value ? `/${editingQuestion.value.id}` : ''}`;
        await axios({ method: editingQuestion.value ? 'put' : 'post', url: path, data: questionForm.value });
        questionModal.value = false;
        await loadResources();
        notify(editingQuestion.value ? '题目已更新。' : '题目已新增。');
    }
    catch (error) {
        notify(apiError(error, '题目保存失败。'));
    }
}
async function deleteQuestion(question) {
    if (!window.confirm(`确定删除题目“${question.title}”？相关测试用例也会删除。`))
        return;
    try {
        await axios.delete(`/api/v1/teacher/exams/${selected.value}/questions/${question.id}`);
        await loadResources();
        notify('题目已删除。');
    }
    catch (error) {
        notify(apiError(error, '题目删除失败。'));
    }
}
function parseCsv(text) {
    const rows = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean).map((line) => line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, '')));
    const headers = rows.shift()?.map((header) => header.toLowerCase()) || [];
    return rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] || ''])));
}
function xmlText(node) { return node?.textContent || ''; }
async function unzipEntries(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const view = new DataView(bytes.buffer);
    const entries = new Map();
    for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
        if (view.getUint32(offset, true) !== 0x06054b50)
            continue;
        const count = view.getUint16(offset + 10, true);
        let cursor = view.getUint32(offset + 16, true);
        for (let index = 0; index < count; index++) {
            if (view.getUint32(cursor, true) !== 0x02014b50)
                break;
            const method = view.getUint16(cursor + 10, true);
            const compressedSize = view.getUint32(cursor + 20, true);
            const nameLength = view.getUint16(cursor + 28, true);
            const extraLength = view.getUint16(cursor + 30, true);
            const commentLength = view.getUint16(cursor + 32, true);
            const localOffset = view.getUint32(cursor + 42, true);
            const name = new TextDecoder().decode(bytes.slice(cursor + 46, cursor + 46 + nameLength));
            const localNameLength = view.getUint16(localOffset + 26, true);
            const localExtraLength = view.getUint16(localOffset + 28, true);
            const data = bytes.slice(localOffset + 30 + localNameLength + localExtraLength, localOffset + 30 + localNameLength + localExtraLength + compressedSize);
            if (method === 0)
                entries.set(name, data);
            if (method === 8 && 'DecompressionStream' in window) {
                const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
                entries.set(name, new Uint8Array(await new Response(stream).arrayBuffer()));
            }
            cursor += 46 + nameLength + extraLength + commentLength;
        }
        break;
    }
    return entries;
}
async function parseXlsx(file) {
    const files = await unzipEntries(file);
    const decoder = new TextDecoder();
    const shared = new DOMParser().parseFromString(decoder.decode(files.get('xl/sharedStrings.xml') || new Uint8Array()), 'text/xml');
    const strings = Array.from(shared.querySelectorAll('si')).map((node) => node.textContent || '');
    const sheet = new DOMParser().parseFromString(decoder.decode(files.get('xl/worksheets/sheet1.xml') || new Uint8Array()), 'text/xml');
    const rows = [];
    sheet.querySelectorAll('row').forEach((row) => { const values = []; row.querySelectorAll('c').forEach((cell) => { const ref = cell.getAttribute('r') || 'A1'; const column = ref.replace(/\d/g, '').split('').reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1; const value = xmlText(cell.querySelector('v') || undefined); values[column] = cell.getAttribute('t') === 's' ? strings[Number(value)] || '' : value; }); rows.push(values); });
    const headers = (rows.shift() || []).map((value) => value.trim().toLowerCase());
    return rows.filter((row) => row.some(Boolean)).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] || ''])));
}
async function readRows(file) { return file.name.toLowerCase().endsWith('.xlsx') ? parseXlsx(file) : parseCsv(await file.text()); }
function pickFile(event, target) { const file = event.target.files?.[0] || null; if (target === 'question')
    questionFile.value = file;
else
    participantFile.value = file; }
function questionPayload(value) { return { ...freshQuestion(), title: String(value.title || value['题目名称'] || ''), statement: String(value.statement || value['题干描述'] || ''), max_score: Number(value.max_score || value['满分'] || 100), time_limit_ms: Number(value.time_limit_ms || value['时间限制(ms)'] || 1000), memory_limit_mb: Number(value.memory_limit_mb || value['内存限制(mb)'] || 64), language: value.language === 'C' ? 'C' : 'C++', template_code: String(value.template_code || ''), sample_cases: Array.isArray(value.sample_cases) ? value.sample_cases : [], test_cases: Array.isArray(value.test_cases) ? value.test_cases : [] }; }
async function importQuestions() {
    if (!questionFile.value) {
        notify('请选择 JSON、CSV 或 ZIP 题库文件。');
        return;
    }
    try {
        let raw = '';
        if (questionFile.value.name.toLowerCase().endsWith('.zip')) {
            const entries = await unzipEntries(questionFile.value);
            raw = new TextDecoder().decode([...entries.entries()].find(([name]) => name.toLowerCase().endsWith('.json'))?.[1]);
            if (!raw)
                throw new Error('ZIP 中未找到 JSON 文件');
        }
        else
            raw = await questionFile.value.text();
        const records = questionFile.value.name.toLowerCase().endsWith('.csv') ? parseCsv(raw) : JSON.parse(raw);
        const list = Array.isArray(records) ? records : records.questions;
        if (!Array.isArray(list) || !list.length)
            throw new Error('未发现题目记录');
        await Promise.all(list.map((item) => axios.post(`/api/v1/teacher/exams/${selected.value}/questions`, questionPayload(item))));
        questionImportModal.value = false;
        questionFile.value = null;
        await loadResources();
        notify(`已导入 ${list.length} 道题目。`);
    }
    catch (error) {
        notify(error instanceof Error ? error.message : apiError(error, '题目导入失败。'));
    }
}
async function importParticipants() {
    if (!participantFile.value) {
        notify('请选择学生名单 Excel 或 CSV 文件。');
        return;
    }
    try {
        const rows = await readRows(participantFile.value);
        const students = rows.map((row) => ({ student_id: String(row.student_id || row['学号'] || ''), name: String(row.name || row['姓名'] || ''), class_name: String(row.class_name || row['所属班级'] || '') })).filter((student) => student.student_id && student.name);
        if (!students.length)
            throw new Error('名单中未找到“学号、姓名、所属班级”记录。');
        const { data } = await axios.post(`/api/v1/teacher/exams/${selected.value}/participants/import`, { students });
        participantImportModal.value = false;
        participantFile.value = null;
        await loadResources();
        notify(`名单导入完成：本次新增 ${data.added ?? students.length} 名学生。`);
    }
    catch (error) {
        notify(error instanceof Error ? error.message : apiError(error, '学生名单导入失败。'));
    }
}
function configurePrivileges(student) { privilegeStudent.value = student; privilegeForm.value = { extra_minutes: student.extra_minutes, ip_exempt: student.ip_exempt }; privilegeModal.value = true; }
async function savePrivileges() {
    if (!privilegeStudent.value || privilegeForm.value.extra_minutes < 0) {
        notify('延时分钟数不能小于 0。');
        return;
    }
    try {
        await axios.put(`/api/v1/teacher/exams/${selected.value}/participants/${privilegeStudent.value.id}`, privilegeForm.value);
        privilegeModal.value = false;
        await loadResources();
        notify('考生特权已保存。');
    }
    catch (error) {
        notify(apiError(error, '特权保存失败。'));
    }
}
function downloadQuestionTemplate() { downloadText('labproctor-question-template.json', JSON.stringify([{ title: '两数之和', statement: '读入两个整数并输出它们的和。', max_score: 100, time_limit_ms: 1000, memory_limit_mb: 64, language: 'C++', template_code: '// === STUDENT_CODE_START ===\n\n// === STUDENT_CODE_END ===', sample_cases: [{ input: '2 3\\n', output: '5\\n' }], test_cases: [{ input: '10 20\\n', output: '30\\n' }] }], null, 2), 'application/json;charset=utf-8'); }
function downloadStudentTemplate() { downloadText('labproctor-student-template.csv', '学号,姓名,所属班级\n20240004,张三,计算机2401\n', 'text/csv;charset=utf-8'); }
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['topbar']} */ ;
/** @type {__VLS_StyleScopedClasses['topbar']} */ ;
/** @type {__VLS_StyleScopedClasses['topbar']} */ ;
/** @type {__VLS_StyleScopedClasses['exam-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['exam-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['schedule-card']} */ ;
/** @type {__VLS_StyleScopedClasses['schedule-card']} */ ;
/** @type {__VLS_StyleScopedClasses['schedule-card']} */ ;
/** @type {__VLS_StyleScopedClasses['status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['row-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['exam-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['badge']} */ ;
/** @type {__VLS_StyleScopedClasses['badge']} */ ;
/** @type {__VLS_StyleScopedClasses['modal']} */ ;
/** @type {__VLS_StyleScopedClasses['modal']} */ ;
/** @type {__VLS_StyleScopedClasses['modal']} */ ;
/** @type {__VLS_StyleScopedClasses['modal']} */ ;
/** @type {__VLS_StyleScopedClasses['modal']} */ ;
/** @type {__VLS_StyleScopedClasses['modal']} */ ;
/** @type {__VLS_StyleScopedClasses['modal']} */ ;
/** @type {__VLS_StyleScopedClasses['modal']} */ ;
/** @type {__VLS_StyleScopedClasses['modal']} */ ;
/** @type {__VLS_StyleScopedClasses['form-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['modal']} */ ;
/** @type {__VLS_StyleScopedClasses['modal']} */ ;
/** @type {__VLS_StyleScopedClasses['preview']} */ ;
/** @type {__VLS_StyleScopedClasses['preview']} */ ;
/** @type {__VLS_StyleScopedClasses['preview']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['topbar']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['identity']} */ ;
/** @type {__VLS_StyleScopedClasses['tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['form-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['case-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['schedule-card']} */ ;
/** @type {__VLS_StyleScopedClasses['modal']} */ ;
/** @type {__VLS_StyleScopedClasses['exam-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['exam-bar']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
    ...{ class: "dashboard" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "topbar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "eyebrow" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "subtitle" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "identity" },
});
(__VLS_ctx.identity);
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.logout) },
    ...{ class: "text-button" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "exam-bar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
    value: (__VLS_ctx.selected),
});
for (const [exam] of __VLS_getVForSourceType((__VLS_ctx.exams))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        key: (exam.id),
        value: (exam.id),
    });
    (exam.title);
    (__VLS_ctx.labelForStatus(exam.status));
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "exam-actions" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.openCreateExam) },
    ...{ class: "secondary" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.openEditExam) },
    ...{ class: "secondary" },
});
if (__VLS_ctx.selectedExam?.status === 'draft') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.publishExam) },
        ...{ class: "secondary" },
    });
}
if (__VLS_ctx.canEditExam) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.startExam) },
        ...{ class: "primary" },
    });
}
if (__VLS_ctx.loading) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "loading" },
    });
}
if (__VLS_ctx.selectedExam) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "schedule-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({
        ...{ class: (['status-pill', __VLS_ctx.selectedExam.status]) },
    });
    (__VLS_ctx.statusLabel);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.formattedStart);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.formattedEnd);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.whitelist);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.selectedExam.manual_review ? '已开启' : '未开启');
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.nav, __VLS_intrinsicElements.nav)({
    ...{ class: "tabs" },
    'aria-label': "教师考务模块",
});
for (const [tab] of __VLS_getVForSourceType((__VLS_ctx.tabs))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.activeTab = tab.id;
            } },
        key: (tab.id),
        ...{ class: ({ active: __VLS_ctx.activeTab === tab.id }) },
    });
    (tab.label);
}
if (__VLS_ctx.activeTab === 'monitor') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "panel monitor" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "section-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "exam-chip" },
    });
    (__VLS_ctx.examTitle);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "quick-actions" },
    });
    const __VLS_0 = {}.RouterLink;
    /** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.RouterLink, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        ...{ class: "primary" },
        to: (`/teacher/exams/${__VLS_ctx.selected}/proctor`),
    }));
    const __VLS_2 = __VLS_1({
        ...{ class: "primary" },
        to: (`/teacher/exams/${__VLS_ctx.selected}/proctor`),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_3.slots.default;
    var __VLS_3;
    const __VLS_4 = {}.RouterLink;
    /** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.RouterLink, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        ...{ class: "secondary" },
        to: (`/teacher/exams/${__VLS_ctx.selected}/review`),
    }));
    const __VLS_6 = __VLS_5({
        ...{ class: "secondary" },
        to: (`/teacher/exams/${__VLS_ctx.selected}/review`),
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
    __VLS_7.slots.default;
    var __VLS_7;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.activeTab === 'monitor'))
                    return;
                __VLS_ctx.download('sources.zip');
            } },
        ...{ class: "secondary" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.activeTab === 'monitor'))
                    return;
                __VLS_ctx.download('grades.xlsx');
            } },
        ...{ class: "secondary" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.activeTab === 'monitor'))
                    return;
                __VLS_ctx.download('screen-logs.xlsx');
            } },
        ...{ class: "secondary" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "hint" },
    });
}
if (__VLS_ctx.activeTab === 'questions') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "panel" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "section-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "toolbar" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.activeTab === 'questions'))
                    return;
                __VLS_ctx.questionImportModal = true;
            } },
        ...{ class: "secondary" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.openNewQuestion) },
        ...{ class: "primary" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "table-wrap" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.table, __VLS_intrinsicElements.table)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.thead, __VLS_intrinsicElements.thead)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tbody, __VLS_intrinsicElements.tbody)({});
    if (!__VLS_ctx.questions.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
            colspan: "6",
            ...{ class: "empty" },
        });
    }
    for (const [question] of __VLS_getVForSourceType((__VLS_ctx.questions))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({
            key: (question.id),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        (question.ordinal);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (question.title);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
        (question.statement);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        (question.max_score);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        (question.time_limit_ms);
        (question.memory_limit_mb);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: (['badge', question.has_template ? 'yes' : 'no']) },
        });
        (question.has_template ? '有模板' : '无模板');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
            ...{ class: "row-actions" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.activeTab === 'questions'))
                        return;
                    __VLS_ctx.previewQuestion = question;
                } },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.activeTab === 'questions'))
                        return;
                    __VLS_ctx.editQuestion(question);
                } },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.activeTab === 'questions'))
                        return;
                    __VLS_ctx.deleteQuestion(question);
                } },
            ...{ class: "danger-text" },
        });
    }
}
if (__VLS_ctx.activeTab === 'participants') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "panel" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "section-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.activeTab === 'participants'))
                    return;
                __VLS_ctx.participantImportModal = true;
            } },
        ...{ class: "primary" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "table-wrap" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.table, __VLS_intrinsicElements.table)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.thead, __VLS_intrinsicElements.thead)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tbody, __VLS_intrinsicElements.tbody)({});
    if (!__VLS_ctx.participants.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
            colspan: "6",
            ...{ class: "empty" },
        });
    }
    for (const [student] of __VLS_getVForSourceType((__VLS_ctx.participants))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({
            key: (student.id),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        (student.student_id);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (student.name);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        (student.class_name || '-');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        (student.extra_minutes ? `${student.extra_minutes} 分钟` : '-');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: (['badge', student.ip_exempt ? 'yes' : 'no']) },
        });
        (student.ip_exempt ? '已豁免' : '未豁免');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
            ...{ class: "row-actions" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.activeTab === 'participants'))
                        return;
                    __VLS_ctx.configurePrivileges(student);
                } },
        });
    }
}
if (__VLS_ctx.toast) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "toast" },
        role: "status",
    });
    (__VLS_ctx.toast);
}
if (__VLS_ctx.questionModal) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.questionModal))
                    return;
                __VLS_ctx.questionModal = false;
            } },
        ...{ class: "modal-backdrop" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.form, __VLS_intrinsicElements.form)({
        ...{ onSubmit: (__VLS_ctx.saveQuestion) },
        ...{ class: "modal question-form" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    (__VLS_ctx.editingQuestion ? '编辑题目' : '手动新增单题');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.questionModal))
                    return;
                __VLS_ctx.questionModal = false;
            } },
        type: "button",
        ...{ class: "close" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "form-grid" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input, __VLS_intrinsicElements.input)({
        required: true,
        maxlength: "255",
    });
    (__VLS_ctx.questionForm.title);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
        value: (__VLS_ctx.questionForm.language),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input, __VLS_intrinsicElements.input)({
        type: "number",
        min: "1",
        required: true,
    });
    (__VLS_ctx.questionForm.max_score);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input, __VLS_intrinsicElements.input)({
        type: "number",
        min: "1",
        required: true,
    });
    (__VLS_ctx.questionForm.time_limit_ms);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input, __VLS_intrinsicElements.input)({
        type: "number",
        min: "1",
        required: true,
    });
    (__VLS_ctx.questionForm.memory_limit_mb);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.textarea, __VLS_intrinsicElements.textarea)({
        value: (__VLS_ctx.questionForm.statement),
        required: true,
        rows: "5",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.textarea, __VLS_intrinsicElements.textarea)({
        value: (__VLS_ctx.questionForm.template_code),
        ...{ class: "code" },
        rows: "7",
        placeholder: "// === STUDENT_CODE_START ===",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "case-grid" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.textarea, __VLS_intrinsicElements.textarea)({
        value: (__VLS_ctx.questionForm.sample_cases[0].input),
        rows: "3",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.textarea, __VLS_intrinsicElements.textarea)({
        value: (__VLS_ctx.questionForm.sample_cases[0].output),
        rows: "3",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.textarea, __VLS_intrinsicElements.textarea)({
        value: (__VLS_ctx.questionForm.test_cases[0].input),
        rows: "3",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.textarea, __VLS_intrinsicElements.textarea)({
        value: (__VLS_ctx.questionForm.test_cases[0].output),
        rows: "3",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.footer, __VLS_intrinsicElements.footer)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.questionModal))
                    return;
                __VLS_ctx.questionModal = false;
            } },
        type: "button",
        ...{ class: "secondary" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        type: "submit",
        ...{ class: "primary" },
    });
}
if (__VLS_ctx.questionImportModal) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.questionImportModal))
                    return;
                __VLS_ctx.questionImportModal = false;
            } },
        ...{ class: "modal-backdrop" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "modal compact" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.questionImportModal))
                    return;
                __VLS_ctx.questionImportModal = false;
            } },
        ...{ class: "close" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input, __VLS_intrinsicElements.input)({
        ...{ onChange: (...[$event]) => {
                if (!(__VLS_ctx.questionImportModal))
                    return;
                __VLS_ctx.pickFile($event, 'question');
            } },
        type: "file",
        accept: ".json,.csv,.zip",
    });
    if (__VLS_ctx.questionFile) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "file-name" },
        });
        (__VLS_ctx.questionFile.name);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.a, __VLS_intrinsicElements.a)({
        ...{ onClick: (__VLS_ctx.downloadQuestionTemplate) },
        href: "#",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.footer, __VLS_intrinsicElements.footer)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.questionImportModal))
                    return;
                __VLS_ctx.questionImportModal = false;
            } },
        ...{ class: "secondary" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.importQuestions) },
        ...{ class: "primary" },
    });
}
if (__VLS_ctx.participantImportModal) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.participantImportModal))
                    return;
                __VLS_ctx.participantImportModal = false;
            } },
        ...{ class: "modal-backdrop" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "modal compact" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.participantImportModal))
                    return;
                __VLS_ctx.participantImportModal = false;
            } },
        ...{ class: "close" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input, __VLS_intrinsicElements.input)({
        ...{ onChange: (...[$event]) => {
                if (!(__VLS_ctx.participantImportModal))
                    return;
                __VLS_ctx.pickFile($event, 'participant');
            } },
        type: "file",
        accept: ".xlsx,.csv",
    });
    if (__VLS_ctx.participantFile) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "file-name" },
        });
        (__VLS_ctx.participantFile.name);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.a, __VLS_intrinsicElements.a)({
        ...{ onClick: (__VLS_ctx.downloadStudentTemplate) },
        href: "#",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.footer, __VLS_intrinsicElements.footer)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.participantImportModal))
                    return;
                __VLS_ctx.participantImportModal = false;
            } },
        ...{ class: "secondary" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.importParticipants) },
        ...{ class: "primary" },
    });
}
if (__VLS_ctx.privilegeModal) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.privilegeModal))
                    return;
                __VLS_ctx.privilegeModal = false;
            } },
        ...{ class: "modal-backdrop" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.form, __VLS_intrinsicElements.form)({
        ...{ onSubmit: (__VLS_ctx.savePrivileges) },
        ...{ class: "modal compact" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.privilegeModal))
                    return;
                __VLS_ctx.privilegeModal = false;
            } },
        type: "button",
        ...{ class: "close" },
    });
    if (__VLS_ctx.privilegeStudent) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx.privilegeStudent.name);
        (__VLS_ctx.privilegeStudent.student_id);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input, __VLS_intrinsicElements.input)({
        type: "number",
        min: "0",
        required: true,
    });
    (__VLS_ctx.privilegeForm.extra_minutes);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "toggle" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input, __VLS_intrinsicElements.input)({
        type: "checkbox",
    });
    (__VLS_ctx.privilegeForm.ip_exempt);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.footer, __VLS_intrinsicElements.footer)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.privilegeModal))
                    return;
                __VLS_ctx.privilegeModal = false;
            } },
        type: "button",
        ...{ class: "secondary" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        type: "submit",
        ...{ class: "primary" },
    });
}
if (__VLS_ctx.previewQuestion) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.previewQuestion))
                    return;
                __VLS_ctx.previewQuestion = null;
            } },
        ...{ class: "modal-backdrop" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "modal preview" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    (__VLS_ctx.previewQuestion.title);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.previewQuestion))
                    return;
                __VLS_ctx.previewQuestion = null;
            } },
        type: "button",
        ...{ class: "close" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.dl, __VLS_intrinsicElements.dl)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.dt, __VLS_intrinsicElements.dt)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.dd, __VLS_intrinsicElements.dd)({});
    (__VLS_ctx.previewQuestion.ordinal);
    (__VLS_ctx.previewQuestion.max_score);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.dt, __VLS_intrinsicElements.dt)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.dd, __VLS_intrinsicElements.dd)({});
    (__VLS_ctx.previewQuestion.time_limit_ms);
    (__VLS_ctx.previewQuestion.memory_limit_mb);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "statement" },
    });
    (__VLS_ctx.previewQuestion.statement);
    if (__VLS_ctx.previewQuestion.template_code) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.pre, __VLS_intrinsicElements.pre)({});
        (__VLS_ctx.previewQuestion.template_code);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.footer, __VLS_intrinsicElements.footer)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.previewQuestion))
                    return;
                __VLS_ctx.previewQuestion = null;
            } },
        type: "button",
        ...{ class: "primary" },
    });
}
if (__VLS_ctx.examModal) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.examModal))
                    return;
                __VLS_ctx.examModal = false;
            } },
        ...{ class: "modal-backdrop" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.form, __VLS_intrinsicElements.form)({
        ...{ onSubmit: (__VLS_ctx.saveExam) },
        ...{ class: "modal compact" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    (__VLS_ctx.editingExam ? '修改考试设置与时间' : '创建新考试');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.examModal))
                    return;
                __VLS_ctx.examModal = false;
            } },
        type: "button",
        ...{ class: "close" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input, __VLS_intrinsicElements.input)({
        required: true,
        maxlength: "255",
        placeholder: "例如：2026 秋季程序设计考试",
    });
    (__VLS_ctx.examForm.title);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input, __VLS_intrinsicElements.input)({
        type: "datetime-local",
        required: true,
    });
    (__VLS_ctx.examForm.start_time);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input, __VLS_intrinsicElements.input)({
        type: "datetime-local",
        required: true,
    });
    (__VLS_ctx.examForm.end_time);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.textarea, __VLS_intrinsicElements.textarea)({
        value: (__VLS_ctx.examForm.ip_whitelist),
        rows: "4",
        placeholder: "192.168.0.0/16&#10;127.0.0.1/32",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "toggle" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input, __VLS_intrinsicElements.input)({
        type: "checkbox",
    });
    (__VLS_ctx.examForm.manual_review);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.footer, __VLS_intrinsicElements.footer)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.examModal))
                    return;
                __VLS_ctx.examModal = false;
            } },
        type: "button",
        ...{ class: "secondary" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        type: "submit",
        ...{ class: "primary" },
    });
}
/** @type {__VLS_StyleScopedClasses['dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['topbar']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['identity']} */ ;
/** @type {__VLS_StyleScopedClasses['text-button']} */ ;
/** @type {__VLS_StyleScopedClasses['exam-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['exam-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
/** @type {__VLS_StyleScopedClasses['loading']} */ ;
/** @type {__VLS_StyleScopedClasses['schedule-card']} */ ;
/** @type {__VLS_StyleScopedClasses['tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['monitor']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['exam-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
/** @type {__VLS_StyleScopedClasses['secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['hint']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
/** @type {__VLS_StyleScopedClasses['table-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['empty']} */ ;
/** @type {__VLS_StyleScopedClasses['row-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['danger-text']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
/** @type {__VLS_StyleScopedClasses['table-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['empty']} */ ;
/** @type {__VLS_StyleScopedClasses['row-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['toast']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-backdrop']} */ ;
/** @type {__VLS_StyleScopedClasses['modal']} */ ;
/** @type {__VLS_StyleScopedClasses['question-form']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['close']} */ ;
/** @type {__VLS_StyleScopedClasses['form-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['code']} */ ;
/** @type {__VLS_StyleScopedClasses['case-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-backdrop']} */ ;
/** @type {__VLS_StyleScopedClasses['modal']} */ ;
/** @type {__VLS_StyleScopedClasses['compact']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['close']} */ ;
/** @type {__VLS_StyleScopedClasses['file-name']} */ ;
/** @type {__VLS_StyleScopedClasses['secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-backdrop']} */ ;
/** @type {__VLS_StyleScopedClasses['modal']} */ ;
/** @type {__VLS_StyleScopedClasses['compact']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['close']} */ ;
/** @type {__VLS_StyleScopedClasses['file-name']} */ ;
/** @type {__VLS_StyleScopedClasses['secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-backdrop']} */ ;
/** @type {__VLS_StyleScopedClasses['modal']} */ ;
/** @type {__VLS_StyleScopedClasses['compact']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['close']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-backdrop']} */ ;
/** @type {__VLS_StyleScopedClasses['modal']} */ ;
/** @type {__VLS_StyleScopedClasses['preview']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['close']} */ ;
/** @type {__VLS_StyleScopedClasses['statement']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-backdrop']} */ ;
/** @type {__VLS_StyleScopedClasses['modal']} */ ;
/** @type {__VLS_StyleScopedClasses['compact']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['close']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            identity: identity,
            tabs: tabs,
            activeTab: activeTab,
            exams: exams,
            selected: selected,
            questions: questions,
            participants: participants,
            loading: loading,
            toast: toast,
            questionModal: questionModal,
            questionImportModal: questionImportModal,
            participantImportModal: participantImportModal,
            privilegeModal: privilegeModal,
            examModal: examModal,
            editingExam: editingExam,
            examForm: examForm,
            previewQuestion: previewQuestion,
            editingQuestion: editingQuestion,
            privilegeStudent: privilegeStudent,
            questionFile: questionFile,
            participantFile: participantFile,
            questionForm: questionForm,
            privilegeForm: privilegeForm,
            selectedExam: selectedExam,
            examTitle: examTitle,
            labelForStatus: labelForStatus,
            statusLabel: statusLabel,
            canEditExam: canEditExam,
            formattedStart: formattedStart,
            formattedEnd: formattedEnd,
            whitelist: whitelist,
            logout: logout,
            download: download,
            openCreateExam: openCreateExam,
            openEditExam: openEditExam,
            saveExam: saveExam,
            startExam: startExam,
            publishExam: publishExam,
            openNewQuestion: openNewQuestion,
            editQuestion: editQuestion,
            saveQuestion: saveQuestion,
            deleteQuestion: deleteQuestion,
            pickFile: pickFile,
            importQuestions: importQuestions,
            importParticipants: importParticipants,
            configurePrivileges: configurePrivileges,
            savePrivileges: savePrivileges,
            downloadQuestionTemplate: downloadQuestionTemplate,
            downloadStudentTemplate: downloadStudentTemplate,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
