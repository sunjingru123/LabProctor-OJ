package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/sunjingru123/LabProctor-OJ/internal/handler"
	"github.com/sunjingru123/LabProctor-OJ/internal/middleware"
	"github.com/sunjingru123/LabProctor-OJ/internal/router"
	"github.com/sunjingru123/LabProctor-OJ/internal/scheduler"
	"github.com/sunjingru123/LabProctor-OJ/internal/service"
)
func main(){ctx,stop:=signal.NotifyContext(context.Background(),os.Interrupt,syscall.SIGTERM);defer stop();dsn:=os.Getenv("DATABASE_URL");ru:=os.Getenv("REDIS_URL");if dsn==""||ru==""{log.Fatal("DATABASE_URL and REDIS_URL are required")};db,e:=pgxpool.New(ctx,dsn);if e!=nil{log.Fatal(e)};defer db.Close();opt,e:=redis.ParseURL(ru);if e!=nil{log.Fatal(e)};rc:=redis.NewClient(opt);defer rc.Close();sub:=&service.SubmissionService{DB:db,Redis:rc};review:=&handler.TeacherReview{Reviews:&service.ReviewService{DB:db},Exports:&service.ExportService{DB:db}};r:=router.New(router.Deps{Auth:middleware.Auth{SigningKey:[]byte(os.Getenv("JWT_SECRET"))},Guard:&middleware.ExamGuard{DB:db,Redis:rc},Student:&handler.StudentExam{DB:db,Redis:rc,Drafts:&service.DraftService{DB:db},Submissions:sub},Teacher:&handler.TeacherExam{DB:db,Submissions:sub},Review:review});go (&scheduler.AutoSubmitter{DB:db,Submissions:sub}).Run(ctx);srv:=&http.Server{Addr:env("HTTP_ADDR",":8080"),Handler:r};go func(){if e:=srv.ListenAndServe();e!=nil&&e!=http.ErrServerClosed{log.Print(e)}}();<-ctx.Done();shutdownCtx,shutdownCancel:=context.WithTimeout(context.Background(),10*time.Second);defer shutdownCancel();_=srv.Shutdown(shutdownCtx)}
func env(k,d string)string{if v:=os.Getenv(k);v!=""{return v};return d}
