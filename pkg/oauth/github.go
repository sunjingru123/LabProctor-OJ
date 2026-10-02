package oauth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/github"
)

var ErrStateMismatch = errors.New("oauth state mismatch")
type StateStore interface { Put(ctx context.Context, state, studentID string, ttl time.Duration) error; Consume(ctx context.Context, state string) (string,error) }
type GitHubUser struct { ID int64 `json:"id"`; Login string `json:"login"`; AvatarURL string `json:"avatar_url"`; Email string `json:"email"` }
type GitHubOAuth struct { Config *oauth2.Config; States StateStore; HTTPClient *http.Client; StateTTL time.Duration }
func (g *GitHubOAuth) Begin(ctx context.Context, studentID string) (string,error) { if g.Config==nil||g.States==nil{return "",errors.New("oauth not configured")}; b:=make([]byte,32); if _,e:=rand.Read(b);e!=nil{return "",fmt.Errorf("generate state: %w",e)}; state:=base64.RawURLEncoding.EncodeToString(b); ttl:=g.StateTTL;if ttl<=0{ttl=5*time.Minute};if e:=g.States.Put(ctx,state,studentID,ttl);e!=nil{return "",fmt.Errorf("store state: %w",e)}; return g.Config.AuthCodeURL(state, oauth2.AccessTypeOffline),nil }
func (g *GitHubOAuth) Exchange(ctx context.Context, state, code string) (GitHubUser,string,error) { if g.States==nil{return GitHubUser{},"",errors.New("state store unavailable")}; expected,e:=g.States.Consume(ctx,state);if e!=nil{return GitHubUser{},"",fmt.Errorf("consume state: %w",e)};if expected==""||state==""{return GitHubUser{},"",ErrStateMismatch}; tok,e:=g.Config.Exchange(ctx,code);if e!=nil{return GitHubUser{},"",fmt.Errorf("exchange code: %w",e)}; c:=g.HTTPClient;if c==nil{c=http.DefaultClient}; req,e:=http.NewRequestWithContext(ctx,http.MethodGet,"https://api.github.com/user",nil);if e!=nil{return GitHubUser{},"",e};req.Header.Set("Authorization","Bearer "+tok.AccessToken);req.Header.Set("Accept","application/vnd.github+json");resp,e:=c.Do(req);if e!=nil{return GitHubUser{},"",fmt.Errorf("github user request: %w",e)};defer resp.Body.Close();if resp.StatusCode!=http.StatusOK{return GitHubUser{},"",fmt.Errorf("github user returned %s",resp.Status)};var u GitHubUser;if e=json.NewDecoder(resp.Body).Decode(&u);e!=nil{return GitHubUser{},"",fmt.Errorf("decode github user: %w",e)};if u.ID==0{return GitHubUser{},"",errors.New("github response missing id")};return u,expected,nil }
func NewConfig(clientID,secret,redirect string, scopes []string) *oauth2.Config { return &oauth2.Config{ClientID:clientID,ClientSecret:secret,Endpoint:github.Endpoint,RedirectURL:redirect,Scopes:scopes} }
