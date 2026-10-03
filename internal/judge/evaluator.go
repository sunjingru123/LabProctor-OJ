package judge

import (
	"context"
	"fmt"
	"os"
	"time"
)

type TestCase struct { ID string; Input, Expected string; Sample bool; Score float64 }
type Problem struct { Template, StartMarker, EndMarker string; Cpp bool; TimeLimit time.Duration; MemoryBytes, OutputBytes int64; Cases []TestCase }
type Verdict string
const ( AC Verdict="AC"; WA Verdict="WA"; TLE Verdict="TLE"; MLE Verdict="MLE"; OLE Verdict="OLE"; CE Verdict="CE" )
type CaseResult struct { CaseID string; Verdict Verdict; Score float64; Runtime time.Duration; MemoryBytes int64; Detail string }
type Evaluation struct { Verdict Verdict; Score float64; CompileLog string; Cases []CaseResult }
type Evaluator struct { Compiler Compiler; WorkRoot string }
func (e *Evaluator) Evaluate(ctx context.Context, p Problem, studentCode string) (Evaluation,error) {
	code,err:=Stitch(p.Template,studentCode,p.StartMarker,p.EndMarker);if err!=nil{return Evaluation{Verdict:CE},err};root:=e.WorkRoot;if root==""{root=os.TempDir()};dir,err:=os.MkdirTemp(root,"lpj-");if err!=nil{return Evaluation{},err};defer os.RemoveAll(dir)
	cr,err:=e.Compiler.Compile(ctx,dir,code,p.Cpp);if err!=nil{return Evaluation{Verdict:CE,CompileLog:cr.Log},nil};result:=Evaluation{Verdict:AC,CompileLog:cr.Log};total:=0.0;formal:=0
	for _,tc:=range p.Cases {if tc.Sample{continue};formal++;rr,re:=Run(ctx,cr.Binary,[]byte(tc.Input),RunLimits{CPU:p.TimeLimit,MemoryBytes:p.MemoryBytes,OutputBytes:p.OutputBytes});v:=AC;detail:="";if rr.TimedOut{v=TLE};if rr.OutputLimited{v=OLE};if re!=nil&&v==AC{detail=re.Error();v=WA};if v==AC&&!EqualOutput(tc.Expected,string(rr.Stdout)){v=WA};score:=0.0;if v==AC{score=tc.Score};total+=score;result.Cases=append(result.Cases,CaseResult{CaseID:tc.ID,Verdict:v,Score:score,Runtime:rr.Duration,MemoryBytes:rr.MemoryBytes,Detail:detail});if v!=AC&&result.Verdict==AC{result.Verdict=v}}
	if formal==0{return Evaluation{},fmt.Errorf("problem has no formal test cases")};result.Score=total;return result,nil
}
