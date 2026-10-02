// Package ip contains proxy-aware client IP extraction and CIDR policy helpers.
package ip

import (
	"errors"
	"net"
	"net/http"
	"strings"
)

var ErrInvalidRemoteAddr = errors.New("invalid remote address")

// ExtractClientIP trusts forwarding headers only when every proxy hop is in trusted.
// The right-most address is the peer connected to the application; walking left
// stops at the first untrusted hop, preventing client supplied XFF spoofing.
func ExtractClientIP(r *http.Request, trusted []*net.IPNet) (net.IP, error) {
	peer, _, err := net.SplitHostPort(strings.TrimSpace(r.RemoteAddr))
	if err != nil { return nil, ErrInvalidRemoteAddr }
	current := net.ParseIP(peer)
	if current == nil { return nil, ErrInvalidRemoteAddr }
	if !isTrusted(current, trusted) { return current, nil }
	vals := make([]string, 0, 8)
	for _, h := range []string{"X-Forwarded-For", "X-Real-IP"} {
		for _, v := range strings.Split(r.Header.Get(h), ",") { if s:=strings.TrimSpace(v); s!="" { vals=append(vals,s) } }
	}
	for i:=len(vals)-1; i>=0; i-- { ip:=net.ParseIP(vals[i]); if ip==nil { continue }; if !isTrusted(current, trusted) { break }; current=ip }
	return current,nil
}

func isTrusted(ip net.IP, nets []*net.IPNet) bool { for _, n:=range nets { if n!=nil && n.Contains(ip) { return true } }; return false }

type CIDRSet struct { nets []*net.IPNet }
func NewCIDRSet(cidrs []string) (*CIDRSet,error) { s:=&CIDRSet{}; for _, c:=range cidrs { _,n,e:=net.ParseCIDR(strings.TrimSpace(c)); if e!=nil{return nil,e}; s.nets=append(s.nets,n) }; return s,nil }
func (s *CIDRSet) Contains(ip net.IP) bool { if s==nil{return false}; return isTrusted(ip,s.nets) }
func (s *CIDRSet) ContainsString(raw string) bool { return s.Contains(net.ParseIP(strings.TrimSpace(raw))) }
