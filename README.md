# LabProctor OJ Phase 1

纯考试模式 Go/PostgreSQL/Redis 基础设施。`submissions` 以 `(exam_id, student_id)` 幂等生成不可变整卷快照，`drafts` 使用版本条件更新，Judge Worker 必须独立部署在无网络、非特权沙箱中。

目录：`cmd/server` API、`cmd/worker` Worker、`internal/service` 业务事务、`pkg/ip` 代理链/CIDR、`pkg/oauth` GitHub OAuth、`migrations` PostgreSQL DDL、`web` 前端脚手架。
