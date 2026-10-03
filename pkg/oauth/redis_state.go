package oauth

import (
	"context"
	"time"
	"github.com/redis/go-redis/v9"
)

// RedisStateStore consumes state atomically, making every OAuth state single-use.
type RedisStateStore struct { Client *redis.Client; Prefix string }
func (s RedisStateStore) Put(ctx context.Context, state, studentID string, ttl time.Duration) error { p:=s.Prefix;if p==""{p="oauth:github:state:"};return s.Client.Set(ctx,p+state,studentID,ttl).Err() }
func (s RedisStateStore) Consume(ctx context.Context,state string)(string,error){p:=s.Prefix;if p==""{p="oauth:github:state:"};return s.Client.GetDel(ctx,p+state).Result()}
