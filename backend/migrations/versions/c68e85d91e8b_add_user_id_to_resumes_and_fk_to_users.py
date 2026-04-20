"""add user_id to resumes and FK to users

Revision ID: c68e85d91e8b
Revises: 16690167b741
Create Date: 2025-08-27 18:39:55.468531
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "c68e85d91e8b"
down_revision = "16690167b741"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Upgrade schema."""
    # === auto-generated bits (safe) ===
    op.add_column(
        "feedbacks",
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
    )
    op.add_column(
        "feedbacks",
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
    )
    op.alter_column(
        "feedbacks",
        "feedback",
        existing_type=sa.VARCHAR(length=1000),
        type_=sa.Text(),
        existing_nullable=False,
    )

    op.alter_column(
        "profiles",
        "summary",
        existing_type=sa.VARCHAR(),
        type_=sa.Text(),
        existing_nullable=True,
    )
    op.alter_column(
        "profiles",
        "created_at",
        existing_type=postgresql.TIMESTAMP(timezone=True),
        type_=sa.DateTime(),
        existing_nullable=False,
        existing_server_default=sa.text("now()"),
    )
    op.alter_column(
        "profiles",
        "updated_at",
        existing_type=postgresql.TIMESTAMP(timezone=True),
        type_=sa.DateTime(),
        existing_nullable=False,
        existing_server_default=sa.text("now()"),
    )
    op.create_foreign_key(None, "profiles", "users", ["user_id"], ["id"], ondelete="CASCADE")

    # === resumes.user_id: safe order ===
    # 1) Add the column as NULLABLE first (so it works with existing rows)
    op.add_column("resumes", sa.Column("user_id", sa.Integer(), nullable=True))

    # 2) Backfill existing rows to the first available user (if any)
    conn = op.get_bind()
    first_user = conn.execute(sa.text("SELECT id FROM users ORDER BY id LIMIT 1")).first()
    if first_user:
        conn.execute(
            sa.text("UPDATE resumes SET user_id = :uid WHERE user_id IS NULL"),
            {"uid": first_user.id},
        )
        # 3) Enforce NOT NULL only if we could backfill
        op.alter_column("resumes", "user_id", nullable=False)
    # else: leave nullable so inserts continue to work; enforce later after manual backfill

    # 4) Indexes & FK for resumes.user_id
    op.create_index("ix_resumes_user_created", "resumes", ["user_id", "created_at"], unique=False)
    op.create_index(op.f("ix_resumes_user_id"), "resumes", ["user_id"], unique=False)
    op.create_foreign_key(None, "resumes", "users", ["user_id"], ["id"], ondelete="CASCADE")

    # Timestamps server defaults to match models
    op.alter_column(
        "resumes",
        "created_at",
        existing_type=postgresql.TIMESTAMP(),
        server_default=sa.text("now()"),
        existing_nullable=False,
    )
    op.alter_column(
        "resumes",
        "updated_at",
        existing_type=postgresql.TIMESTAMP(),
        server_default=sa.text("now()"),
        existing_nullable=False,
    )
    op.alter_column(
        "users",
        "created_at",
        existing_type=postgresql.TIMESTAMP(),
        server_default=sa.text("now()"),
        existing_nullable=False,
    )
    op.alter_column(
        "users",
        "updated_at",
        existing_type=postgresql.TIMESTAMP(),
        server_default=sa.text("now()"),
        nullable=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Revert users timestamps defaults
    op.alter_column(
        "users",
        "updated_at",
        existing_type=postgresql.TIMESTAMP(),
        server_default=None,
        nullable=True,
    )
    op.alter_column(
        "users",
        "created_at",
        existing_type=postgresql.TIMESTAMP(),
        server_default=None,
        existing_nullable=False,
    )

    # Drop resumes FKs / indexes / column
    op.drop_constraint(None, "resumes", type_="foreignkey")
    op.drop_index(op.f("ix_resumes_user_id"), table_name="resumes")
    op.drop_index("ix_resumes_user_created", table_name="resumes")
    op.alter_column(
        "resumes",
        "updated_at",
        existing_type=postgresql.TIMESTAMP(),
        server_default=None,
        existing_nullable=False,
    )
    op.alter_column(
        "resumes",
        "created_at",
        existing_type=postgresql.TIMESTAMP(),
        server_default=None,
        existing_nullable=False,
    )
    op.drop_column("resumes", "user_id")

    # Revert profiles changes
    op.drop_constraint(None, "profiles", type_="foreignkey")
    op.alter_column(
        "profiles",
        "updated_at",
        existing_type=sa.DateTime(),
        type_=postgresql.TIMESTAMP(timezone=True),
        existing_nullable=False,
        existing_server_default=sa.text("now()"),
    )
    op.alter_column(
        "profiles",
        "created_at",
        existing_type=sa.DateTime(),
        type_=postgresql.TIMESTAMP(timezone=True),
        existing_nullable=False,
        existing_server_default=sa.text("now()"),
    )
    op.alter_column(
        "profiles",
        "summary",
        existing_type=sa.Text(),
        type_=sa.VARCHAR(),
        existing_nullable=True,
    )

    # Revert feedbacks changes
    op.alter_column(
        "feedbacks",
        "feedback",
        existing_type=sa.Text(),
        type_=sa.VARCHAR(length=1000),
        existing_nullable=False,
    )
    op.drop_column("feedbacks", "updated_at")
    op.drop_column("feedbacks", "created_at")
