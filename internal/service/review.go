package service

import (
	"context"
	"errors"
	"fmt"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrScoreConflict = errors.New("score version conflict")
type ReviewService struct { DB *pgxpool.Pool }
type ReviewUpdate struct { ExamID, StudentID uuid.UUID; Score float64; Comment string; ExpectedVersion int64; ActorID uuid.UUID }
func (s *ReviewService) UpdateScore(ctx context.Context, in ReviewUpdate) error {
	if s==nil||s.DB==nil{return errors.New("database unavailable")};tx,e:=s.DB.BeginTx(ctx,pgx.TxOptions{});if e!=nil{return e};defer tx.Rollback(ctx)
	var old float64;var version int64
	e=tx.QueryRow(ctx,`SELECT score,COALESCE((SELECT count(*) FROM score_audit_logs l WHERE l.exam_id=$1 AND l.student_id=$2),0) FROM exam_scores WHERE exam_id=$1 AND student_id=$2 FOR UPDATE`,in.ExamID,in.StudentID).Scan(&old,&version);if e!=nil{return fmt.Errorf("load score: %w",e)};if version!=in.ExpectedVersion{return ErrScoreConflict}
	if _,e=tx.Exec(ctx,`UPDATE exam_scores SET score=$3, finalized_at=now() WHERE exam_id=$1 AND student_id=$2`,in.ExamID,in.StudentID,in.Score);e!=nil{return e};if _,e=tx.Exec(ctx,`INSERT INTO score_audit_logs(exam_id,student_id,actor_id,old_score,new_score,reason) VALUES($1,$2,$3,$4,$5,$6)`,in.ExamID,in.StudentID,in.ActorID,old,in.Score,in.Comment);e!=nil{return e};return tx.Commit(ctx)
}
