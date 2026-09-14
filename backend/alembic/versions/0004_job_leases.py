"""Fence renewable job leases, including object-cleanup intents."""
from alembic import op
import sqlalchemy as sa

revision = "0004_job_leases"
down_revision = "0003_evidence_case_links"
branch_labels = None
depends_on = None


def upgrade():
    columns = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("processing_jobs")}
    if "lease_token" not in columns:
        op.add_column("processing_jobs", sa.Column("lease_token", sa.String(64), nullable=False, server_default=""))


def downgrade():
    op.drop_column("processing_jobs", "lease_token")
