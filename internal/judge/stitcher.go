package judge

import (
	"errors"
	"strings"
)

var ErrInvalidTemplate = errors.New("template markers are missing or reversed")

// Stitch inserts only the editor region into the server-owned template.
// The client never supplies or controls the surrounding template text.
func Stitch(template, student, startMarker, endMarker string) (string, error) {
	if template == "" { return student, nil }
	if startMarker == "" || endMarker == "" { return "", ErrInvalidTemplate }
	start := strings.Index(template, startMarker)
	if start < 0 { return "", ErrInvalidTemplate }
	endRel := strings.Index(template[start+len(startMarker):], endMarker)
	if endRel < 0 { return "", ErrInvalidTemplate }
	end := start + len(startMarker) + endRel
	if end < start { return "", ErrInvalidTemplate }
	return template[:start+len(startMarker)] + "\n" + student + "\n" + template[end:], nil
}

