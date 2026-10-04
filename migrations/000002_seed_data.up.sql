-- Local-only demo credentials: 20240001 / Student@123, teacher_01 / Teacher@123, admin / Admin@123.
-- pgcrypto creates real, independently salted bcrypt hashes at cost 10.
ALTER TABLE users ADD COLUMN IF NOT EXISTS username varchar(64);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique_idx
    ON users (username)
    WHERE username IS NOT NULL;

INSERT INTO users (
    id, role, username, student_id, password_hash, full_name, class_name
)
VALUES
    ('00000000-0000-0000-0000-000000000001', 'admin'::user_role, 'admin', NULL,
        crypt('Admin@123', gen_salt('bf', 10)), '系统管理员', '信息中心'),
    ('00000000-0000-0000-0000-000000000002', 'teacher'::user_role, 'teacher_01', NULL,
        crypt('Teacher@123', gen_salt('bf', 10)), '测试教师', '计算机学院'),
    ('00000000-0000-0000-0000-000000000011', 'student'::user_role, 'student_01', '20240001',
        crypt('Student@123', gen_salt('bf', 10)), '测试学生一', '计算机2401'),
    ('00000000-0000-0000-0000-000000000012', 'student'::user_role, 'student_02', '20240002',
        crypt('Student@123', gen_salt('bf', 10)), '测试学生二', '计算机2401'),
    ('00000000-0000-0000-0000-000000000013', 'student'::user_role, 'student_03', '20240003',
        crypt('Student@123', gen_salt('bf', 10)), '测试学生三', '计算机2401')
ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    username = EXCLUDED.username,
    student_id = EXCLUDED.student_id,
    password_hash = EXCLUDED.password_hash,
    full_name = EXCLUDED.full_name,
    class_name = EXCLUDED.class_name;

INSERT INTO exams (
    id, title, status, starts_at, ends_at, ip_allowlist, require_manual_review, created_by
)
VALUES (
    '10000000-0000-0000-0000-000000000001',
    'LabProctor Demo Exam',
    'running'::exam_status,
    now() - interval '1 hour',
    now() + interval '6 hours',
    ARRAY['127.0.0.1/32'::cidr, '192.168.0.0/16'::cidr, '10.0.0.0/8'::cidr],
    true,
    '00000000-0000-0000-0000-000000000002'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO exam_participants (exam_id, student_id)
SELECT '10000000-0000-0000-0000-000000000001'::uuid, id
FROM users
WHERE role = 'student'::user_role
ON CONFLICT DO NOTHING;

INSERT INTO questions (
    id, exam_id, ordinal, title, statement, time_limit_ms, memory_limit_kb,
    max_score, template_code
)
VALUES
    (
        '20000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000001',
        1,
        'Sum two integers',
        'Read two integers and print their sum.',
        1000,
        65536,
        50,
        E'#include <iostream>\nusing namespace std;\nint main(){\n// === STUDENT_CODE_START ===\n\n// === STUDENT_CODE_END ===\n}'
    ),
    (
        '20000000-0000-0000-0000-000000000002',
        '10000000-0000-0000-0000-000000000001',
        2,
        'Echo input',
        'Read one line and print it.',
        1000,
        65536,
        50,
        ''
    )
ON CONFLICT (id) DO NOTHING;

INSERT INTO test_cases (question_id, is_sample, input_data, expected_output, ordinal)
VALUES
    ('20000000-0000-0000-0000-000000000001', true, '2 3' || E'\n', '5' || E'\n', 1),
    ('20000000-0000-0000-0000-000000000001', false, '10 20' || E'\n', '30' || E'\n', 2),
    ('20000000-0000-0000-0000-000000000002', false, 'hello' || E'\n', 'hello' || E'\n', 1)
ON CONFLICT DO NOTHING;

INSERT INTO drafts (exam_id, student_id, question_id, code, version)
VALUES
    (
        '10000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000011',
        '20000000-0000-0000-0000-000000000001',
        'int a,b; cin>>a>>b; cout<<a+b;',
        1
    ),
    (
        '10000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000011',
        '20000000-0000-0000-0000-000000000002',
        '',
        1
    )
ON CONFLICT DO NOTHING;

INSERT INTO exam_scores (exam_id, student_id)
SELECT exam_id, student_id
FROM exam_participants
ON CONFLICT DO NOTHING;
