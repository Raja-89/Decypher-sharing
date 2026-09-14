"""Render staged source assets and finalize hashes; never uses credentials/cloud."""
import argparse
import hashlib
import io
import json
import math
import struct
import subprocess
import wave
from pathlib import Path
from html import escape
from functools import partial

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas


def scene(asset, frame=0):
    image=Image.new("RGB",(800,450),(19,31,45));draw=ImageDraw.Draw(image)
    font=ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf",20)
    small=ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf",16)
    draw.rectangle((0,0,800,86),fill=(143,48,43))
    draw.text((20,12),"STAGED SYNTHETIC SCENE - NOT A REAL RECORDING",font=font,fill="white")
    draw.text((20,45),asset["caseTitle"],font=small,fill="white")
    draw.rectangle((410,135,760,320),fill=(58,76,88));draw.rectangle((455,178,712,320),fill=(28,43,53))
    draw.text((435,145),"Fictional receiving bay",font=small,fill="white")
    x=85+frame*3;draw.rounded_rectangle((x,250,x+235,320),radius=12,fill=(205,213,218))
    draw.rectangle((x+65,215,x+195,265),fill=(176,193,203));draw.rectangle((x+80,222,x+127,254),fill=(36,68,83))
    for cx in (x+48,x+187):draw.ellipse((cx-20,300,cx+20,340),fill=(13,18,24))
    draw.text((x+20,275),asset["vehicle"],font=small,fill=(15,31,45))
    draw.text((20,366),asset["location"],font=font,fill="white")
    draw.text((20,396),asset["timestamp"]+" | Occupant unknown",font=small,fill=(195,210,222))
    return image


def pdf_dossier(asset):
    output=io.BytesIO();styles=getSampleStyleSheet()
    if "SourceSans" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("SourceSans","/System/Library/Fonts/Supplemental/Arial.ttf"))
        pdfmetrics.registerFont(TTFont("SourceSansBold","/System/Library/Fonts/Supplemental/Arial Bold.ttf"))
    for name,style in styles.byName.items():style.fontName="SourceSansBold" if name.startswith("Heading") or name=="Title" else "SourceSans"
    doc=SimpleDocTemplate(output,pagesize=A4,leftMargin=20*mm,rightMargin=20*mm,topMargin=18*mm,bottomMargin=18*mm)
    paragraphs=[Paragraph("SYNTHETIC SOURCE RECORD - NOT AN OFFICIAL FIR",styles["Heading2"]),Paragraph(escape(asset["caseTitle"]),styles["Title"])]
    for title,text in [("Record identity",f"{asset['caseId']}<br/>{asset['recorded']}<br/>Collecting role: {escape(asset['lead'])}"),("Initial account",escape(asset["summary"])),("Unresolved source difference",escape(asset["conflict"])),("Next review",escape(asset["nextStep"])),("Supporting source IDs","<br/>".join(asset["sourceIds"])),("Limits","The accounts, persons and events are invented. The source describes alternatives, not a finding of guilt. A file hash establishes byte identity after intake, not the truth of an account.")]:
        paragraphs.extend([Spacer(1,8),Paragraph(title,styles["Heading2"]),Paragraph(text,styles["BodyText"])])
    def footer(canvas,_):
        canvas.saveState();canvas.setFillColor(colors.HexColor("#172d61"));canvas.setFont("SourceSans",9)
        canvas.drawString(20*mm,12*mm,"Decypher by Epoch | Fictional source review | Page 1")
        canvas.restoreState()
    doc.build(paragraphs,onFirstPage=footer,onLaterPages=footer,canvasmaker=partial(Canvas,invariant=1))
    return output.getvalue()


def finish(root, refresh_dossiers=False):
    root=Path(root).resolve();manifest_path=root/"manifest.json";manifest=json.loads(manifest_path.read_text())
    assert manifest.get("profile")=="realistic-v2" and manifest["fictional"] is True
    qa=root/"qa";qa.mkdir(exist_ok=True)
    for entry in manifest["evidence"]:
        if not entry.get("asset"):continue
        if refresh_dossiers and entry["asset"]["kind"]!="dossier":continue
        target=(root/entry["path"]).resolve()
        if not target.is_relative_to(root):raise ValueError("Refusing path escape")
        if target.exists() and (not refresh_dossiers or hashlib.sha256(target.read_bytes()).hexdigest()!=entry["sha256"]):raise ValueError("Refusing unrelated asset overwrite")
        asset=entry["asset"];kind=asset["kind"]
        if kind=="scene":
            output=io.BytesIO();scene(asset).save(output,format="PNG");payload=output.getvalue()
        elif kind=="audio":
            output=io.BytesIO();rate=16000
            with wave.open(output,"wb") as wav:
                wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(rate)
                wav.writeframes(b"".join(struct.pack("<h",int(6500*math.sin(2*math.pi*asset["frequency"]*t/rate))) for t in range(rate*3)))
            payload=output.getvalue()
        elif kind=="video":
            source=qa/f"{entry['id']}-frame.png";scene(asset).save(source)
            subprocess.run(["ffmpeg","-nostdin","-loglevel","error","-loop","1","-i",str(source),"-t","2","-r","10","-c:v","libx264","-pix_fmt","yuv420p","-metadata","creation_time=2026-08-01T00:00:00Z",str(target)],check=True)
            payload=target.read_bytes()
        elif kind=="dossier":payload=pdf_dossier(asset)
        else:raise ValueError("Unsupported staged source kind")
        if kind!="video":
            with target.open("wb" if refresh_dossiers else "xb") as output:output.write(payload)
        entry["sha256"]=hashlib.sha256(payload).hexdigest();entry["size"]=len(payload)
    manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n")
    print(json.dumps({"assetsFinished":10 if refresh_dossiers else 50,"totalEvidence":len(manifest["evidence"]),"cloudActions":0}))


if __name__=="__main__":
    parser=argparse.ArgumentParser();parser.add_argument("--bundle",required=True);parser.add_argument("--refresh-dossiers",action="store_true")
    args=parser.parse_args();finish(args.bundle,args.refresh_dossiers)
