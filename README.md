# LabProctor OJ

面向高校机房的纯考试 C/C++ OJ：学生只能运行样例并整卷交卷；正式用例由隔离 Worker 执行。

架构：Vue 3 + Monaco → Gin API → PostgreSQL（快照/成绩/审计）与 Redis（会话/队列）→ 独立 GCC/G++ Judge Worker。

## 5 分钟启动

需要 Docker Desktop 或 Linux Docker Compose：

```bash
docker compose up -d --build
```

PostgreSQL 首次启动会自动执行 `000001_init_schema.up.sql` 与 `000002_seed_data.up.sql`。已有旧数据卷时运行 `make seed-db`（Windows 使用 `./run.ps1 seed`）。API 地址为 `http://localhost:8080`。

演示账号（密码统一 `LabProctor123!`）：`admin`、`teacher_01`、`student_01`、`student_02`、`student_03`。仅供本地联调，生产环境必须替换。

联调流程：学生登录 → 编辑并等待自动保存 → Run sample → 整卷提交 → 教师打开 `/teacher` 查看监考/阅卷/导出 → 查看 Worker 日志。

快捷命令：`make docker-up`、`make docker-down`、`make seed-db`；PowerShell：`./run.ps1 up|down|seed|logs`。

生产部署必须启用非特权容器、seccomp/cgroups、`network=none`，并替换所有默认密钥。
