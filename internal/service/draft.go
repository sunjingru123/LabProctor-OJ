package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrDraftConflict = errors.New("draft version conflict")
type DraftService struct { DB *pgxpool.Pool }
func (s *DraftService) Save(ctx context.Context, examID, studentID, questionID, code string, expectedVersion int64) (int64,error) { if s==nil||s.DB==nil{return 0,errors.New("database unavailable")}; if expectedVersion<0{return 0,errors.New("invalid version")}; var next int64; err:=s.DB.QueryRow(ctx,`INSERT INTO drafts(exam_id,student_id,question_id,code,version) VALUES($1,$2,$3,$4,1) ON CONFLICT(exam_id,student_id,question_id) DO UPDATE SET code=EXCLUDED.code, version=drafts.version+1, updated_at=now() WHERE drafts.version=$5 RETURNING version`,examID,studentID,questionID,code,expectedVersion).Scan(&next);if errors.Is(err,pgx.ErrNoRows){return 0,ErrDraftConflict};if err!=nil{return 0,fmt.Errorf("save draft: %w",err)};return next,nil }
