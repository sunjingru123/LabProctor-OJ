package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// The production worker is intentionally a separate process. Its execution
// loop is wired to the isolated judge package in deployment configuration.
func main() { ctx,cancel:=signal.NotifyContext(context.Background(),os.Interrupt,syscall.SIGTERM); defer cancel(); if os.Getenv("DATABASE_URL")==""||os.Getenv("REDIS_URL")==""{log.Fatal("DATABASE_URL and REDIS_URL are required")}; db,e:=pgxpool.New(ctx,os.Getenv("DATABASE_URL"));if e!=nil{log.Fatal(e)};defer db.Close();u,e:=redis.ParseURL(os.Getenv("REDIS_URL"));if e!=nil{log.Fatal(e)};rc:=redis.NewClient(u);defer rc.Close();<-ctx.Done() }
