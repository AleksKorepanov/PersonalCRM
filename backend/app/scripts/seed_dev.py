from __future__ import annotations

from psycopg import connect

from app.core.config import settings


def _get_or_create_user(cur):
    email = settings.dev_user_email
    cur.execute("SELECT id, email, display_name FROM users WHERE email = %s", (email,))
    row = cur.fetchone()
    if row:
        return row[0], row[1], row[2]

    display_name = email.split("@", 1)[0]
    cur.execute(
        "INSERT INTO users(email, display_name) VALUES (%s, %s) RETURNING id, email, display_name",
        (email, display_name),
    )
    row = cur.fetchone()
    return row[0], row[1], row[2]


def _get_or_create_workspace(cur, owner_user_id: str):
    name = "PersonalCRM Dev"
    cur.execute(
        "SELECT id, name FROM workspaces WHERE name = %s AND owner_user_id = %s",
        (name, owner_user_id),
    )
    row = cur.fetchone()
    if row:
        return row[0], row[1]

    cur.execute(
        "INSERT INTO workspaces(name, owner_user_id) VALUES (%s, %s) RETURNING id, name",
        (name, owner_user_id),
    )
    row = cur.fetchone()
    return row[0], row[1]


def _ensure_membership(cur, workspace_id: str, user_id: str):
    cur.execute(
        """
        INSERT INTO workspace_memberships(workspace_id, user_id, role, is_active, accepted_at)
        VALUES (%s, %s, 'owner', true, now())
        ON CONFLICT (workspace_id, user_id)
        DO UPDATE
          SET role = 'owner',
              is_active = true,
              accepted_at = COALESCE(workspace_memberships.accepted_at, now()),
              deleted_at = NULL
        """,
        (workspace_id, user_id),
    )


def main() -> None:
    dsn = settings.database_url.replace("postgresql+psycopg://", "postgresql://")
    with connect(dsn) as conn:
        with conn.cursor() as cur:
            user_id, email, display_name = _get_or_create_user(cur)
            workspace_id, workspace_name = _get_or_create_workspace(cur, str(user_id))
            _ensure_membership(cur, str(workspace_id), str(user_id))
        conn.commit()

    print("Dev seed created:")
    print(f"user_id: {user_id}")
    print(f"email: {email}")
    print(f"display_name: {display_name}")
    print(f"workspace_id: {workspace_id}")
    print(f"workspace_name: {workspace_name}")


if __name__ == "__main__":
    main()
