"""Create offline read-model/HTML previews in a disposable local database."""
import argparse
import json
import os
import sys
import tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument("--bundle",required=True)
args=parser.parse_args();bundle=Path(args.bundle).resolve()
preview=bundle/"previews"
if preview.exists():raise ValueError("Refusing preview overwrite")
with tempfile.TemporaryDirectory(prefix="decypher-rich-preview-") as scratch:
    os.environ["DATABASE_URL"]=f"sqlite:///{scratch}/preview.db"
    os.environ["STORAGE_PROVIDER"]="filesystem";os.environ["STORAGE_PATH"]=f"{scratch}/objects"
    sys.path.insert(0,str(ROOT/"backend"))
    from fastapi.encoders import jsonable_encoder
    from app.database import Base,engine,SessionLocal
    from app.seed import seed_demo
    from app.demo_bundle import import_bundle,validate_bundle
    from app.snapshot import snapshot
    from app.report_html import build_report_html
    from app.services import copilot_answer
    Base.metadata.create_all(engine)
    manifest,counts=validate_bundle(bundle)
    with SessionLocal() as db:
        seed_demo(db);import_bundle(db,bundle)
        preview.mkdir()
        coverage=[];answers=[]
        for case in manifest["cases"]:
            data=snapshot(db,case["id"])
            (preview/f"{case['id']}.json").write_text(json.dumps(jsonable_encoder(data),ensure_ascii=False,indent=2))
            for locale in ("en","hi"):
                (preview/f"{case['id']}-report-{locale}.html").write_text(build_report_html(db,case["id"],locale))
                answers.append({"case_id":case["id"],"locale":locale,"question":f"What evidence mentions {case['cast'][0]}?",**copilot_answer(db,case["id"],f"What evidence mentions {case['cast'][0]}?",locale)})
            coverage.append({"case_id":case["id"],"evidence":len(data["evidence"]),"entities":len(data["nodes"]),"relationships":len(data["edges"]),"timeline":len(data["timeline"]),"mapEvents":sum(bool(e["location"]) for e in data["timeline"]),"alerts":len(data["alerts"]),"custody":len(data["custody"]),"anchors":len(data["anchors"]),"savedReports":len(data["reports"])})
        (preview/"coverage.json").write_text(json.dumps(coverage,indent=2))
        (preview/"copilot-examples.json").write_text(json.dumps(answers,ensure_ascii=False,indent=2))
        print(json.dumps({**counts,"previewCases":10,"htmlReports":20,"realBlockchainAnchors":0,"liveDatabaseWrites":0}))
    engine.dispose()
