"""Build genuine synthetic story snapshots and bilingual report artifacts."""
import json
import os
import sys
import tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/"backend"))
build_dir=Path(tempfile.mkdtemp(prefix="decypher-showcase-"))
os.environ["DATABASE_URL"]=f"sqlite:///{build_dir/'story.db'}";os.environ["STORAGE_PROVIDER"]="filesystem";os.environ["STORAGE_PATH"]=str(build_dir/"objects")
from fastapi.encoders import jsonable_encoder
from app.database import Base,engine,SessionLocal
from app.seed import seed_demo
from app.models import Case
from app.snapshot import snapshot
from app.services import build_report_pdf
from app.report_html import build_report_html

Base.metadata.create_all(engine)
with SessionLocal() as db:
    seed_demo(db)
    for case_id,stem in [("CASE-2026-017","nightfall"),("CASE-X007","northbridge")]:
        data=snapshot(db,case_id);out=ROOT/"public"/"demo";out.mkdir(parents=True,exist_ok=True)
        (out/f"{stem}-snapshot.json").write_text(json.dumps(jsonable_encoder(data),ensure_ascii=False,indent=2))
        for locale in ("en","hi"):
            (out/f"{stem}-report-{locale}.pdf").write_bytes(build_report_pdf(db,db.get(Case,case_id),locale))
            (out/f"{stem}-report-{locale}.html").write_text(build_report_html(db,case_id,locale))
        print(f"Built {case_id}: {len(data['nodes'])} entities, {len(data['edges'])} evidence-backed relationships")
