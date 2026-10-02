package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type SubmissionService struct { DB *pgxpool.Pool; Redis *redis.Client; Queue string }
func (s *SubmissionService) Submit(ctx context.Context, examID, studentID uuid.UUID) (uuid.UUID,error) { if s==nil||s.DB==nil||s.Redis==nil{return uuid.Nil,errors.New("submission dependencies unavailable")};tx,e:=s.DB.BeginTx(ctx,pgx.TxOptions{});if e!=nil{return uuid.Nil,e};defer tx.Rollback(ctx);var existing uuid.UUID;e=tx.QueryRow(ctx,`SELECT id FROM submissions WHERE exam_id=$1 AND student_id=$2 FOR UPDATE`,examID,studentID).Scan(&existing);if e==nil{return existing,tx.Commit(ctx)};if !errors.Is(e,pgx.ErrNoRows){return uuid.Nil,e};rows,e:=tx.Query(ctx,`SELECT question_id,code,version FROM drafts WHERE exam_id=$1 AND student_id=$2 ORDER BY question_id`,examID,studentID);if e!=nil{return uuid.Nil,e};defer rows.Close();type item struct{Q uuid.UUID; Code string; Version int64};var items []item;h:=sha256.New();for rows.Next(){var i item;if e=rows.Scan(&i.Q,&i.Code,&i.Version);e!=nil{return uuid.Nil,e};items=append(items,i);h.Write([]byte(i.Q.String()));h.Write([]byte(i.Code));h.Write([]byte(fmt.Sprint(i.Version)))};if e=rows.Err();e!=nil{return uuid.Nil,e};hash:=hex.EncodeToString(h.Sum(nil));var sid uuid.UUID;if e=tx.QueryRow(ctx,`INSERT INTO submissions(exam_id,student_id,status,snapshot_hash) VALUES($1,$2,'queued',$3) RETURNING id`,examID,studentID,hash).Scan(&sid);e!=nil{return uuid.Nil,e};for _,i:=range items{if _,e=tx.Exec(ctx,`INSERT INTO submission_items(submission_id,question_id,source_code,source_version) VALUES($1,$2,$3,$4)`,sid,i.Q,i.Code,i.Version);e!=nil{return uuid.Nil,e}};payload,_:=json.Marshal(map[string]any{"submission_id":sid,"exam_id":examID,"student_id":studentID});var taskID uuid.UUID;if e=tx.QueryRow(ctx,`INSERT INTO judge_tasks(submission_id,payload) VALUES($1,$2) RETURNING id`,sid,payload).Scan(&taskID);e!=nil{return uuid.Nil,e};if e=tx.Commit(ctx);e!=nil{return uuid.Nil,e};q:=s.Queue;if q==""{q="judge:tasks"};if e=s.Redis.RPush(ctx,q,payload).Err();e!=nil{return sid,fmt.Errorf("snapshot committed but queue push failed (task %s): %w",taskID,e)};return sid,nil }
var _ = time.Now
