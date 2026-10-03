package scheduler

import (
	"context"
	"time"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sunjingru123/LabProctor-OJ/internal/service"
)
type AutoSubmitter struct { DB *pgxpool.Pool; Submissions *service.SubmissionService; Interval time.Duration }
func (a *AutoSubmitter) Run(ctx context.Context){d:=a.Interval;if d<=0{d=5*time.Second};t:=time.NewTicker(d);defer t.Stop();for{select{case<-ctx.Done():return;case<-t.C:a.tick(ctx)}}}
func (a *AutoSubmitter) tick(ctx context.Context){rows,e:=a.DB.Query(ctx,`SELECT ep.exam_id,ep.student_id FROM exam_participants ep JOIN exams e ON e.id=ep.exam_id WHERE e.ends_at<=now() AND e.status IN ('published','running') AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.exam_id=ep.exam_id AND s.student_id=ep.student_id) FOR UPDATE SKIP LOCKED`);if e!=nil{return};defer rows.Close();for rows.Next(){var examID,studentID uuid.UUID;if rows.Scan(&examID,&studentID)==nil{_,_=a.Submissions.Submit(ctx,examID,studentID)}};_,_=a.DB.Exec(ctx,`UPDATE exams SET status='closed' WHERE ends_at<=now() AND status IN ('published','running')`)}
