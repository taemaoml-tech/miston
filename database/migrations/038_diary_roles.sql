-- Роль у щоденнику (учень / учитель / батько) та зв'язок батька з дитиною.
CREATE TABLE IF NOT EXISTS diary_roles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('student', 'teacher', 'parent')),
  child_id UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS diary_roles_child_idx ON diary_roles (child_id);
