"""add_password_hash_to_users

Revision ID: 0003_add_password_hash
Revises: d70f05fe506d
Create Date: 2026-02-12 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0003_add_password_hash'
down_revision = 'd70f05fe506d'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Добавляем поле password_hash в таблицу users
    op.add_column(
        'users',
        sa.Column('password_hash', sa.Text(), nullable=True, comment='Хеш пароля (SHA-256 с солью для dev, bcrypt для production)'),
    )


def downgrade() -> None:
    # Удаляем поле password_hash
    op.drop_column('users', 'password_hash')
