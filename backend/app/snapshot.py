"""One case-scoped read model for the UI, reports and citation validation."""
from sqlalchemy import select
from datetime import timezone
from .models import Case,Evidence,EvidenceCaseLink,EvidenceEntity,Entity,Relationship,TimelineEvent,Alert,CustodyEvent,BlockchainAnchor,Report
from .schemas import CaseOut,EvidenceOut
def iso(stamp):
    return (stamp if stamp.tzinfo else stamp.replace(tzinfo=timezone.utc)).isoformat(timespec="seconds")

def case_evidence_query(case_id):
    shared=select(EvidenceCaseLink.evidence_id).where(EvidenceCaseLink.case_id==case_id)
    return select(Evidence).where((Evidence.case_id==case_id)|(Evidence.id.in_(shared)))

def snapshot(db,case_id):
    case=db.get(Case,case_id)
    if case is None: raise KeyError("Case was not found.")
    evidence=list(db.scalars(case_evidence_query(case_id).order_by(Evidence.created_at)))
    valid={e.id for e in evidence}
    rels=[r for r in db.scalars(select(Relationship).where(Relationship.case_id==case_id)) if r.evidence_ids and set(r.evidence_ids)<=valid]
    associations=list(db.scalars(select(EvidenceEntity).where(EvidenceEntity.evidence_id.in_(valid))))
    ids={n for r in rels for n in (r.source_id,r.target_id)}|{a.entity_id for a in associations}
    nodes=[{"id":n.id,"label":n.canonical_name,"labelHi":n.canonical_name_hi,"type":n.type,"properties":n.properties,"evidenceIds":sorted({a.evidence_id for a in associations if a.entity_id==n.id}|{e for r in rels if n.id in (r.source_id,r.target_id) for e in r.evidence_ids})} for n in db.scalars(select(Entity).where(Entity.id.in_(ids)))]
    return {
        "case":CaseOut.model_validate(case).model_dump(),
        "evidence":[EvidenceOut.model_validate(e).model_dump() for e in evidence],
        "nodes":nodes,
        "edges":[{"id":r.id,"source":r.source_id,"target":r.target_id,"type":r.type,"confidence":r.confidence,"evidenceIds":r.evidence_ids,"timestamp":iso(r.timestamp)} for r in rels],
        "timeline":[{"id":e.id,"timestamp":iso(e.timestamp),"type":e.type,"title":e.title,"titleHi":e.title_hi,"description":e.description,"entityIds":e.entity_ids,"evidenceIds":e.evidence_ids,"location":e.location,"confidence":e.confidence} for e in db.scalars(select(TimelineEvent).where(TimelineEvent.case_id==case_id).order_by(TimelineEvent.timestamp)) if e.evidence_ids and set(e.evidence_ids)<=valid],
        "alerts":[{"id":a.id,"title":a.title,"reason":a.reason,"confidence":a.confidence,"evidenceIds":a.evidence_ids,"status":a.status} for a in db.scalars(select(Alert).where(Alert.case_id==case_id)) if a.evidence_ids and set(a.evidence_ids)<=valid],
        "custody":[{"evidenceId":c.evidence_id,"event":c.event,"from":c.actor_from,"to":c.actor_to,"location":c.location,"notes":c.notes,"timestamp":iso(c.timestamp)} for c in db.scalars(select(CustodyEvent).where(CustodyEvent.evidence_id.in_(valid)).order_by(CustodyEvent.timestamp))],
        "anchors":[{"evidenceId":a.evidence_id,"contractAddress":a.contract_address,"transactionHash":a.transaction_hash,"blockNumber":a.block_number} for a in db.scalars(select(BlockchainAnchor).where(BlockchainAnchor.evidence_id.in_(valid)))],
        "reports":[{"id":r.id,"locale":r.locale,"createdAt":r.created_at.isoformat(),"downloadUrl":f"/api/v1/reports/{r.id}/download"} for r in db.scalars(select(Report).where(Report.case_id==case_id).order_by(Report.created_at.desc()))],
    }
