package handler

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sunjingru123/LabProctor-OJ/internal/service"
	"golang.org/x/crypto/bcrypt"
)

type TeacherExam struct {
	DB          *pgxpool.Pool
	Submissions *service.SubmissionService
}

type testCaseInput struct {
	Input  string `json:"input"`
	Output string `json:"output"`
}

type questionInput struct {
	Title         string          `json:"title"`
	Statement     string          `json:"statement"`
	MaxScore      float64         `json:"max_score"`
	TimeLimitMS   int             `json:"time_limit_ms"`
	MemoryLimitMB int             `json:"memory_limit_mb"`
	Language      string          `json:"language"`
	TemplateCode  string          `json:"template_code"`
	SampleCases   []testCaseInput `json:"sample_cases"`
	TestCases     []testCaseInput `json:"test_cases"`
}

type participantInput struct {
	StudentNumber string `json:"student_id"`
	Name          string `json:"name"`
	ClassName     string `json:"class_name"`
}

func (h *TeacherExam) List(c *gin.Context) {
	rows, err := h.DB.Query(c, `SELECT id,title,status::text FROM exams ORDER BY starts_at DESC`)
	if err != nil { fail(c, 500, err); return }
	defer rows.Close()
	out := []gin.H{}
	for rows.Next() {
		var id uuid.UUID
		var title, status string
		if err = rows.Scan(&id, &title, &status); err != nil { fail(c, 500, err); return }
		out = append(out, gin.H{"id": id, "title": title, "status": status})
	}
	c.JSON(http.StatusOK, out)
}

func (h *TeacherExam) Dashboard(c *gin.Context) {
	id := examID(c)
	var participants, submitted int
	if err := h.DB.QueryRow(c, `SELECT count(*) FROM exam_participants WHERE exam_id=$1`, id).Scan(&participants); err != nil { fail(c, 500, err); return }
	if err := h.DB.QueryRow(c, `SELECT count(*) FROM submissions WHERE exam_id=$1`, id).Scan(&submitted); err != nil { fail(c, 500, err); return }
	c.JSON(http.StatusOK, gin.H{"exam_id": id, "participants": participants, "submitted": submitted})
}

func (h *TeacherExam) ForceEnd(c *gin.Context) {
	id := examID(c)
	if _, err := h.DB.Exec(c, `UPDATE exams SET status='closed' WHERE id=$1 AND status IN ('published','running')`, id); err != nil { fail(c, 500, err); return }
	rows, err := h.DB.Query(c, `SELECT student_id FROM exam_participants ep WHERE ep.exam_id=$1 AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.exam_id=ep.exam_id AND s.student_id=ep.student_id)`, id)
	if err != nil { fail(c, 500, err); return }
	defer rows.Close()
	count := 0
	for rows.Next() {
		var studentID uuid.UUID
		if rows.Scan(&studentID) == nil {
			if _, err = h.Submissions.Submit(c, id, studentID); err == nil { count++ }
		}
	}
	c.JSON(http.StatusAccepted, gin.H{"status": "closed", "queued_auto_submissions": count})
}

func (h *TeacherExam) Questions(c *gin.Context) {
	rows, err := h.DB.Query(c, `SELECT id,ordinal,title,statement,time_limit_ms,memory_limit_kb,max_score,template_code,language FROM questions WHERE exam_id=$1 ORDER BY ordinal`, examID(c))
	if err != nil { fail(c, 500, err); return }
	defer rows.Close()
	out := []gin.H{}
	for rows.Next() {
		var id uuid.UUID; var ordinal, timeLimit, memoryKB int; var title, statement, template, language string; var score float64
		if err = rows.Scan(&id, &ordinal, &title, &statement, &timeLimit, &memoryKB, &score, &template, &language); err != nil { fail(c, 500, err); return }
		out = append(out, gin.H{"id": id, "ordinal": ordinal, "title": title, "statement": statement, "time_limit_ms": timeLimit, "memory_limit_mb": memoryKB / 1024, "max_score": score, "template_code": template, "language": language, "has_template": template != ""})
	}
	c.JSON(http.StatusOK, out)
}

func validateQuestion(in questionInput) bool {
	return strings.TrimSpace(in.Title) != "" && strings.TrimSpace(in.Statement) != "" && in.MaxScore > 0 && in.TimeLimitMS > 0 && in.MemoryLimitMB > 0 && (in.Language == "C" || in.Language == "C++")
}

func (h *TeacherExam) CreateQuestion(c *gin.Context) {
	var in questionInput
	if c.ShouldBindJSON(&in) != nil || !validateQuestion(in) { fail(c, 400, "invalid question"); return }
	exam := examID(c)
	tx, err := h.DB.Begin(c)
	if err != nil { fail(c, 500, err); return }
	defer tx.Rollback(c)
	var id uuid.UUID
	err = tx.QueryRow(c, `INSERT INTO questions (exam_id,ordinal,title,statement,time_limit_ms,memory_limit_kb,max_score,template_code,language) SELECT $1,COALESCE(max(ordinal),0)+1,$2,$3,$4,$5,$6,$7,$8 FROM questions WHERE exam_id=$1 RETURNING id`, exam, strings.TrimSpace(in.Title), in.Statement, in.TimeLimitMS, in.MemoryLimitMB*1024, in.MaxScore, in.TemplateCode, in.Language).Scan(&id)
	if err != nil { fail(c, 500, err); return }
	if err = replaceCases(c, tx, id, in); err != nil { fail(c, 400, err.Error()); return }
	if err = tx.Commit(c); err != nil { fail(c, 500, err); return }
	c.JSON(http.StatusCreated, gin.H{"id": id})
}

func (h *TeacherExam) UpdateQuestion(c *gin.Context) {
	var in questionInput
	if c.ShouldBindJSON(&in) != nil || !validateQuestion(in) { fail(c, 400, "invalid question"); return }
	qid, err := uuid.Parse(c.Param("qid"))
	if err != nil { fail(c, 400, "invalid question id"); return }
	tx, err := h.DB.Begin(c)
	if err != nil { fail(c, 500, err); return }
	defer tx.Rollback(c)
	tag, err := tx.Exec(c, `UPDATE questions SET title=$3,statement=$4,time_limit_ms=$5,memory_limit_kb=$6,max_score=$7,template_code=$8,language=$9 WHERE id=$1 AND exam_id=$2`, qid, examID(c), strings.TrimSpace(in.Title), in.Statement, in.TimeLimitMS, in.MemoryLimitMB*1024, in.MaxScore, in.TemplateCode, in.Language)
	if err != nil || tag.RowsAffected() == 0 { fail(c, 404, "question not found"); return }
	if err = replaceCases(c, tx, qid, in); err != nil { fail(c, 400, err.Error()); return }
	if err = tx.Commit(c); err != nil { fail(c, 500, err); return }
	c.Status(http.StatusNoContent)
}

func replaceCases(c *gin.Context, tx pgx.Tx, qid uuid.UUID, in questionInput) error {
	if _, err := tx.Exec(c, `DELETE FROM test_cases WHERE question_id=$1`, qid); err != nil { return err }
	ordinal := 1
	for _, group := range []struct { sample bool; items []testCaseInput }{{true, in.SampleCases}, {false, in.TestCases}} {
		for _, item := range group.items {
			if item.Input == "" && item.Output == "" { continue }
			if _, err := tx.Exec(c, `INSERT INTO test_cases(question_id,is_sample,input_data,expected_output,ordinal) VALUES($1,$2,$3,$4,$5)`, qid, group.sample, item.Input, item.Output, ordinal); err != nil { return err }
			ordinal++
		}
	}
	return nil
}

func (h *TeacherExam) DeleteQuestion(c *gin.Context) {
	qid, err := uuid.Parse(c.Param("qid")); if err != nil { fail(c, 400, "invalid question id"); return }
	tag, err := h.DB.Exec(c, `DELETE FROM questions WHERE id=$1 AND exam_id=$2`, qid, examID(c))
	if err != nil { fail(c, 500, err); return }
	if tag.RowsAffected() == 0 { fail(c, 404, "question not found"); return }
	c.Status(http.StatusNoContent)
}

func (h *TeacherExam) Participants(c *gin.Context) {
	rows, err := h.DB.Query(c, `SELECT u.id,u.student_id,u.full_name,COALESCE(u.class_name,''),ep.extra_minutes,ep.ip_exempt FROM exam_participants ep JOIN users u ON u.id=ep.student_id WHERE ep.exam_id=$1 ORDER BY u.student_id`, examID(c))
	if err != nil { fail(c, 500, err); return }
	defer rows.Close()
	out := []gin.H{}
	for rows.Next() {
		var id uuid.UUID; var number, name, className string; var extra int; var exempt bool
		if err = rows.Scan(&id, &number, &name, &className, &extra, &exempt); err != nil { fail(c, 500, err); return }
		out = append(out, gin.H{"id": id, "student_id": number, "name": name, "class_name": className, "extra_minutes": extra, "ip_exempt": exempt})
	}
	c.JSON(http.StatusOK, out)
}

func (h *TeacherExam) ImportParticipants(c *gin.Context) {
	var in struct { Students []participantInput `json:"students"` }
	if c.ShouldBindJSON(&in) != nil || len(in.Students) == 0 { fail(c, 400, "student list is required"); return }
	tx, err := h.DB.Begin(c); if err != nil { fail(c, 500, err); return }; defer tx.Rollback(c)
	password, err := bcrypt.GenerateFromPassword([]byte("Student@123"), bcrypt.DefaultCost); if err != nil { fail(c, 500, err); return }
	added := 0
	for _, student := range in.Students {
		student.StudentNumber = strings.TrimSpace(student.StudentNumber); student.Name = strings.TrimSpace(student.Name); student.ClassName = strings.TrimSpace(student.ClassName)
		if student.StudentNumber == "" || student.Name == "" { fail(c, 400, "student id and name are required"); return }
		var userID uuid.UUID
		err = tx.QueryRow(c, `INSERT INTO users(role,username,student_id,password_hash,full_name,class_name) VALUES('student',$1,$2,$3,$4,$5) ON CONFLICT(student_id) DO UPDATE SET full_name=EXCLUDED.full_name,class_name=EXCLUDED.class_name RETURNING id`, "student_"+student.StudentNumber, student.StudentNumber, string(password), student.Name, student.ClassName).Scan(&userID)
		if err != nil { fail(c, 400, "could not import student "+student.StudentNumber); return }
		tag, err := tx.Exec(c, `INSERT INTO exam_participants(exam_id,student_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, examID(c), userID)
		if err != nil { fail(c, 500, err); return }
		added += int(tag.RowsAffected())
	}
	if err = tx.Commit(c); err != nil { fail(c, 500, err); return }
	c.JSON(http.StatusOK, gin.H{"added": added, "processed": len(in.Students)})
}

func (h *TeacherExam) UpdateParticipant(c *gin.Context) {
	student, err := uuid.Parse(c.Param("student_id")); if err != nil { fail(c, 400, "invalid student id"); return }
	var in struct { ExtraMinutes int `json:"extra_minutes"`; IPExempt bool `json:"ip_exempt"` }
	if c.ShouldBindJSON(&in) != nil || in.ExtraMinutes < 0 { fail(c, 400, "invalid participant privileges"); return }
	tag, err := h.DB.Exec(c, `UPDATE exam_participants SET extra_minutes=$3,ip_exempt=$4 WHERE exam_id=$1 AND student_id=$2`, examID(c), student, in.ExtraMinutes, in.IPExempt)
	if err != nil { fail(c, 500, err); return }
	if tag.RowsAffected() == 0 { fail(c, 404, "participant not found"); return }
	c.Status(http.StatusNoContent)
}

func (h *TeacherExam) Create(c *gin.Context) {
	var in struct { Title string `json:"title"`; Starts, Ends time.Time `json:"starts_at"`; IP []string `json:"ip_allowlist"` }
	if c.ShouldBindJSON(&in) != nil || in.Title == "" || in.Ends.Before(in.Starts) || !in.Ends.After(time.Now()) { fail(c, 400, "invalid exam window"); return }
	c.JSON(http.StatusNotImplemented, gin.H{"error": "exam creation repository wiring required"})
}
