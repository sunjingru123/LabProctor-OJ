package handler

import (
	"net/http"
	"time"
	"github.com/google/uuid"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sunjingru123/LabProctor-OJ/internal/service"
)
type TeacherExam struct { DB *pgxpool.Pool; Submissions *service.SubmissionService }
func (h *TeacherExam) Dashboard(c *gin.Context){id:=examID(c);var participants,submitted int;if e:=h.DB.QueryRow(c,`SELECT count(*) FROM exam_participants WHERE exam_id=$1`,id).Scan(&participants);e!=nil{fail(c,500,e);return};if e:=h.DB.QueryRow(c,`SELECT count(*) FROM submissions WHERE exam_id=$1`,id).Scan(&submitted);e!=nil{fail(c,500,e);return};c.JSON(200,gin.H{"exam_id":id,"participants":participants,"submitted":submitted})}
func (h *TeacherExam) ForceEnd(c *gin.Context){id:=examID(c);_,e:=h.DB.Exec(c,`UPDATE exams SET status='closed' WHERE id=$1 AND status IN ('published','running')`,id);if e!=nil{fail(c,500,e);return};rows,e:=h.DB.Query(c,`SELECT student_id FROM exam_participants ep WHERE ep.exam_id=$1 AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.exam_id=ep.exam_id AND s.student_id=ep.student_id)`,id);if e!=nil{fail(c,500,e);return};defer rows.Close();count:=0;for rows.Next(){var studentID uuid.UUID;if rows.Scan(&studentID)!=nil{continue};if _,e=h.Submissions.Submit(c,id,studentID);e==nil{count++}};c.JSON(202,gin.H{"status":"closed","queued_auto_submissions":count})}
func (h *TeacherExam) Create(c *gin.Context){var in struct{Title string `json:"title"`;Starts,Ends time.Time `json:"starts_at"`;IP []string `json:"ip_allowlist"`};if c.ShouldBindJSON(&in)!=nil||in.Title==""||in.Ends.Before(in.Starts)||!in.Ends.After(time.Now()){fail(c,400,"invalid exam window");return};c.JSON(http.StatusNotImplemented,gin.H{"error":"exam creation repository wiring required"})}
