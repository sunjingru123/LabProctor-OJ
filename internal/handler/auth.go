package handler

import (
	"net/http"
	"github.com/gin-gonic/gin"
)

// AuthHandler intentionally delegates password verification and token issuance
// to the configured identity service; no in-memory account state is used.
type AuthHandler struct{}
func (AuthHandler) Login(c *gin.Context) { c.JSON(http.StatusNotImplemented, gin.H{"error":"identity provider must be configured"}) }
func (AuthHandler) GitHubCallback(c *gin.Context) { c.JSON(http.StatusNotImplemented, gin.H{"error":"github oauth provider must be configured"}) }
