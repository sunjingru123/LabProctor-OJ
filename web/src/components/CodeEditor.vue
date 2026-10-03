<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as monaco from 'monaco-editor'

type ReadonlyRange = { start: number; end: number }
const props = defineProps<{ modelValue: string; readonlyRanges?: ReadonlyRange[] }>()
const emit = defineEmits<{ (event: 'update:modelValue', value: string): void }>()
const host = ref<HTMLElement | null>(null)
let editor: monaco.editor.IStandaloneCodeEditor | undefined
let updatingFromParent = false

function isReadonlyLine(line: number) { return (props.readonlyRanges ?? []).some((r) => line >= r.start && line <= r.end) }
function applyReadonlyDecorations() { if (!editor) return; editor.createDecorationsCollection((props.readonlyRanges ?? []).map((r) => ({ range: new monaco.Range(r.start, 1, r.end, 1), options: { isWholeLine: true, className: 'template-line' } }))) }
onMounted(() => { if (!host.value) return; editor = monaco.editor.create(host.value, { value: props.modelValue, language: 'cpp', theme: 'vs-dark', automaticLayout: true, lineNumbers: 'on', minimap: { enabled: false }, tabSize: 4 }); editor.onDidChangeModelContent(() => { if (!updatingFromParent && editor) emit('update:modelValue', editor.getValue()) }); editor.onKeyDown((event) => { const line = editor?.getPosition()?.lineNumber ?? 0; if (isReadonlyLine(line)) { event.preventDefault(); event.stopPropagation() } }); applyReadonlyDecorations() })
watch(() => props.modelValue, (value) => { if (!editor || editor.getValue() === value) return; updatingFromParent = true; editor.setValue(value); updatingFromParent = false })
watch(() => props.readonlyRanges, applyReadonlyDecorations, { deep: true })
onBeforeUnmount(() => editor?.dispose())
</script>
<template><div ref="host" class="editor-host" /></template>
<style scoped>.editor-host { width: 100%; height: 65vh; min-height: 360px; }:deep(.template-line) { background: rgba(120,120,120,.18); }</style>
