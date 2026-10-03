-- Demo credentials (all passwords: LabProctor123!)
-- bcrypt hashes generated with cost 12.
INSERT INTO users(id,role,student_id,password_hash,full_name,class_name) VALUES
('00000000-0000-0000-0000-000000000001','admin','admin','$2a$12$LQv3c1yqBWVHxkd0LHAkOeJ8c7z1Vq3f9Y7p4N7h7y0m5Qf4k2m9K','System Administrator','IT'),
('00000000-0000-0000-0000-000000000002','teacher','teacher_01','$2a$12$LQv3c1yqBWVHxkd0LHAkOeJ8c7z1Vq3f9Y7p4N7h7y0m5Qf4k2m9K','Demo Teacher','Computer Science'),
('00000000-0000-0000-0000-000000000011','student','student_01','$2a$12$LQv3c1yqBWVHxkd0LHAkOeJ8c7z1Vq3f9Y7p4N7h7y0m5Qf4k2m9K','Student One','CS2401'),
('00000000-0000-0000-0000-000000000012','student','student_02','$2a$12$LQv3c1yqBWVHxkd0LHAkOeJ8c7z1Vq3f9Y7p4N7h7y0m5Qf4k2m9K','Student Two','CS2401'),
('00000000-0000-0000-0000-000000000013','student','student_03','$2a$12$LQv3c1yqBWVHxkd0LHAkOeJ8c7z1Vq3f9Y7p4N7h7y0m5Qf4k2m9K','Student Three','CS2401')
ON CONFLICT (id) DO UPDATE SET password_hash=EXCLUDED.password_hash;
INSERT INTO exams(id,title,status,starts_at,ends_at,ip_allowlist,require_manual_review,created_by) VALUES('10000000-0000-0000-0000-000000000001','LabProctor Demo Exam','running',now()-interval '1 hour',now()+interval '6 hours',ARRAY['127.0.0.1/32'::cidr,'192.168.0.0/16'::cidr,'10.0.0.0/8'::cidr],true,'00000000-0000-0000-0000-000000000002') ON CONFLICT (id) DO NOTHING;
INSERT INTO exam_participants(exam_id,student_id) SELECT '10000000-0000-0000-0000-000000000001',id FROM users WHERE role='student' ON CONFLICT DO NOTHING;
INSERT INTO questions(id,exam_id,ordinal,title,statement,time_limit_ms,memory_limit_kb,max_score,template_code) VALUES
('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',1,'Sum two integers','Read two integers and print their sum.',1000,65536,50,'#include <iostream>\nusing namespace std;\nint main(){\n// === STUDENT_CODE_START ===\n\n// === STUDENT_CODE_END ===\n}'),
('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',2,'Echo input','Read one line and print it.',1000,65536,50,'') ON CONFLICT (id) DO NOTHING;
INSERT INTO test_cases(question_id,is_sample,input_data,expected_output,ordinal) VALUES
('20000000-0000-0000-0000-000000000001',true,'2 3\n','5\n',1),('20000000-0000-0000-0000-000000000001',false,'10 20\n','30\n',2),('20000000-0000-0000-0000-000000000002',false,'hello\n','hello\n',1) ON CONFLICT DO NOTHING;
INSERT INTO drafts(exam_id,student_id,question_id,code,version) VALUES('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000011','20000000-0000-0000-0000-000000000001','int a,b; cin>>a>>b; cout<<a+b;',1),('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000011','20000000-0000-0000-0000-000000000002','',1) ON CONFLICT DO NOTHING;
INSERT INTO exam_scores(exam_id,student_id) SELECT exam_id,student_id FROM exam_participants ON CONFLICT DO NOTHING;
