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

func (g *ExamGuard) Student() gin.HandlerFunc {
	return func(c *gin.Context) {
		p, err := PrincipalFrom(c)
		if err != nil || p.Role != "student" { abort(c, http.StatusForbidden, "student access required"); return }
		examID, err := uuid.Parse(c.Param("id")); if err != nil { abort(c, http.StatusBadRequest, "invalid exam id"); return }
		var allow []string; var exempt bool; var starts, ends time.Time; var status string
		err = g.DB.QueryRow(c.Request.Context(), `SELECT e.ip_allowlist::text[], ep.ip_exempt, e.starts_at, e.ends_at, e.status::text FROM exams e JOIN exam_participants ep ON ep.exam_id=e.id WHERE e.id=$1 AND ep.student_id=$2`, examID, p.UserID).Scan(&allow, &exempt, &starts, &ends, &status)
		if err != nil { abort(c, http.StatusForbidden, "not an exam participant"); return }
		now := time.Now()
		isDetails := c.Request.Method == http.MethodGet && c.Param("qid") == ""
		ended := !now.Before(ends) || status == "closed" || status == "archived"
		if ended { abort(c, http.StatusForbidden, "exam has ended"); return }
		if !isDetails && (status != "running" || now.Before(starts) || !now.Before(ends)) { abort(c, http.StatusForbidden, "exam is not currently running"); return }
		if !exempt {
			remote, ipErr := clientip.ExtractClientIP(c.Request, g.Trusted); if ipErr != nil { abort(c, http.StatusForbidden, "untrusted client address"); return }
			set, ipErr := clientip.NewCIDRSet(allow); if ipErr != nil || !set.Contains(remote) { abort(c, http.StatusForbidden, "client IP not allowed"); return }
		}
		if !g.claimSession(c.Request.Context(), examID, p.UserID, p.SessionID) { abort(c, http.StatusConflict, "session superseded by another device"); return }
		c.Set("exam_id", examID); c.Next()
	}
}

func (g *ExamGuard) claimSession(ctx context.Context, examID, studentID uuid.UUID, sid string) bool { if sid == "" || g.Redis == nil { return false }; key := "exam:session:" + examID.String() + ":" + studentID.String(); ttl := g.SessionTTL; if ttl <= 0 { ttl = 90 * time.Second }; old, err := g.Redis.Get(ctx, key).Result(); if err != nil && err != redis.Nil { return false }; if old != "" && old != sid { _ = g.Redis.LPush(ctx, "exam:security:session-replaced", examID.String()+":"+studentID.String()).Err() }; return g.Redis.Set(ctx, key, sid, ttl).Err() == nil }
var _ = http.MethodPost
