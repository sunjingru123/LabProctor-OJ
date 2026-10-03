package middleware

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

const PrincipalKey = "principal"
type Principal struct { UserID uuid.UUID; Role string; StudentNumber string; SessionID string }
type Auth struct { SigningKey []byte }
func (a Auth) Require() gin.HandlerFunc { return func(c *gin.Context) { raw:=strings.TrimPrefix(c.GetHeader("Authorization"),"Bearer ");if raw==""{abort(c,http.StatusUnauthorized,"missing bearer token");return}; claims:=jwt.MapClaims{};t,e:=jwt.ParseWithClaims(raw,claims,func(*jwt.Token)(interface{},error){return a.SigningKey,nil},jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}));if e!=nil||!t.Valid{abort(c,http.StatusUnauthorized,"invalid token");return};id,e:=uuid.Parse(stringClaim(claims,"user_id"));if e!=nil{abort(c,http.StatusUnauthorized,"invalid user id");return};p:=Principal{UserID:id,Role:stringClaim(claims,"role"),StudentNumber:stringClaim(claims,"student_id"),SessionID:stringClaim(claims,"sid")};if p.Role==""{abort(c,http.StatusUnauthorized,"missing role");return};c.Set(PrincipalKey,p);c.Next()} }
func RequireRole(roles ...string) gin.HandlerFunc { return func(c *gin.Context){p,e:=PrincipalFrom(c);if e!=nil{abort(c,http.StatusUnauthorized,"unauthenticated");return};for _,r:=range roles{if p.Role==r{c.Next();return}};abort(c,http.StatusForbidden,"insufficient role") } }
func PrincipalFrom(c *gin.Context)(Principal,error){v,ok:=c.Get(PrincipalKey);if !ok{return Principal{},errors.New("principal absent")};p,ok:=v.(Principal);if !ok{return Principal{},errors.New("principal invalid")};return p,nil}
func stringClaim(c jwt.MapClaims,k string)string{v,_:=c[k].(string);return v};func abort(c *gin.Context,status int,msg string){c.AbortWithStatusJSON(status,gin.H{"error":msg})}
