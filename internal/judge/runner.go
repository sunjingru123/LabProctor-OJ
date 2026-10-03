package judge

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os/exec"
	"runtime"
	"time"
)

var ErrOutputLimit = errors.New("output limit exceeded")
type RunLimits struct { CPU time.Duration; MemoryBytes int64; OutputBytes int64 }
type RunResult struct { Stdout []byte; Stderr []byte; Duration time.Duration; MemoryBytes int64; TimedOut bool; OutputLimited bool; ExitCode int }
func Run(ctx context.Context, binary string, input []byte, limits RunLimits) (RunResult,error) {
	if limits.CPU<=0{limits.CPU=2*time.Second};if limits.OutputBytes<=0{limits.OutputBytes=1<<20}
	xctx,cancel:=context.WithTimeout(ctx,limits.CPU);defer cancel();cmd:=exec.CommandContext(xctx,binary);cmd.Stdin=bytes.NewReader(input);var out,errOut cappedBuffer;out.limit=limits.OutputBytes;errOut.limit=limits.OutputBytes;cmd.Stdout=&out;cmd.Stderr=&errOut
	start:=time.Now();e:=cmd.Run();exitCode:=-1;if cmd.ProcessState!=nil{exitCode=cmd.ProcessState.ExitCode()};r:=RunResult{Stdout:out.Bytes(),Stderr:errOut.Bytes(),Duration:time.Since(start),OutputLimited:out.limited||errOut.limited,ExitCode:exitCode};if xctx.Err()==context.DeadlineExceeded{r.TimedOut=true;return r,nil};if r.OutputLimited{return r,ErrOutputLimit};if e!=nil{return r,e};if runtime.GOOS=="windows"&&limits.MemoryBytes>0{ /* Windows memory enforcement requires a Job Object; deployment must use one. */ };return r,nil
}
type cappedBuffer struct{buf bytes.Buffer;limit int64;limited bool}
func(b *cappedBuffer)Write(p []byte)(int,error){if int64(b.buf.Len()+len(p))>b.limit{n:=int(b.limit)-b.buf.Len();if n>0{_,_=b.buf.Write(p[:n])};b.limited=true;return len(p),ErrOutputLimit};return b.buf.Write(p)}
func(b *cappedBuffer)Bytes()[]byte{return b.buf.Bytes()};var _ io.Writer
