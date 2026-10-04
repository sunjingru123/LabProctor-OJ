package handler

import (
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

type AuthHandler struct { DB *pgxpool.Pool; JWTSecret []byte }
type loginRequest struct { Username string `json:"username"`; StudentID string `json:"student_id"`; Password string `json:"password"` }
func (h *AuthHandler) Login(c *gin.Context) {
	var req loginRequest
	if err:=c.ShouldBindJSON(&req);err!=nil { c.JSON(http.StatusBadRequest,gin.H{"error":"登录信息格式不正确"});return }
	account:=strings.TrimSpace(req.Username);if account==""{account=strings.TrimSpace(req.StudentID)}
	if account==""||req.Password=="" { c.JSON(http.StatusBadRequest,gin.H{"error":"请输入学号/工号和密码"});return }
	if h.DB==nil||len(h.JWTSecret)<32 { log.Printf("[登录异常] 数据库或 JWT 配置不可用");c.JSON(http.StatusServiceUnavailable,gin.H{"error":"登录服务暂不可用"});return }
	var id uuid.UUID;var username,studentID,passwordHash,role string
	err:=h.DB.QueryRow(c.Request.Context(),`SELECT id,COALESCE(username,''),COALESCE(student_id,''),password_hash,role::text FROM users WHERE username=$1 OR student_id=$1 ORDER BY (username=$1) DESC LIMIT 1`,account).Scan(&id,&username,&studentID,&passwordHash,&role)
	if err!=nil { if !errors.Is(err,pgx.ErrNoRows){log.Printf("[登录异常] 账号查询失败: %v",err)}else{log.Printf("[登录调试] 传入账号: %q, 查出用户: false, 密码比对错误: user not found",account)};c.JSON(http.StatusUnauthorized,gin.H{"error":"学号或密码错误，请核对后重试"});return }
	compareErr:=bcrypt.CompareHashAndPassword([]byte(passwordHash),[]byte(req.Password))
	log.Printf("[登录调试] 传入账号: %q, 查出用户: true, 密码比对错误: %v",account,compareErr)
	if compareErr!=nil { c.JSON(http.StatusUnauthorized,gin.H{"error":"学号或密码错误，请核对后重试"});return }
	sid:=uuid.NewString();now:=time.Now();claims:=jwt.MapClaims{"user_id":id.String(),"username":username,"student_id":studentID,"role":role,"sid":sid,"iat":now.Unix(),"exp":now.Add(12*time.Hour).Unix()};token:=jwt.NewWithClaims(jwt.SigningMethodHS256,claims)
	signed,err:=token.SignedString(h.JWTSecret);if err!=nil{log.Printf("[登录异常] JWT 签发失败: %v",err);c.JSON(http.StatusInternalServerError,gin.H{"error":"登录服务暂不可用"});return}
	c.JSON(http.StatusOK,gin.H{"token":signed,"role":role,"username":username,"student_id":studentID,"user_id":id.String(),"expires_at":now.Add(12*time.Hour).UTC()})
}
