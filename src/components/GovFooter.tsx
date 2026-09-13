import {useLocale} from "../context/LocaleContext";
export default function GovFooter({onNavigate}:{onNavigate:(page:string)=>void}) {
  const {locale}=useLocale();const L=(en:string,hi:string)=>locale==="hi"?hi:en;
  return <footer className="bg-[var(--color-surface-2)] border-t border-[var(--color-border-subtle)] p-6"><div className="max-w-[1200px] mx-auto flex flex-wrap justify-between gap-5"><div><p className="font-semibold">Decypher by Epoch</p><p className="text-xs mt-2">{L("Fictional prototype • not an official government service.","काल्पनिक प्रदर्शन • आधिकारिक सरकारी सेवा नहीं।")}</p></div><nav aria-label={L("Footer links","फ़ुटर लिंक")} className="flex gap-4 flex-wrap">{[["about","About","परिचय"],["terms","Terms and disclaimer","शर्तें और अस्वीकरण"],["privacy","Privacy and accessibility","गोपनीयता और सुगम्यता"]].map(([page,en,hi])=><button key={page} className="text-xs underline" onClick={()=>onNavigate(page)}>{L(en,hi)}</button>)}</nav></div></footer>;
}
