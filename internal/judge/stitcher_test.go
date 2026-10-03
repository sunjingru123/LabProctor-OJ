package judge
import "testing"
func TestStitchAndDiff(t *testing.T){s,e:=Stitch("a\n// S\nold\n// E\nz","new","// S","// E");if e!=nil||s!="a\n// S\nnew\n// E\nz"{t.Fatalf("unexpected stitch: %q %v",s,e)};if !EqualOutput("a  \r\n\r\n","a\n"){t.Fatal("normalization failed")}}
