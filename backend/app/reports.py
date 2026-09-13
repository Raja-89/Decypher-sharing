"""Readable bilingual report generation from the shared case snapshot."""
import io
import re
from html import escape
from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet,ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph,SimpleDocTemplate,Spacer,Table,TableStyle,CondPageBreak
from .snapshot import snapshot
from .presentation import localized

def report_text(value,hi=False):
    text=escape(str(value))
    # The Linux Devanagari face does not include Latin A-Z/a-z. Keep codes,
    # hashes and original source text in the Latin face; shape Hindi runs only.
    # Keep Hindi hyphenated words and their trailing punctuation in one face:
    # ReportLab 4.4 shapes a whole word with its first fragment's font.
    return re.sub(r"[\u0900-\u097f\u1cd0-\u1cff\ua8e0-\ua8ff\u200c-\u200d][\u0900-\u097f\u1cd0-\u1cff\ua8e0-\ua8ff\u200c-\u200d0-9.,;:!?()/\-]*",lambda m:'<font name="CaseReportHi">'+m.group(0)+"</font>",text) if hi else text

def pdf_report(db,case,locale):
    data=snapshot(db,case.id); hi=locale=="hi"; out=io.BytesIO()
    latin_candidates=["/Library/Fonts/Arial Unicode.ttf","/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]
    hindi_candidates=["/Library/Fonts/Arial Unicode.ttf","/usr/share/fonts/truetype/noto/NotoSansDevanagari-Regular.ttf"]
    latin_path=next((p for p in latin_candidates if Path(p).exists()),None)
    hindi_path=next((p for p in hindi_candidates if Path(p).exists()),None)
    styles=getSampleStyleSheet()
    # ReportLab does not replace an already registered dynamic font name.
    # A shared alias made Hindi jobs reuse the preceding English DejaVu face.
    if hi and not hindi_path:
        raise RuntimeError("Hindi PDF font unavailable; install fonts-noto-core.")
    for font_name,path in [("CaseReportEn",latin_path),("CaseReportHi",hindi_path if hi else None)]:
        if path and font_name not in pdfmetrics.getRegisteredFontNames():
            pdfmetrics.registerFont(TTFont(font_name,path))
    for style in styles.byName.values(): style.fontName="CaseReportEn" if latin_path else "Helvetica"; style.shaping=1
    styles["Heading2"].keepWithNext=False
    styles["BodyText"].fontSize=9;styles["BodyText"].leading=14
    cell=ParagraphStyle("CaseCell",parent=styles["BodyText"],fontSize=7,leading=11,wordWrap="CJK")
    heading_cell=ParagraphStyle("CaseHeadCell",parent=cell,textColor=colors.white)
    def p(value,style="BodyText"):return Paragraph(report_text(value,hi),styles[style])
    def L(en,hn):return hn if hi else en
    def H(*pairs):return [L(en,hn) for en,hn in pairs]
    def table(headers,rows):
        rows=[[localized(str(v),locale) for v in row] for row in rows]
        cells=[[Paragraph(report_text(v,hi),heading_cell) for v in headers]]+[[Paragraph(report_text(v,hi),cell) for v in row] for row in rows]
        result=Table(cells,colWidths=[174*mm/len(headers)]*len(headers),repeatRows=1,hAlign="LEFT")
        result.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),colors.HexColor("#172d61")),("GRID",(0,0),(-1,-1),.3,colors.HexColor("#cbd3df")),("VALIGN",(0,0),(-1,-1),"TOP"),("TOPPADDING",(0,0),(-1,-1),6),("BOTTOMPADDING",(0,0),(-1,-1),6)]))
        return result
    story=[p("Decypher by Epoch","Title"),p(case.title_hi if hi and case.title_hi else case.title,"Heading1"),p(case.id),p(L("Fictional prototype. Mandatory human review; no finding establishes guilt. Source text and identity codes are preserved verbatim.","काल्पनिक प्रदर्शन। मानव समीक्षा अनिवार्य है; कोई निष्कर्ष दोष सिद्ध नहीं करता। मूल स्रोत पाठ और पहचान कोड यथावत हैं।")),Spacer(1,10),p(L("Case summary","केस सारांश"),"Heading2"),p(case.description_hi if hi and case.description_hi else case.description)]
    sections=[
        (L("Evidence-backed relationships","साक्ष्य-समर्थित संबंध"),H(("Source","स्रोत"),("Type","प्रकार"),("Target","लक्ष्य"),("Evidence","साक्ष्य")),[[r["source"],r["type"]+f" ({r['confidence']:.0%})",r["target"],", ".join(r["evidenceIds"])] for r in data["edges"]]),
        (L("Timeline","घटनाक्रम"),H(("Timestamp","समय"),("Event","घटना"),("Evidence","साक्ष्य")),[[e["timestamp"],e["titleHi"] if hi and e["titleHi"] else e["title"],", ".join(e["evidenceIds"])] for e in data["timeline"]]),
        (L("Entities","इकाइयाँ"),H(("ID","ID"),("Name","नाम"),("Evidence","साक्ष्य")),[[n["id"],n["labelHi"] if hi and n["labelHi"] else n["label"],", ".join(n["evidenceIds"])] for n in data["nodes"]]),
        (L("Evidence register","साक्ष्य सूची"),H(("ID","ID"),("Name","नाम"),("SHA-256","SHA-256")),[[e["id"],e["name"],e["sha256"]] for e in data["evidence"]]),
        (L("Review alerts","समीक्षा संकेत"),H(("Title","शीर्षक"),("Reason","कारण"),("Evidence","साक्ष्य")),[[a["title"],a["reason"],", ".join(a["evidenceIds"])] for a in data["alerts"]]),
        (L("Chain of custody","अभिरक्षा इतिहास"),H(("Evidence","साक्ष्य"),("Timestamp","समय"),("Event","क्रिया"),("From / To","पूर्व / नया अभिरक्षक")),[[c["evidenceId"],c["timestamp"],c["event"],c["from"]+" / "+c["to"]] for c in data["custody"]]),
    ]
    for title,headers,rows in sections:
        story.extend([CondPageBreak(50*mm),Spacer(1,12),p(title,"Heading2"),table(headers,rows) if rows else p(L("No supported records yet.","अभी समर्थित रिकॉर्ड नहीं हैं।"))])
    story.extend([CondPageBreak(50*mm),Spacer(1,12),p(L("Blockchain verification","ब्लॉकचेन सत्यापन"),"Heading2"),p(L("Saved receipts below are not a fresh integrity check. Use Verify to rehash and query the live contract. Unanchored evidence remains NOT REGISTERED.","नीचे सहेजी रसीदें नया अखंडता परीक्षण नहीं हैं। फ़ाइल हैश और लाइव अनुबंध जाँचने के लिए सत्यापन करें। बिना रसीद साक्ष्य दर्ज नहीं है।"))])
    anchors={a["evidenceId"]:a for a in data["anchors"]}
    story.append(table(H(("Evidence","साक्ष्य"),("Saved receipt","सहेजी रसीद")),[[e["id"],f"Block {anchors[e['id']]['blockNumber']} / {anchors[e['id']]['transactionHash']}" if e["id"] in anchors else L("NOT REGISTERED","दर्ज नहीं")] for e in data["evidence"]]))
    def footer(canvas,doc):
        canvas.saveState();canvas.setFont("CaseReportEn" if latin_path else "Helvetica",8);canvas.setFillColor(colors.HexColor("#556078"));canvas.drawString(18*mm,10*mm,"Decypher by Epoch | Fictional demonstration");canvas.drawRightString(192*mm,10*mm,str(doc.page));canvas.restoreState()
    SimpleDocTemplate(out,pagesize=A4,leftMargin=18*mm,rightMargin=18*mm,topMargin=16*mm,bottomMargin=18*mm).build(story,onFirstPage=footer,onLaterPages=footer)
    return out.getvalue()
