import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { onBeforeRouteLeave } from 'vue-router';
import axios from 'axios';
import CodeEditor from '../components/CodeEditor.vue';
import { installAntiCheat } from '../utils/antiCheat';
const route = useRoute();
const router = useRouter();
const examId = computed(() => String(route.params.id || ''));
const identity = localStorage.getItem('username') || '考生';
const noExam = computed(() => examId.value === 'none');
const isWaiting = ref(true);
const switching = ref(false);
const loadingError = ref('');
const exam = ref({});
const questions = ref([]);
const question = ref({ id: '', ordinal: 1, title: '', statement: '' });
const code = ref('');
const version = ref(0);
const saved = ref('尚未保存');
const output = ref('');
const remaining = ref(0);
const candidateId = ref('—');
const candidateName = ref(identity);
const clientIp = ref('正在核验…');
const networkVerified = ref(false);
let clockTimer;
let pollTimer;
let debounce;
let stopCheat;
let loadingQuestions = false;
const waitingCountdown = computed(() => formatDuration(remaining.value));
const examCountdown = computed(() => formatDuration(remaining.value));
const examTitle = computed(() => exam.value.title || 'LabProctor 计算机程序设计上机考试');
const statusText = computed(() => isWaiting.value ? '● 考场等待中 · 统一机考严禁喧哗' : '● 考试进行中 · 全程监控已激活');
function formatDuration(total) { const seconds = Math.max(0, Math.floor(total)); return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
function setClock(payload) { if (payload.start_time)
    remaining.value = Math.max(0, Math.ceil((Date.parse(payload.start_time) - Date.parse(payload.server_time || new Date().toISOString())) / 1000));
else if (typeof payload.remaining_seconds === 'number')
    remaining.value = Math.max(0, payload.remaining_seconds); }
function shouldWait(payload) { const status = String(payload.status || '').toLowerCase(); const beforeStart = payload.start_time ? Date.parse(payload.start_time) > Date.parse(payload.server_time || new Date().toISOString()) : false; return Boolean(payload.waiting) || status === 'pending' || status === 'draft' || beforeStart; }
function applyMeta(payload) { const meta = payload.exam || payload; const student = payload.student || {}; const merged = { ...payload, ...meta }; exam.value = merged; setClock(merged); candidateId.value = student.student_id || payload.student_id || candidateId.value; candidateName.value = student.full_name || payload.student_name || candidateName.value; clientIp.value = student.client_ip || payload.client_ip || clientIp.value; networkVerified.value = student.ip_whitelisted ?? payload.network_verified !== false; }
async function requestStatus() { if (!examId.value) {
    loadingError.value = '缺少考试编号，无法进入考试。';
    return;
} ; try {
    const { data } = await axios.get(`/api/v1/exams/${examId.value}`);
    applyMeta(data);
    if (!shouldWait(data) && isWaiting.value)
        await enterExam(data);
}
catch (error) {
    loadingError.value = error.response?.data?.error || '考试状态暂时无法获取，请稍候。';
} }
async function loadQuestion(next, saveCurrent = true) { if (saveCurrent && question.value.id)
    await save(); switching.value = true; const draft = await axios.get(`/api/v1/exams/${examId.value}/questions/${next.id}/draft`); question.value = next; code.value = draft.data.code || ''; version.value = draft.data.version || 0; saved.value = '草稿已载入'; window.setTimeout(() => { switching.value = false; }, 250); }
async function selectQuestion(next) { if (!isWaiting.value && next.id !== question.value.id) {
    try {
        await loadQuestion(next);
    }
    catch {
        loadingError.value = '题目切换失败，当前草稿仍保留。';
    }
} }
function readonlyRanges() { const text = question.value.editor_code || ''; if (!text)
    return []; const lines = text.split('\n'); const start = lines.findIndex((line) => line.includes('// === STUDENT_CODE_START ===')); const end = lines.findIndex((line) => line.includes('// === STUDENT_CODE_END ===')); if (start < 0 || end <= start)
    return []; return [{ start: start + 1, end: start + 1 }, { start: end + 1, end: end + 1 }]; }
async function enterExam(payload) { if (loadingQuestions)
    return; loadingQuestions = true; switching.value = true; try {
    applyMeta(payload);
    questions.value = payload.questions || [];
    if (!questions.value.length)
        throw new Error('试卷题目尚未发布，请联系监考教师。');
    isWaiting.value = false;
    await loadQuestion(questions.value[0], false);
    loadingError.value = '';
    stopCheat?.();
    stopCheat = installAntiCheat(examId.value);
}
catch (error) {
    loadingError.value = error.message || error.response?.data?.error || '试卷加载失败。';
}
finally {
    loadingQuestions = false;
    window.setTimeout(() => { switching.value = false; }, 250);
} }
async function save() { if (isWaiting.value || !question.value.id)
    return; saved.value = '正在自动保存…'; try {
    const result = await axios.put(`/api/v1/exams/${examId.value}/questions/${question.value.id}/draft`, { code: code.value, version: version.value });
    version.value = result.data.version;
    saved.value = `草稿已同步至云端（版本号：v${version.value}） · ${new Date().toLocaleTimeString()}`;
}
catch {
    saved.value = '草稿保存失败，将在下次自动保存时重试';
} }
watch(code, () => { if (!isWaiting.value) {
    if (debounce)
        window.clearTimeout(debounce);
    debounce = window.setTimeout(save, 2000);
} });
async function sample() { if (!isWaiting.value && question.value.id) {
    const result = await axios.post(`/api/v1/exams/${examId.value}/questions/${question.value.id}/run-sample`, { code: code.value });
    output.value = `执行结果：已加入样例调试队列（${result.data.sample_cases} 个样例）`;
} }
;
async function submit() { if (!isWaiting.value && window.confirm('确定要提交整套试卷吗？交卷后试卷将立即锁定，不可再修改代码或调试，系统将对全卷进行正式机器判题。'))
    await axios.post(`/api/v1/exams/${examId.value}/submit`, { confirm: true }); }
;
function logout() { localStorage.clear(); router.replace('/login'); }
onMounted(async () => { await requestStatus(); clockTimer = window.setInterval(() => { if (remaining.value > 0)
    remaining.value--; if (isWaiting.value && remaining.value === 0)
    requestStatus(); }, 1000); pollTimer = window.setInterval(requestStatus, 5000); });
onBeforeUnmount(() => { stopCheat?.(); if (clockTimer)
    window.clearInterval(clockTimer); if (pollTimer)
    window.clearInterval(pollTimer); if (debounce)
    window.clearTimeout(debounce); });
onBeforeRouteLeave((_to, _from, next) => { if (!isWaiting.value && !window.confirm('⚠️ 您当前正在考试中！离开考场将无法答题并被记录切屏作弊行为，确定要离开吗？')) {
    next(false);
    return;
} ; next(); });
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['no-exam']} */ ;
/** @type {__VLS_StyleScopedClasses['no-exam']} */ ;
/** @type {__VLS_StyleScopedClasses['question-tab']} */ ;
/** @type {__VLS_StyleScopedClasses['waiting-room']} */ ;
/** @type {__VLS_StyleScopedClasses['candidate-card']} */ ;
/** @type {__VLS_StyleScopedClasses['candidate-card']} */ ;
/** @type {__VLS_StyleScopedClasses['candidate-card']} */ ;
/** @type {__VLS_StyleScopedClasses['candidate-card']} */ ;
/** @type {__VLS_StyleScopedClasses['candidate-card']} */ ;
/** @type {__VLS_StyleScopedClasses['rules']} */ ;
/** @type {__VLS_StyleScopedClasses['rules']} */ ;
/** @type {__VLS_StyleScopedClasses['workbench']} */ ;
/** @type {__VLS_StyleScopedClasses['workbench']} */ ;
/** @type {__VLS_StyleScopedClasses['workbench']} */ ;
/** @type {__VLS_StyleScopedClasses['workbench']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['workbench']} */ ;
/** @type {__VLS_StyleScopedClasses['workbench']} */ ;
/** @type {__VLS_StyleScopedClasses['workbench']} */ ;
/** @type {__VLS_StyleScopedClasses['candidate-card']} */ ;
/** @type {__VLS_StyleScopedClasses['workbench']} */ ;
/** @type {__VLS_StyleScopedClasses['workbench']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['countdown']} */ ;
// CSS variable injection 
// CSS variable injection end 
if (__VLS_ctx.noExam) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
        ...{ class: "no-exam" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.logout) },
    });
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
        ...{ class: (['exam-shell', { 'waiting-shell': __VLS_ctx.isWaiting, 'active-shell': !__VLS_ctx.isWaiting, 'is-switching': __VLS_ctx.switching }]) },
    });
    if (__VLS_ctx.isWaiting) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "waiting-room" },
            'aria-live': "polite",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "waiting-mark" },
        });
        (__VLS_ctx.statusText);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({});
        (__VLS_ctx.examTitle);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "waiting-subtitle" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "candidate-card" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx.candidateId);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx.candidateName);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx.clientIp);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.em, __VLS_intrinsicElements.em)({
            ...{ class: ({ verified: __VLS_ctx.networkVerified }) },
        });
        (__VLS_ctx.networkVerified ? '✓ 机房网络环境验证通过' : '正在进行机房网络环境验证');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "countdown-label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "countdown" },
        });
        (__VLS_ctx.waitingCountdown);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "clock-note" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "rules" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "waiting-status" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "breathing-dot" },
        });
        if (__VLS_ctx.loadingError) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "error" },
            });
            (__VLS_ctx.loadingError);
        }
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "workbench" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "status-line" },
        });
        (__VLS_ctx.statusText);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        (__VLS_ctx.candidateName);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.logout) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.br, __VLS_intrinsicElements.br)({});
        (__VLS_ctx.examCountdown);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
        if (__VLS_ctx.loadingError) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "error" },
            });
            (__VLS_ctx.loadingError);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "workspace-grid" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
        for (const [item] of __VLS_getVForSourceType((__VLS_ctx.questions))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.noExam))
                            return;
                        if (!!(__VLS_ctx.isWaiting))
                            return;
                        __VLS_ctx.selectQuestion(item);
                    } },
                key: (item.id),
                ...{ class: (['question-tab', { selected: item.id === __VLS_ctx.question.id }]) },
            });
            (item.ordinal);
            (item.title);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
        (__VLS_ctx.question.ordinal);
        (__VLS_ctx.question.title);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        (__VLS_ctx.question.statement);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        (__VLS_ctx.question.max_score || 0);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        (__VLS_ctx.question.time_limit_ms || 0);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        (__VLS_ctx.question.memory_limit_kb || 0);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "tip" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.sample) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        (__VLS_ctx.saved);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.pre, __VLS_intrinsicElements.pre)({});
        (__VLS_ctx.output || '执行结果：等待样例调试');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({});
        /** @type {[typeof CodeEditor, ]} */ ;
        // @ts-ignore
        const __VLS_0 = __VLS_asFunctionalComponent(CodeEditor, new CodeEditor({
            modelValue: (__VLS_ctx.code),
            readonlyRanges: (__VLS_ctx.readonlyRanges()),
        }));
        const __VLS_1 = __VLS_0({
            modelValue: (__VLS_ctx.code),
            readonlyRanges: (__VLS_ctx.readonlyRanges()),
        }, ...__VLS_functionalComponentArgsRest(__VLS_0));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.footer, __VLS_intrinsicElements.footer)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.save) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.submit) },
            ...{ class: "submit" },
        });
    }
}
/** @type {__VLS_StyleScopedClasses['no-exam']} */ ;
/** @type {__VLS_StyleScopedClasses['waiting-room']} */ ;
/** @type {__VLS_StyleScopedClasses['waiting-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['waiting-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['candidate-card']} */ ;
/** @type {__VLS_StyleScopedClasses['countdown-label']} */ ;
/** @type {__VLS_StyleScopedClasses['countdown']} */ ;
/** @type {__VLS_StyleScopedClasses['clock-note']} */ ;
/** @type {__VLS_StyleScopedClasses['rules']} */ ;
/** @type {__VLS_StyleScopedClasses['waiting-status']} */ ;
/** @type {__VLS_StyleScopedClasses['breathing-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['error']} */ ;
/** @type {__VLS_StyleScopedClasses['workbench']} */ ;
/** @type {__VLS_StyleScopedClasses['status-line']} */ ;
/** @type {__VLS_StyleScopedClasses['error']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['tip']} */ ;
/** @type {__VLS_StyleScopedClasses['submit']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            CodeEditor: CodeEditor,
            noExam: noExam,
            isWaiting: isWaiting,
            switching: switching,
            loadingError: loadingError,
            questions: questions,
            question: question,
            code: code,
            saved: saved,
            output: output,
            candidateId: candidateId,
            candidateName: candidateName,
            clientIp: clientIp,
            networkVerified: networkVerified,
            waitingCountdown: waitingCountdown,
            examCountdown: examCountdown,
            examTitle: examTitle,
            statusText: statusText,
            selectQuestion: selectQuestion,
            readonlyRanges: readonlyRanges,
            save: save,
            sample: sample,
            submit: submit,
            logout: logout,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
