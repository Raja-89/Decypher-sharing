"""Add retry accounting to pre-existing prototype databases."""
from alembic import op
import sqlalchemy as sa
revision = "0002_job_attempts"
down_revision = "0001_initial"
branch_labels = None
depends_on = None

def upgrade():
    if "attempts" not in {c["name"] for c in sa.inspect(op.get_bind()).get_columns("processing_jobs")}:
        op.add_column("processing_jobs",sa.Column("attempts",sa.Integer(),nullable=False,server_default="0"))

def downgrade():
    op.drop_column("processing_jobs","attempts")
