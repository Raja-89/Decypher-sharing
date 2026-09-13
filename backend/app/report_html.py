from html import escape
from .snapshot import snapshot
from .presentation import localized

def build_report_html(db,case_id,locale="en"):
    data=snapshot(db,case_id); hi=locale=="hi"
    def h(value): return escape(localized(str(value),locale))
    def label(en,hn): return hn if hi else en
    def section(title,content): return f"<section><h2>{h(title)}</h2>{content}</section>"
    def table(headers,rows): return "<table><thead><tr>"+"".join(f"<th>{h(c)}</th>" for c in headers)+"</tr></thead><tbody>"+"".join("<tr>"+"".join(f"<td>{h(c)}</td>" for c in row)+"</tr>" for row in rows)+"</tbody></table>"
    case=data["case"]; title=case["title_hi"] if hi and case["title_hi"] else case["title"]
    body=f"<header><p>DECYPHER BY EPOCH</p><h1>{h(title)}</h1><p>{h(case_id)}</p></header>"
    body+=section(label("Case summary","केस सारांश"),f"<p>{h(case['description_hi'] if hi and case['description_hi'] else case['description'])}</p>")
    body+=section(label("Evidence-backed findings","साक्ष्य-समर्थित निष्कर्ष"),table([label("Source","स्रोत"),label("Relationship","संबंध"),label("Target","लक्ष्य"),label("Confidence","विश्वास"),label("Evidence","साक्ष्य")],[[r["source"],r["type"],r["target"],f"{r['confidence']:.0%}",", ".join(r["evidenceIds"])] for r in data["edges"]]))
    body+=section(label("Timeline","घटनाक्रम"),table([label("Timestamp","समय"),label("Event","घटना"),label("Evidence","साक्ष्य")],[[e["timestamp"],e["titleHi"] if hi and e["titleHi"] else e["title"],", ".join(e["evidenceIds"])] for e in data["timeline"]]))
    body+=section(label("Entities","इकाइयाँ"),table(["ID",label("Name","नाम"),label("Type","प्रकार"),label("Evidence","साक्ष्य")],[[n["id"],n["labelHi"] if hi and n["labelHi"] else n["label"],n["type"],", ".join(n["evidenceIds"])] for n in data["nodes"]]))
    body+=section(label("Evidence register","साक्ष्य सूची"),table(["ID",label("Name","नाम"),"SHA-256",label("Status","स्थिति")],[[e["id"],e["name"],e["sha256"],e["status"]] for e in data["evidence"]]))
    body+=section(label("Review alerts","समीक्षा संकेत"),table([label("Title","शीर्षक"),label("Reason","कारण"),label("Evidence","साक्ष्य")],[[a["title"],a["reason"],", ".join(a["evidenceIds"])] for a in data["alerts"]]))
    body+=section(label("Chain of custody","अभिरक्षा इतिहास"),table([label("Evidence","साक्ष्य"),label("Timestamp","समय"),label("Event","क्रिया"),label("From / To","से / तक")],[[c["evidenceId"],c["timestamp"],c["event"],c["from"]+" / "+c["to"]] for c in data["custody"]]))
    body+=section(label("Blockchain verification","ब्लॉकचेन सत्यापन"),f"<p>{h(label('Saved receipts are provenance records, not a fresh integrity check. Use Verify to query the live contract and rehash the file. Unanchored evidence is never presented as confirmed.','सहेजी रसीदें मूल रिकॉर्ड हैं, नया अखंडता परीक्षण नहीं। लाइव अनुबंध और फ़ाइल हैश जाँचने के लिए सत्यापन करें।'))}</p>"+table([label("Evidence","साक्ष्य"),label("Block","ब्लॉक"),label("Transaction","लेन-देन")],[[a["evidenceId"],a["blockNumber"],a["transactionHash"]] for a in data["anchors"]]))
    body+=f"<footer>{h(label('Fictional prototype. No finding establishes guilt. Human review is mandatory.','काल्पनिक प्रदर्शन। कोई निष्कर्ष दोष सिद्ध नहीं करता। मानव समीक्षा अनिवार्य है।'))}</footer>"
    return f'''<!doctype html><html lang="{locale}"><meta charset="utf-8"><title>{h(title)}</title><style>body{{font-family:Arial,sans-serif;color:#182641;margin:32px;line-height:1.5}}header{{border-bottom:4px solid #dba34e}}h1,h2{{color:#172d61}}section{{margin:24px 0}}table{{width:100%;border-collapse:collapse;table-layout:fixed;font-size:11px}}td,th{{border:1px solid #cbd3df;padding:7px;overflow-wrap:anywhere;text-align:left}}th{{background:#edf1f6}}footer{{margin-top:28px;border-top:1px solid #cbd3df;padding:16px}}@media print{{body{{margin:0}}thead{{display:table-header-group}}tr{{break-inside:avoid}}}}@page{{size:A4;margin:18mm}}</style>{body}</html>'''
