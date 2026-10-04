import axios from 'axios';
export function installAntiCheat(examId) {
    let hiddenAt = 0;
    const report = (event, duration_ms) => axios.post(`/api/v1/exams/${examId}/anti-cheat/event`, { event, duration_ms }).catch(() => undefined);
    const onVisibility = () => { if (document.hidden)
        hiddenAt = Date.now();
    else if (hiddenAt) {
        report('切屏', Date.now() - hiddenAt);
        hiddenAt = 0;
        window.alert('⚠️ 防作弊系统警告\n\n系统检测到您已离开考试界面！该行为已被完整记录（含发生时间与离开时长），切屏记录将作为期末考纪处分的重要依据，请立即返回答题！\n\n我知道了，立即答题');
    } };
    const onBlur = () => { report('页面失焦', 0); window.alert('⚠️ 防作弊系统警告\n\n系统检测到您已离开考试界面！该行为已被完整记录（含发生时间与离开时长），切屏记录将作为期末考纪处分的重要依据，请立即返回答题！\n\n我知道了，立即答题'); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    return () => { document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('blur', onBlur); };
}
