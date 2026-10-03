package judge

import "strings"

// NormalizeOutput removes trailing spaces/tabs per line, normalizes CRLF and
// removes only blank lines at the end. Significant internal whitespace remains.
func NormalizeOutput(s string) string {
	s = strings.ReplaceAll(s, "\r\n", "\n")
	s = strings.ReplaceAll(s, "\r", "\n")
	lines := strings.Split(s, "\n")
	for i := range lines { lines[i] = strings.TrimRight(lines[i], " \t") }
	for len(lines) > 0 && lines[len(lines)-1] == "" { lines = lines[:len(lines)-1] }
	return strings.Join(lines, "\n")
}

func EqualOutput(expected, actual string) bool { return NormalizeOutput(expected) == NormalizeOutput(actual) }

