from alembic import op
from app.models import EvidenceCaseLink
revision="0003_evidence_case_links"
down_revision="0002_job_attempts"
branch_labels=None
depends_on=None
def upgrade(): EvidenceCaseLink.__table__.create(op.get_bind(),checkfirst=True)
def downgrade(): EvidenceCaseLink.__table__.drop(op.get_bind(),checkfirst=True)
