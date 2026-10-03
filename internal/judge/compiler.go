package judge

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"time"
)

type CompileResult struct { Binary string; Log string; Duration time.Duration }
type Compiler struct { GCC, GPP string; Timeout time.Duration }
var pathPattern = regexp.MustCompile(`(?:[A-Za-z]:)?[^\s:]+`)
func (c Compiler) Compile(ctx context.Context, dir, source string, cpp bool) (CompileResult, error) {
	if dir == "" { return CompileResult{}, fmt.Errorf("compile directory is empty") }
	if err := os.MkdirAll(dir, 0700); err != nil { return CompileResult{}, err }
	ext := ".c"; cc := c.GCC; if cpp { ext=".cpp"; cc=c.GPP }; if cc=="" { if cpp {cc="g++"} else {cc="gcc"} }
	src:=filepath.Join(dir,"main"+ext); bin:=filepath.Join(dir,"main")
	if runtime.GOOS=="windows" { bin += ".exe" }
	if err:=os.WriteFile(src,[]byte(source),0600);err!=nil{return CompileResult{},err}
	t:=c.Timeout;if t<=0{t=10*time.Second};xctx,cancel:=context.WithTimeout(ctx,t);defer cancel();cmd:=exec.CommandContext(xctx,cc,"-O2","-std=c++17",src,"-o",bin);if !cpp{cmd.Args=[]string{cc,"-O2","-std=c11",src,"-o",bin}};cmd.Dir=dir;out,e:=cmd.CombinedOutput();log:=sanitizePath(string(out),dir);if xctx.Err()==context.DeadlineExceeded{return CompileResult{Log:log},fmt.Errorf("compile timeout")};if e!=nil{return CompileResult{Log:log},fmt.Errorf("compile: %w",e)};return CompileResult{Binary:bin,Log:log},nil
}
func sanitizePath(s, dir string) string { s=strings.ReplaceAll(s,dir,"<sandbox>");return pathPattern.ReplaceAllStringFunc(s,func(v string)string{if strings.Contains(v,"/tmp/")||strings.Contains(v,"\\Temp\\"){return "<path>"};return v}) }
