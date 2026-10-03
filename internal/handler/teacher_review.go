package handler

import (
	"net/http"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/sunjingru123/LabProctor-OJ/internal/middleware"
	"github.com/sunjingru123/LabProctor-OJ/internal/service"
)
type TeacherReview struct { Reviews *service.ReviewService; Exports *service.ExportService }
func (h *TeacherReview) Update(c *gin.Context){actor,e:=middleware.PrincipalFrom(c);if e!=nil{fail(c,401,e);return};exam,e:=uuid.Parse(c.Param("id"));if e!=nil{fail(c,400,"invalid exam id");return};student,e:=uuid.Parse(c.Param("student_id"));if e!=nil{fail(c,400,"invalid student id");return};var in struct{Score float64 `json:"score"`;Comment string `json:"comment"`;Version int64 `json:"version"`};if c.ShouldBindJSON(&in)!=nil||in.Score<0{fail(c,400,"invalid score");return};e=h.Reviews.UpdateScore(c,service.ReviewUpdate{ExamID:exam,StudentID:student,Score:in.Score,Comment:in.Comment,ExpectedVersion:in.Version,ActorID:actor.UserID});if e==service.ErrScoreConflict{fail(c,409,"score was changed by another reviewer");return};if e!=nil{fail(c,500,e);return};c.Status(204)}
func (h *TeacherReview) SourceZip(c *gin.Context){id,e:=uuid.Parse(c.Param("id"));if e!=nil{fail(c,400,"invalid exam id");return};b,e:=h.Exports.ExportSourceZip(c,id);if e!=nil{fail(c,500,e);return};c.Data(http.StatusOK,"application/zip",b)}
func (h *TeacherReview) Grades(c *gin.Context){id,e:=uuid.Parse(c.Param("id"));if e!=nil{fail(c,400,"invalid exam id");return};b,e:=h.Exports.ExportGradesExcel(c,id);if e!=nil{fail(c,500,e);return};c.Data(http.StatusOK,"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",b)}
func (h *TeacherReview) ScreenLogs(c *gin.Context){id,e:=uuid.Parse(c.Param("id"));if e!=nil{fail(c,400,"invalid exam id");return};b,e:=h.Exports.ExportScreenLogs(c,id);if e!=nil{fail(c,500,e);return};c.Data(http.StatusOK,"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",b)}
