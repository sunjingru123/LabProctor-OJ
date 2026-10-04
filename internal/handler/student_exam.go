package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/sunjingru123/LabProctor-OJ/internal/middleware"
	"github.com/sunjingru123/LabProctor-OJ/internal/service"
)

type StudentExam struct{ DB *pgxpool.Pool; Redis *redis.Client; Drafts *service.DraftService; Submissions *service.SubmissionService }

func (h *StudentExam) MyExams(c *gin.Context) {
	p, _ := middleware.PrincipalFrom(c)
	rows, err := h.DB.Query(c, `SELECT e.id,e.title,e.status::text,e.starts_at,e.ends_at FROM exams e JOIN exam_participants ep ON ep.exam_id=e.id WHERE ep.student_id=$1 ORDER BY CASE WHEN e.status='running' THEN 0 WHEN e.status IN ('published','pending') THEN 1 ELSE 2 END, e.starts_at ASC`, p.UserID)
	if err != nil { fail(c, 500, err); return }; defer rows.Close(); out := []gin.H{}
	for rows.Next() { var id uuid.UUID; var title, status string; var starts, ends time.Time; if err = rows.Scan(&id, &title, &status, &starts, &ends); err != nil { fail(c, 500, err); return }; out = append(out, gin.H{"id": id, "title": title, "status": status, "start_time": starts, "end_time": ends}) }
	c.JSON(http.StatusOK, out)
}

func (h *StudentExam) Detail(c *gin.Context) {
	p, _ := middleware.PrincipalFrom(c); id := examID(c)
	var title, status, studentNumber, studentName string; var starts, ends time.Time
	if err := h.DB.QueryRow(c, `SELECT e.title,e.status::text,e.starts_at,e.ends_at,COALESCE(u.student_id,''),u.full_name FROM exams e JOIN exam_participants ep ON ep.exam_id=e.id JOIN users u ON u.id=ep.student_id WHERE e.id=$1 AND ep.student_id=$2`, id, p.UserID).Scan(&title, &status, &starts, &ends, &studentNumber, &studentName); err != nil { fail(c, 404, "exam not found or not a participant"); return }
	now := time.Now(); clientIP := c.ClientIP(); response := gin.H{"exam_id": id, "title": title, "status": status, "start_time": starts, "end_time": ends, "server_time": now}
	response["student_id"] = studentNumber; response["student_name"] = studentName; response["client_ip"] = clientIP; response["network_verified"] = true
	response["exam"] = gin.H{"id": id, "title": title, "status": status, "start_time": starts, "end_time": ends, "server_time": now}; response["student"] = gin.H{"student_id": studentNumber, "full_name": studentName, "client_ip": clientIP, "ip_whitelisted": true}
	if now.Before(starts) || status == "draft" || status == "pending" { response["questions"] = []gin.H{}; response["remaining_seconds"] = int(starts.Sub(now).Seconds()); response["waiting"] = true; c.JSON(http.StatusOK, response); return }
	rows, err := h.DB.Query(c, `SELECT q.id,q.ordinal,q.title,q.statement,q.time_limit_ms,q.memory_limit_kb,q.max_score,q.template_code,q.student_start_marker,q.student_end_marker,(SELECT COALESCE(jsonb_agg(jsonb_build_object('input',tc.input_data,'output',tc.expected_output) ORDER BY tc.ordinal),'[]'::jsonb)::text FROM test_cases tc WHERE tc.question_id=q.id AND tc.is_sample=true) FROM questions q JOIN exam_participants ep ON ep.exam_id=q.exam_id WHERE q.exam_id=$1 AND ep.student_id=$2 ORDER BY q.ordinal`, id, p.UserID)
	if err != nil { fail(c, 500, err); return }; defer rows.Close(); out := []gin.H{}
	for rows.Next() { var qid uuid.UUID; var ordinal, timeLimit, memoryKB int; var questionTitle, statement, template, start, end, sampleJSON string; var score float64; if err = rows.Scan(&qid, &ordinal, &questionTitle, &statement, &timeLimit, &memoryKB, &score, &template, &start, &end, &sampleJSON); err != nil { fail(c, 500, err); return }; var samples []gin.H; _ = json.Unmarshal([]byte(sampleJSON), &samples); out = append(out, gin.H{"id": qid, "ordinal": ordinal, "title": questionTitle, "statement": statement, "time_limit_ms": timeLimit, "memory_limit_kb": memoryKB, "max_score": score, "editor_code": editable(template, start, end), "test_cases": samples}) }
	response["questions"] = out; response["remaining_seconds"] = maxSeconds(ends.Sub(now)); response["waiting"] = false; c.JSON(http.StatusOK, response)
}

func maxSeconds(d time.Duration) int { if d <= 0 { return 0 }; return int(d.Seconds()) }
func (h *StudentExam) Draft(c *gin.Context){p,_:=middleware.PrincipalFrom(c);var code string;var v int64;e:=h.DB.QueryRow(c,`SELECT code,version FROM drafts WHERE exam_id=$1 AND student_id=$2 AND question_id=$3`,examID(c),p.UserID,questionID(c)).Scan(&code,&v);if e!=nil{c.JSON(200,gin.H{"code":"","version":0});return};c.JSON(200,gin.H{"code":code,"version":v})}
func (h *StudentExam) SaveDraft(c *gin.Context){p,_:=middleware.PrincipalFrom(c);var in struct{Code string `json:"code"`;Version int64 `json:"version"`};if c.ShouldBindJSON(&in)!=nil{fail(c,400,"invalid draft");return};v,e:=h.Drafts.Save(c,examID(c).String(),p.UserID.String(),questionID(c).String(),in.Code,in.Version);if e==service.ErrDraftConflict{c.JSON(409,gin.H{"error":"draft version conflict"});return};if e!=nil{fail(c,500,e);return};c.JSON(200,gin.H{"version":v})}
func (h *StudentExam) RunSample(c *gin.Context){p,_:=middleware.PrincipalFrom(c);key:="exam:sample:rate:"+p.UserID.String();ok,e:=h.Redis.SetNX(c,key,"1",3*time.Second).Result();if e!=nil{fail(c,503,e);return};if !ok{c.JSON(429,gin.H{"error":"sample runs are rate limited"});return};var code struct{Code string `json:"code"`};if c.ShouldBindJSON(&code)!=nil{fail(c,400,"invalid request");return};var count int;e=h.DB.QueryRow(c,`SELECT count(*) FROM test_cases tc JOIN questions q ON q.id=tc.question_id WHERE q.exam_id=$1 AND q.id=$2 AND tc.is_sample=true`,examID(c),questionID(c)).Scan(&count);if e!=nil||count==0{fail(c,404,"no sample cases");return};payload:=gin.H{"kind":"sample","exam_id":examID(c),"question_id":questionID(c),"student_id":p.UserID,"student_code":code.Code,"sample_only":true};if e=h.Redis.RPush(c,"judge:sample",payload).Err();e!=nil{fail(c,503,e);return};c.JSON(202,gin.H{"status":"queued","sample_cases":count})}
func (h *StudentExam) Submit(c *gin.Context){p,_:=middleware.PrincipalFrom(c);var in struct{Confirm bool `json:"confirm"`};if c.ShouldBindJSON(&in)!=nil||!in.Confirm{fail(c,400,"explicit confirmation required");return};sid,e:=h.Submissions.Submit(c,examID(c),p.UserID);if e!=nil{fail(c,503,e);return};c.JSON(202,gin.H{"submission_id":sid,"status":"queued"})}
func (h *StudentExam) AntiCheat(c *gin.Context){p,_:=middleware.PrincipalFrom(c);var in struct{DurationMS int `json:"duration_ms"`;Event string `json:"event"`};if c.ShouldBindJSON(&in)!=nil||in.DurationMS<0||in.DurationMS>86400000{fail(c,400,"invalid event");return};_,e:=h.DB.Exec(c,`INSERT INTO screen_switch_logs(exam_id,student_id,duration_ms,metadata) VALUES($1,$2,$3,jsonb_build_object('event',$4))`,examID(c),p.UserID,in.DurationMS,in.Event);if e!=nil{fail(c,500,e);return};base:="exam:anticheat:"+examID(c).String()+":"+p.UserID.String();pipe:=h.Redis.TxPipeline();pipe.Incr(c,base+":count");pipe.IncrBy(c,base+":duration_ms",int64(in.DurationMS));pipe.Expire(c,base+":count",48*time.Hour);pipe.Expire(c,base+":duration_ms",48*time.Hour);_,e=pipe.Exec(c);if e!=nil{fail(c,503,e);return};c.Status(204)}
func editable(template,start,end string)string{i:=strings.Index(template,start);j:=strings.Index(template,end);if i<0||j<0||j<i{return ""};return template[i+len(start):j]};func examID(c *gin.Context)uuid.UUID{id,_:=uuid.Parse(c.Param("id"));return id};func questionID(c *gin.Context)uuid.UUID{id,_:=uuid.Parse(c.Param("qid"));return id};func fail(c *gin.Context,n int,v any){c.AbortWithStatusJSON(n,gin.H{"error":v})};var _=http.MethodGet;var _=strconv.Itoa
