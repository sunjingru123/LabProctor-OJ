ALTER TABLE questions ADD COLUMN IF NOT EXISTS language varchar(8) NOT NULL DEFAULT 'C++';
ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_language_check;
ALTER TABLE questions ADD CONSTRAINT questions_language_check CHECK (language IN ('C', 'C++'));
