import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as monaco from 'monaco-editor';
const props = defineProps();
const emit = defineEmits();
const host = ref(null);
let editor;
let decorations;
let updatingFromParent = false;
function isReadonlyLine(line) { return (props.readonlyRanges ?? []).some((r) => line >= r.start && line <= r.end); }
function applyReadonlyDecorations() { if (!editor)
    return; decorations?.clear(); decorations = editor.createDecorationsCollection((props.readonlyRanges ?? []).map((r) => ({ range: new monaco.Range(r.start, 1, r.end, 1), options: { isWholeLine: true, className: 'template-line' } }))); }
onMounted(() => { if (!host.value)
    return; editor = monaco.editor.create(host.value, { value: props.modelValue, language: 'cpp', theme: 'vs-dark', automaticLayout: true, lineNumbers: 'on', minimap: { enabled: false }, tabSize: 4 }); editor.onDidChangeModelContent(() => { if (!updatingFromParent && editor)
    emit('update:modelValue', editor.getValue()); }); editor.onKeyDown((event) => { const line = editor?.getPosition()?.lineNumber ?? 0; if (isReadonlyLine(line)) {
    event.preventDefault();
    event.stopPropagation();
} }); applyReadonlyDecorations(); });
watch(() => props.modelValue, (value) => { if (!editor || editor.getValue() === value)
    return; updatingFromParent = true; editor.setValue(value); updatingFromParent = false; applyReadonlyDecorations(); });
watch(() => props.readonlyRanges, applyReadonlyDecorations, { deep: true });
onBeforeUnmount(() => { decorations?.clear(); editor?.dispose(); });
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
    ref: "host",
    ...{ class: "editor-host" },
});
/** @type {typeof __VLS_ctx.host} */ ;
/** @type {__VLS_StyleScopedClasses['editor-host']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            host: host,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
