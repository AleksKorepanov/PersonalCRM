"""add_icloud_tables

Revision ID: d70f05fe506d
Revises: 0001_init
Create Date: 2026-02-13 10:27:55.680064

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd70f05fe506d'
down_revision = '0001_init'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Таблица iCloud аккаунтов
    op.create_table(
        'icloud_accounts',
        sa.Column('id', sa.UUID(), nullable=False, server_default=sa.text('gen_random_uuid()')),
        sa.Column('workspace_id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('apple_id', sa.Text(), nullable=False, comment='Apple ID (email, зашифрован)'),
        sa.Column('app_password_encrypted', sa.Text(), nullable=False, comment='App-specific password (зашифрован AES-256-GCM)'),
        sa.Column('encryption_key_id', sa.Text(), nullable=True, comment='ID ключа шифрования для ротации'),
        sa.Column('sync_enabled', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('last_sync_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('sync_error', sa.Text(), nullable=True, comment='Текст последней ошибки синхронизации'),
        sa.Column('sync_etag', sa.Text(), nullable=True, comment='Последний ETag для инкрементальной синхронизации'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.UniqueConstraint('workspace_id', 'user_id', name='uq_icloud_accounts_ws_user'),
        comment='iCloud аккаунты для синхронизации контактов через CardDAV'
    )

    # Таблица iCloud контактов
    op.create_table(
        'icloud_contacts',
        sa.Column('id', sa.UUID(), nullable=False, server_default=sa.text('gen_random_uuid()')),
        sa.Column('workspace_id', sa.UUID(), nullable=False),
        sa.Column('icloud_account_id', sa.UUID(), nullable=False),
        sa.Column('remote_uri', sa.Text(), nullable=False, comment='URI ресурса в iCloud CardDAV (например, /12345/card.vcf)'),
        sa.Column('etag', sa.Text(), nullable=False, comment='ETag для отслеживания изменений'),
        sa.Column('vcard_raw', sa.Text(), nullable=False, comment='Полный vCard в формате vCard 3.0/4.0'),
        sa.Column('display_name', sa.Text(), nullable=True, comment='Отображаемое имя контакта'),
        sa.Column('given_name', sa.Text(), nullable=True),
        sa.Column('middle_name', sa.Text(), nullable=True),
        sa.Column('family_name', sa.Text(), nullable=True),
        sa.Column('company', sa.Text(), nullable=True),
        sa.Column('department', sa.Text(), nullable=True),
        sa.Column('job_title', sa.Text(), nullable=True),
        sa.Column('phones', sa.dialects.postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb"), comment='[{label, value, is_primary}]'),
        sa.Column('emails', sa.dialects.postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb"), comment='[{label, value, is_primary}]'),
        sa.Column('phones_normalized', sa.dialects.postgresql.ARRAY(sa.Text()), nullable=False, server_default=sa.text("ARRAY[]::text[]"), comment='Нормализованные телефоны для быстрого поиска (E.164 формат)'),
        sa.Column('emails_normalized', sa.dialects.postgresql.ARRAY(sa.Text()), nullable=False, server_default=sa.text("ARRAY[]::text[]"), comment='Нормализованные email (lowercase) для быстрого поиска'),
        sa.Column('last_synced_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('sync_direction', sa.Text(), nullable=True, comment="'icloud_to_crm', 'crm_to_icloud', 'bidirectional'"),
        sa.Column('conflict_resolution', sa.Text(), nullable=True, comment="'icloud_wins', 'crm_wins', 'manual'"),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['icloud_account_id'], ['icloud_accounts.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('workspace_id', 'remote_uri', name='uq_icloud_contacts_ws_remote_uri'),
        comment='Контакты из iCloud, синхронизированные через CardDAV'
    )

    # Таблица связей между iCloud и CRM контактами
    op.create_table(
        'icloud_contact_links',
        sa.Column('id', sa.UUID(), nullable=False, server_default=sa.text('gen_random_uuid()')),
        sa.Column('workspace_id', sa.UUID(), nullable=False),
        sa.Column('contact_id', sa.UUID(), nullable=False, comment='ID CRM контакта'),
        sa.Column('icloud_contact_id', sa.UUID(), nullable=False, comment='ID iCloud контакта'),
        sa.Column('link_type', sa.Text(), nullable=False, comment="'auto', 'manual', 'phone_match', 'email_match'"),
        sa.Column('phone_norm', sa.Text(), nullable=True, comment='Нормализованный телефон, по которому было найдено совпадение (E.164)'),
        sa.Column('email_norm', sa.Text(), nullable=True, comment='Нормализованный email, по которому было найдено совпадение (lowercase)'),
        sa.Column('link_status', sa.Text(), nullable=False, server_default=sa.text("'active'"), comment="'active', 'conflict', 'resolved'"),
        sa.Column('confidence_score', sa.SmallInteger(), nullable=True, comment='Уровень уверенности в связывании (1-100, для автоматических связей)'),
        sa.Column('linked_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('linked_by', sa.UUID(), nullable=True, comment='ID пользователя, создавшего связь'),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['contact_id'], ['contacts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['icloud_contact_id'], ['icloud_contacts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['linked_by'], ['users.id']),
        sa.UniqueConstraint('contact_id', 'icloud_contact_id', name='uq_icloud_contact_links_contact_icloud'),
        comment='Связи между iCloud и CRM контактами'
    )

    # Индексы для icloud_accounts
    op.create_index('idx_icloud_accounts_ws', 'icloud_accounts', ['workspace_id'])
    op.create_index('idx_icloud_accounts_user', 'icloud_accounts', ['user_id'])
    op.create_index('idx_icloud_accounts_sync_enabled', 'icloud_accounts', ['sync_enabled'], postgresql_where=sa.text('sync_enabled = true'))

    # Индексы для icloud_contacts
    op.create_index('idx_icloud_contacts_ws', 'icloud_contacts', ['workspace_id'], postgresql_where=sa.text('deleted_at IS NULL'))
    op.create_index('idx_icloud_contacts_account', 'icloud_contacts', ['icloud_account_id'], postgresql_where=sa.text('deleted_at IS NULL'))
    op.create_index('idx_icloud_contacts_remote_uri', 'icloud_contacts', ['remote_uri'])
    # GIN индекс для триграммного поиска по display_name (требует расширение pg_trgm)
    op.execute("""
        CREATE INDEX idx_icloud_contacts_display_name 
        ON icloud_contacts USING GIN (display_name gin_trgm_ops) 
        WHERE deleted_at IS NULL
    """)
    op.create_index('idx_icloud_contacts_phones_norm', 'icloud_contacts', ['phones_normalized'], postgresql_using='gin', postgresql_where=sa.text('deleted_at IS NULL'))
    op.create_index('idx_icloud_contacts_emails_norm', 'icloud_contacts', ['emails_normalized'], postgresql_using='gin', postgresql_where=sa.text('deleted_at IS NULL'))
    op.create_index('idx_icloud_contacts_synced_at', 'icloud_contacts', ['last_synced_at'], postgresql_where=sa.text('deleted_at IS NULL'))

    # Индексы для icloud_contact_links
    op.create_index('idx_icloud_contact_links_contact', 'icloud_contact_links', ['contact_id'])
    op.create_index('idx_icloud_contact_links_icloud', 'icloud_contact_links', ['icloud_contact_id'])
    op.create_index('idx_icloud_contact_links_ws', 'icloud_contact_links', ['workspace_id'])
    # Индекс для быстрого поиска связей по нормализованному телефону
    op.create_index('idx_icloud_contact_links_phone_norm', 'icloud_contact_links', ['phone_norm'], postgresql_where=sa.text('phone_norm IS NOT NULL'))
    op.create_index('idx_icloud_contact_links_email_norm', 'icloud_contact_links', ['email_norm'], postgresql_where=sa.text('email_norm IS NOT NULL'))
    op.create_index('idx_icloud_contact_links_status', 'icloud_contact_links', ['link_status'])


def downgrade() -> None:
    # Удаление индексов
    op.drop_index('idx_icloud_contact_links_status', table_name='icloud_contact_links')
    op.drop_index('idx_icloud_contact_links_email_norm', table_name='icloud_contact_links')
    op.drop_index('idx_icloud_contact_links_phone_norm', table_name='icloud_contact_links')
    op.drop_index('idx_icloud_contact_links_ws', table_name='icloud_contact_links')
    op.drop_index('idx_icloud_contact_links_icloud', table_name='icloud_contact_links')
    op.drop_index('idx_icloud_contact_links_contact', table_name='icloud_contact_links')
    op.drop_index('idx_icloud_contacts_synced_at', table_name='icloud_contacts')
    op.drop_index('idx_icloud_contacts_emails_norm', table_name='icloud_contacts')
    op.drop_index('idx_icloud_contacts_phones_norm', table_name='icloud_contacts')
    op.drop_index('idx_icloud_contacts_display_name', table_name='icloud_contacts')
    op.drop_index('idx_icloud_contacts_remote_uri', table_name='icloud_contacts')
    op.drop_index('idx_icloud_contacts_account', table_name='icloud_contacts')
    op.drop_index('idx_icloud_contacts_ws', table_name='icloud_contacts')
    op.drop_index('idx_icloud_accounts_sync_enabled', table_name='icloud_accounts')
    op.drop_index('idx_icloud_accounts_user', table_name='icloud_accounts')
    op.drop_index('idx_icloud_accounts_ws', table_name='icloud_accounts')

    # Удаление таблиц (в обратном порядке из-за foreign keys)
    op.drop_table('icloud_contact_links')
    op.drop_table('icloud_contacts')
    op.drop_table('icloud_accounts')
