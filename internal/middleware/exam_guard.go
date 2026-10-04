package middleware

import (
	"context"
	"net"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	clientip "github.com/sunjingru123/LabProctor-OJ/pkg/ip"
)
type ExamGuard struct { DB *pgxpool.Pool; Redis *redis.Client; Trusted []*net.IPNet; SessionTTL time.Duration }
func (g *ExamGuard) Student() gin.HandlerFunc{return func(c *gin.Context){p,e:=PrincipalFrom(c);if e!=nil||p.Role!="student"{abort(c,http.StatusForbidden,"student access required");return};examID,e:=uuid.Parse(c.Param("id"));if e!=nil{abort(c,http.StatusBadRequest,"invalid exam id");return};var allow []string;var exempt bool;var starts,ends time.Time;e=g.DB.QueryRow(c.Request.Context(),`SELECT e.ip_allowlist::text[], ep.ip_exempt, e.starts_at, e.ends_at FROM exams e JOIN exam_participants ep ON ep.exam_id=e.id WHERE e.id=$1 AND ep.student_id=$2`,examID,p.UserID).Scan(&allow,&exempt,&starts,&ends);if e!=nil{abort(c,http.StatusForbidden,"not an exam participant");return};now:=time.Now();if !now.Before(ends){abort(c,http.StatusForbidden,"exam outside time window");return};if !exempt{remote,e:=clientip.ExtractClientIP(c.Request,g.Trusted);if e!=nil{abort(c,http.StatusForbidden,"untrusted client address");return};set,e:=clientip.NewCIDRSet(allow);if e!=nil||!set.Contains(remote){abort(c,http.StatusForbidden,"client IP not allowed");return}};if !g.claimSession(c.Request.Context(),examID,p.UserID,p.SessionID){abort(c,http.StatusConflict,"session superseded by another device");return};c.Set("exam_id",examID);c.Next()}}
func (g *ExamGuard) claimSession(ctx context.Context,examID,studentID uuid.UUID,sid string)bool{if sid==""||g.Redis==nil{return false};key:="exam:session:"+examID.String()+":"+studentID.String();ttl:=g.SessionTTL;if ttl<=0{ttl=90*time.Second};old,e:=g.Redis.Get(ctx,key).Result();if e!=nil&&e!=redis.Nil{return false};if old!=""&&old!=sid{_ = g.Redis.LPush(ctx,"exam:security:session-replaced",examID.String()+":"+studentID.String()).Err()};return g.Redis.Set(ctx,key,sid,ttl).Err()==nil}
var _ = http.MethodPost
