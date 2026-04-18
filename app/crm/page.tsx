'use client'

import { useState, useEffect, useCallback } from 'react'
import { kvGet, kvSet } from '@/lib/supabase'

const C = {
  bg:'#07101F', card:'#0D1B2E', border:'#1B2D45',
  accent:'#22D3EE', accent2:'#818CF8', text:'#E8F0FE',
  muted:'#4E6A8A', success:'#10B981', danger:'#EF4444',
  warning:'#F59E0B', orange:'#F97316', pink:'#F472B6',
}

const STAGES = ['New Lead','Audited','Contacted','In Conversation','Proposal Sent','Closed/Won','Lost']
const NICHES = ['HVAC','Dentist','Salon','Plumber','Therapist','Contractor','Auto Repair','Landscaping','Restaurant','Other']
const SERVICES = ['Google Maps Optimization','Google Maps Post Automation','Google Reviews Management','Local Listing Syndication','AI Digital Marketing','Full Package']

const STAGE_META: Record<string, {color:string,bg:string,icon:string}> = {
  'New Lead':        {color:'#818CF8',bg:'rgba(129,140,248,0.15)',icon:'🎯'},
  'Audited':         {color:'#C084FC',bg:'rgba(192,132,252,0.15)',icon:'📊'},
  'Contacted':       {color:'#FCD34D',bg:'rgba(252,211,77,0.15)', icon:'📧'},
  'In Conversation': {color:'#34D399',bg:'rgba(52,211,153,0.15)', icon:'💬'},
  'Proposal Sent':   {color:'#60A5FA',bg:'rgba(96,165,250,0.15)', icon:'📋'},
  'Closed/Won':      {color:'#10B981',bg:'rgba(16,185,129,0.15)', icon:'✅'},
  'Lost':            {color:'#6B7280',bg:'rgba(107,114,128,0.15)',icon:'❌'},
}

interface Prospect {
  id:string; businessName:string; ownerName:string; niche:string;
  city:string; phone:string; email:string; mapsRank:string; auditScore:string;
  stage:string; notes:string; dateAdded:string; lastContact:string;
  contacts:any[]; script:string; followUp:string;
}
interface Client {
  id:string; businessName:string; ownerName:string; service:string;
  monthlyValue:string; startDate:string; nextAction:string; notes:string;
  phone:string; email:string;
}

const mkProspect = (): Prospect => ({
  id:Date.now().toString(), businessName:'', ownerName:'', niche:'HVAC',
  city:'', phone:'', email:'', mapsRank:'', auditScore:'',
  stage:'New Lead', notes:'', dateAdded:new Date().toISOString().split('T')[0],
  lastContact:'', contacts:[], script:'', followUp:'',
})
const mkClient = (): Client => ({
  id:Date.now().toString(), businessName:'', ownerName:'', service:'Google Maps Optimization',
  monthlyValue:'', startDate:new Date().toISOString().split('T')[0],
  nextAction:'', notes:'', phone:'', email:'',
})

const IS: React.CSSProperties = {background:C.bg,color:C.text,border:`1px solid ${C.border}`,borderRadius:6,padding:'9px 12px',width:'100%',fontFamily:"'DM Sans',sans-serif",fontSize:13,outline:'none'}
const Label = ({c}:{c:string}) => <div style={{fontSize:10,color:C.muted,marginBottom:4,letterSpacing:'0.1em',fontWeight:600}}>{c}</div>
const Chip = ({label,color,bg}:{label:string,color:string,bg:string}) => <span style={{background:bg,color,borderRadius:20,padding:'3px 10px',fontSize:11,fontWeight:600,whiteSpace:'nowrap'}}>{label}</span>

const callClaude = async (prompt: string) => {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:1000,
      system:'You are a local business outreach expert. Respond with valid JSON only.',
      messages:[{role:'user',content:prompt}] })
  })
  const data = await res.json()
  const raw = data.content?.find((b:any)=>b.type==='text')?.text||'{}'
  return JSON.parse(raw.replace(/```json|```/g,'').trim())
}

export default function CRMPage() {
  const [tab, setTab] = useState('dashboard')
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [twilio, setTwilio] = useState({accountSid:'',authToken:'',fromNumber:''})
  const [loaded, setLoaded] = useState(false)
  const [modal, setModal] = useState<string|null>(null)
  const [form, setForm] = useState<any>({})
  const [filterStage, setFilterStage] = useState('All')
  const [search, setSearch] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<any>(null)
  const [outFilter, setOutFilter] = useState('All')
  const [scriptLoading, setScriptLoading] = useState<Record<string,boolean>>({})
  const [expandedScript, setExpandedScript] = useState<Record<string,boolean>>({})
  const [smsLoading, setSmsLoading] = useState<Record<string,boolean>>({})
  const [logTarget, setLogTarget] = useState<Prospect|null>(null)
  const [logNote, setLogNote] = useState('')
  const [logType, setLogType] = useState('call')

  const loadData = useCallback(async () => {
    try { const r = await kvGet('pivo-prospects'); if(r) setProspects(JSON.parse(r)) } catch {}
    try { const r = await kvGet('pivo-clients'); if(r) setClients(JSON.parse(r)) } catch {}
    try { const r = await kvGet('pivo-twilio'); if(r) setTwilio(JSON.parse(r)) } catch {}
    setLoaded(true)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const saveP = async (data: Prospect[]) => { setProspects(data); await kvSet('pivo-prospects', JSON.stringify(data)) }
  const saveC = async (data: Client[]) => { setClients(data); await kvSet('pivo-clients', JSON.stringify(data)) }
  const saveT = async (data: any) => { setTwilio(data); await kvSet('pivo-twilio', JSON.stringify(data)) }

  const openModal = (type: string, data: any = null) => {
    setForm(data ? {...data} : (type==='prospect' ? mkProspect() : mkClient()))
    setModal(type)
  }

  const saveForm = async () => {
    if (!form.businessName?.trim()) return
    if (modal==='prospect') {
      const exists = prospects.find(p=>p.id===form.id)
      await saveP(exists ? prospects.map(p=>p.id===form.id?form:p) : [...prospects,form])
    } else {
      const exists = clients.find(c=>c.id===form.id)
      await saveC(exists ? clients.map(c=>c.id===form.id?form:c) : [...clients,form])
    }
    setModal(null)
  }

  const advanceStage = async (prospect: Prospect) => {
    const idx = STAGES.indexOf(prospect.stage)
    if (idx < STAGES.length-2) {
      await saveP(prospects.map(p=>p.id===prospect.id
        ? {...p,stage:STAGES[idx+1],lastContact:new Date().toISOString().split('T')[0]}
        : p))
    }
  }

  const doDelete = async () => {
    if (!confirmDelete) return
    if (confirmDelete.type==='prospect') await saveP(prospects.filter(p=>p.id!==confirmDelete.id))
    else await saveC(clients.filter(c=>c.id!==confirmDelete.id))
    setConfirmDelete(null)
  }

  const logContact = async () => {
    if (!logTarget) return
    const entry = {date:new Date().toISOString().split('T')[0],type:logType,note:logNote}
    await saveP(prospects.map(p=>p.id===logTarget.id
      ? {...p,lastContact:entry.date,contacts:[entry,...(p.contacts||[])]}
      : p))
    setModal(null); setLogNote(''); setLogTarget(null)
  }

  const genScript = async (prospect: Prospect) => {
    setScriptLoading(s=>({...s,[prospect.id]:true}))
    try {
      const r = await callClaude(`Write a personalized cold outreach SMS for:
Sender: Pivo Web — Google Maps Optimization, West Jordan Utah
Prospect: ${prospect.businessName}, ${prospect.niche} in ${prospect.city||'Utah'}
${prospect.mapsRank?`Maps rank: #${prospect.mapsRank}`:''}
Rules: 60-90 words, mention city naturally, offer free GBP audit, human tone, one CTA.
Also write a 2-sentence follow-up for 3 days later.
Return: {"script":"...","followUp":"..."}`)
      await saveP(prospects.map(p=>p.id===prospect.id?{...p,script:r.script||'',followUp:r.followUp||''}:p))
      setExpandedScript(s=>({...s,[prospect.id]:true}))
    } catch {}
    setScriptLoading(s=>({...s,[prospect.id]:false}))
  }

  const clickToText = async (prospect: Prospect) => {
    let msg = prospect.script
    if (!msg) {
      setSmsLoading(s=>({...s,[prospect.id]:true}))
      try {
        const r = await callClaude(`Write a 60-90 word outreach SMS: Pivo Web → ${prospect.businessName}, ${prospect.niche} in ${prospect.city||'Utah'}. Offer free GBP audit. Human tone. Return: {"script":"..."}`)
        msg = r.script||''
        await saveP(prospects.map(p=>p.id===prospect.id?{...p,script:msg}:p))
      } catch {}
      setSmsLoading(s=>({...s,[prospect.id]:false}))
    }
    if (msg) window.location.href = `sms:${prospect.phone}?body=${encodeURIComponent(msg)}`
  }

  const sendAutoSMS = async (prospect: Prospect) => {
    if (!prospect.phone || !prospect.script) return
    try {
      const res = await fetch('/api/send-sms', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({to:prospect.phone, body:prospect.script})
      })
      const data = await res.json()
      if (data.success) {
        alert(`✅ SMS sent to ${prospect.phone}!\nSID: ${data.messageSid}`)
        const entry = {date:new Date().toISOString().split('T')[0],type:'text',note:'Auto-SMS sent via Twilio'}
        await saveP(prospects.map(p=>p.id===prospect.id?{...p,lastContact:entry.date,contacts:[entry,...(p.contacts||[])]}:p))
      } else {
        alert(`❌ Failed: ${data.error}`)
      }
    } catch(e:any) { alert(`❌ Error: ${e.message}`) }
  }

  const twilioReady = twilio.accountSid && twilio.authToken && twilio.fromNumber
  const totalRevenue = clients.reduce((s,c)=>s+(parseFloat(c.monthlyValue)||0),0)
  const hotLeads = prospects.filter(p=>['In Conversation','Proposal Sent'].includes(p.stage)).length
  const activeP = prospects.filter(p=>!['Closed/Won','Lost'].includes(p.stage))
  const outreachReady = prospects.filter(p=>p.phone&&!['Closed/Won','Lost'].includes(p.stage))

  const filteredP = prospects.filter(p => {
    const ms = filterStage==='All'||p.stage===filterStage
    const mq = !search||[p.businessName,p.city,p.niche].some(f=>f?.toLowerCase().includes(search.toLowerCase()))
    return ms&&mq
  })

  const filteredOut = outreachReady.filter(p => {
    if (outFilter==='Not Contacted') return !p.lastContact
    if (outFilter==='Follow Up') return p.lastContact&&(new Date().getTime()-new Date(p.lastContact).getTime())/86400000>3
    return true
  })

  if (!loaded) return (
    <div style={{background:C.bg,minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',color:C.accent,fontFamily:"'DM Sans',sans-serif",fontSize:14}}>
      Loading Pivo CRM...
    </div>
  )

  const TABS = [
    {key:'dashboard',label:'Dashboard',badge:0},
    {key:'prospects',label:'Prospects',badge:activeP.length},
    {key:'clients',label:'Clients',badge:clients.length},
    {key:'outreach',label:'📱 Outreach',badge:outreachReady.length},
  ]

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@300;400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:${C.bg}}::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px}
        .pi{background:${C.bg}!important;color:${C.text}!important;border:1px solid ${C.border}!important;border-radius:6px!important;padding:9px 12px!important;width:100%!important;font-family:'DM Sans',sans-serif!important;font-size:13px!important;outline:none!important}
        .pi:focus{border-color:${C.accent}!important}.pi::placeholder{color:${C.muted}!important}
        select.pi option{background:${C.card};color:${C.text}}
        .card{background:${C.card};border:1px solid ${C.border};border-radius:12px;padding:15px;transition:border-color 0.2s}
        .card:hover{border-color:rgba(34,211,238,0.22)}
        .ab{border:none;border-radius:7px;padding:7px 13px;cursor:pointer;font-size:13px;font-weight:600;font-family:'DM Sans',sans-serif;transition:opacity 0.15s;display:inline-flex;align-items:center;gap:5px}
        .ab:hover{opacity:0.85}.ab:disabled{cursor:not-allowed;opacity:0.45}
      `}</style>

      <div style={{background:C.bg,minHeight:'100vh',color:C.text,fontFamily:"'DM Sans',sans-serif",fontSize:14}}>

        {/* HEADER */}
        <div style={{background:C.card,borderBottom:`1px solid ${C.border}`,padding:'13px 18px',display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:50}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{width:34,height:34,borderRadius:9,background:`linear-gradient(135deg,${C.accent},${C.accent2})`,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:15,color:'#07101F'}}>P</div>
            <div>
              <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:14,letterSpacing:'0.08em'}}>PIVO WEB</div>
              <div style={{color:C.muted,fontSize:10,letterSpacing:'0.14em'}}>CLIENT COMMAND</div>
            </div>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <div style={{display:'flex',alignItems:'center',gap:5}}>
              <div style={{width:7,height:7,borderRadius:'50%',background:twilioReady?C.success:C.border}}/>
              <span style={{color:C.muted,fontSize:11}}>SMS {twilioReady?'ON':'OFF'}</span>
            </div>
            <button onClick={()=>setModal('twilio')} style={{background:'transparent',border:`1px solid ${C.border}`,color:C.muted,borderRadius:6,padding:'4px 10px',cursor:'pointer',fontSize:11,fontFamily:"'DM Sans',sans-serif"}}>⚙ Twilio</button>
          </div>
        </div>

        {/* TABS */}
        <div style={{background:C.card,borderBottom:`1px solid ${C.border}`,display:'flex',overflowX:'auto',padding:'0 14px'}}>
          {TABS.map(t=>(
            <button key={t.key} onClick={()=>setTab(t.key)} style={{padding:'11px 15px',border:'none',background:'transparent',cursor:'pointer',color:tab===t.key?C.accent:C.muted,borderBottom:tab===t.key?`2px solid ${C.accent}`:'2px solid transparent',fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:500,whiteSpace:'nowrap',display:'flex',alignItems:'center',gap:6}}>
              {t.label}
              {t.badge>0&&<span style={{background:tab===t.key?C.accent:C.border,color:tab===t.key?'#07101F':C.muted,borderRadius:10,padding:'1px 7px',fontSize:11,fontWeight:700}}>{t.badge}</span>}
            </button>
          ))}
        </div>

        <div style={{padding:'18px 14px',maxWidth:960,margin:'0 auto'}}>

          {/* DASHBOARD */}
          {tab==='dashboard'&&(
            <div style={{display:'flex',flexDirection:'column',gap:14}}>
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
                {[
                  {label:'Prospects',value:prospects.length,color:C.accent2,sub:'tracked'},
                  {label:'Hot Leads',value:hotLeads,color:C.warning,sub:'active now'},
                  {label:'Clients',value:clients.length,color:C.success,sub:'paying'},
                  {label:'MRR',value:`$${totalRevenue.toLocaleString()}`,color:C.accent,sub:'recurring'},
                ].map(s=>(
                  <div key={s.label} className="card" style={{textAlign:'center',padding:'16px 10px'}}>
                    <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:26,color:s.color,lineHeight:1}}>{s.value}</div>
                    <div style={{fontSize:11,color:C.text,fontWeight:600,marginTop:5}}>{s.label}</div>
                    <div style={{fontSize:10,color:C.muted,marginTop:2}}>{s.sub}</div>
                  </div>
                ))}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div className="card">
                  <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:11,color:C.muted,letterSpacing:'0.1em',marginBottom:12}}>PIPELINE</div>
                  {STAGES.filter(s=>s!=='Lost').map(stage=>{
                    const cnt=prospects.filter(p=>p.stage===stage).length
                    const pct=prospects.length?(cnt/prospects.length)*100:0
                    const m=STAGE_META[stage]
                    return(
                      <div key={stage} style={{display:'flex',alignItems:'center',gap:8,marginBottom:7}}>
                        <div style={{width:100,fontSize:11,color:C.muted,textAlign:'right',flexShrink:0}}>{stage}</div>
                        <div style={{flex:1,height:6,background:'rgba(255,255,255,0.05)',borderRadius:3,overflow:'hidden'}}>
                          <div style={{width:`${pct}%`,height:'100%',background:m.color,borderRadius:3,minWidth:cnt>0?4:0}}/>
                        </div>
                        <div style={{width:16,fontSize:12,fontWeight:700,color:m.color,textAlign:'right',flexShrink:0}}>{cnt}</div>
                      </div>
                    )
                  })}
                </div>
                <div className="card">
                  <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:11,color:C.muted,letterSpacing:'0.1em',marginBottom:12}}>RECENT PROSPECTS</div>
                  {prospects.length===0
                    ?<div style={{color:C.muted,fontSize:13,textAlign:'center',padding:'12px 0'}}>No prospects yet.</div>
                    :prospects.slice(-5).reverse().map(p=>{
                      const m=STAGE_META[p.stage]||STAGE_META['New Lead']
                      return(
                        <div key={p.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'7px 0',borderBottom:`1px solid ${C.border}`}}>
                          <div style={{minWidth:0}}>
                            <div style={{fontSize:13,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.businessName||'Unnamed'}</div>
                            <div style={{fontSize:11,color:C.muted}}>{p.niche} · {p.city||'—'}</div>
                          </div>
                          <Chip label={`${m.icon} ${p.stage}`} color={m.color} bg={m.bg}/>
                        </div>
                      )
                    })
                  }
                </div>
              </div>
            </div>
          )}

          {/* PROSPECTS */}
          {tab==='prospects'&&(
            <div>
              <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap',alignItems:'center'}}>
                <input className="pi" placeholder="🔍 Search..." value={search} onChange={e=>setSearch(e.target.value)} style={{width:170}}/>
                <div style={{display:'flex',gap:5,flex:1,flexWrap:'wrap'}}>
                  {['All',...STAGES].map(s=>{
                    const cnt=s==='All'?prospects.length:prospects.filter(p=>p.stage===s).length
                    const m=STAGE_META[s];const active=filterStage===s
                    return<button key={s} onClick={()=>setFilterStage(s)} style={{padding:'4px 11px',borderRadius:20,fontSize:11,fontWeight:600,cursor:'pointer',border:`1px solid ${active?(m?.color||C.accent):C.border}`,background:active?(m?.bg||'rgba(34,211,238,0.12)'):'transparent',color:active?(m?.color||C.accent):C.muted,fontFamily:"'DM Sans',sans-serif"}}>{s==='All'?`All ${cnt}`:`${s} ${cnt}`}</button>
                  })}
                </div>
                <button onClick={()=>openModal('prospect')} style={{background:`linear-gradient(135deg,${C.accent},${C.accent2})`,color:'#07101F',border:'none',borderRadius:8,padding:'8px 14px',cursor:'pointer',fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:12,whiteSpace:'nowrap'}}>+ Add</button>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:7}}>
                {filteredP.length===0&&<div className="card" style={{textAlign:'center',padding:'32px 20px',color:C.muted}}>{prospects.length===0?'No prospects yet.':'No matches.'}</div>}
                {filteredP.map(p=>{
                  const m=STAGE_META[p.stage]||STAGE_META['New Lead']
                  return(
                    <div key={p.id} className="card" style={{display:'flex',alignItems:'center',gap:11}}>
                      <div style={{width:38,height:38,borderRadius:8,background:'rgba(34,211,238,0.08)',border:`1px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:800,color:C.accent,flexShrink:0}}>{p.niche.substring(0,5).toUpperCase()}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:600,fontSize:14,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.businessName||'Unnamed'}</div>
                        <div style={{fontSize:11,color:C.muted}}>{[p.city,p.ownerName,p.phone].filter(Boolean).join(' · ')||'—'}</div>
                      </div>
                      {p.auditScore&&<div style={{textAlign:'center',flexShrink:0}}><div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:15,color:C.accent}}>{p.auditScore}</div><div style={{fontSize:9,color:C.muted}}>AUDIT</div></div>}
                      {p.mapsRank&&<div style={{textAlign:'center',flexShrink:0}}><div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:15,color:C.warning}}>#{p.mapsRank}</div><div style={{fontSize:9,color:C.muted}}>MAPS</div></div>}
                      <Chip label={`${m.icon} ${p.stage}`} color={m.color} bg={m.bg}/>
                      <div style={{display:'flex',gap:5,flexShrink:0,flexWrap:'wrap',justifyContent:'flex-end'}}>
                        {p.phone&&<><a href={`tel:${p.phone}`} className="ab" style={{background:'rgba(16,185,129,0.12)',color:C.success,border:`1px solid rgba(16,185,129,0.3)`,textDecoration:'none',padding:'5px 9px'}} title="Call">📞</a>
                        <button className="ab" onClick={()=>clickToText(p)} style={{background:'rgba(34,211,238,0.1)',color:C.accent,border:`1px solid rgba(34,211,238,0.3)`,padding:'5px 9px'}} title="Text">{smsLoading[p.id]?'⟳':'💬'}</button></>}
                        {!['Closed/Won','Lost'].includes(p.stage)&&<button className="ab" onClick={()=>advanceStage(p)} style={{background:'rgba(34,211,238,0.08)',color:C.accent,border:`1px solid ${C.border}`,padding:'5px 9px'}}>→</button>}
                        <button className="ab" onClick={()=>openModal('prospect',p)} style={{background:C.border,color:C.muted,padding:'5px 9px'}}>Edit</button>
                        <button className="ab" onClick={()=>setConfirmDelete({type:'prospect',id:p.id,name:p.businessName})} style={{background:'rgba(239,68,68,0.08)',color:C.danger,border:'1px solid rgba(239,68,68,0.25)',padding:'5px 9px'}}>✕</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* CLIENTS */}
          {tab==='clients'&&(
            <div>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:15}}>{clients.length} Client{clients.length!==1?'s':''}{totalRevenue>0&&<span style={{color:C.success}}> · ${totalRevenue.toLocaleString()}/mo</span>}</div>
                <button onClick={()=>openModal('client')} style={{background:`linear-gradient(135deg,${C.success},#059669)`,color:'white',border:'none',borderRadius:8,padding:'8px 14px',cursor:'pointer',fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:12}}>+ Add Client</button>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(275px,1fr))',gap:12}}>
                {clients.length===0&&<div className="card" style={{textAlign:'center',padding:'32px 20px',color:C.muted,gridColumn:'1/-1'}}>No clients yet.</div>}
                {clients.map(c=>(
                  <div key={c.id} className="card" style={{display:'flex',flexDirection:'column',gap:10}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                      <div style={{minWidth:0}}><div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:14,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.businessName}</div>{c.ownerName&&<div style={{color:C.muted,fontSize:12,marginTop:1}}>{c.ownerName}</div>}</div>
                      <div style={{textAlign:'right',flexShrink:0,marginLeft:8}}><div style={{color:C.success,fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:17}}>${parseFloat(c.monthlyValue||'0').toLocaleString()}</div><div style={{fontSize:10,color:C.muted}}>per month</div></div>
                    </div>
                    <div style={{fontSize:12,color:C.muted,display:'flex',flexDirection:'column',gap:4}}>
                      <div>📋 <span style={{color:C.text}}>{c.service}</span></div>
                      {c.startDate&&<div>📅 Since {c.startDate}</div>}
                      {c.phone&&<div>📞 <a href={`tel:${c.phone}`} style={{color:C.accent,textDecoration:'none'}}>{c.phone}</a></div>}
                      {c.nextAction&&<div style={{color:C.warning}}>⚡ {c.nextAction}</div>}
                    </div>
                    <div style={{display:'flex',gap:7}}>
                      <button onClick={()=>openModal('client',c)} style={{flex:1,background:C.border,border:'none',color:C.muted,borderRadius:6,padding:7,cursor:'pointer',fontSize:12}}>Edit</button>
                      <button onClick={()=>setConfirmDelete({type:'client',id:c.id,name:c.businessName})} style={{background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.25)',color:C.danger,borderRadius:6,padding:'7px 10px',cursor:'pointer',fontSize:12}}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* OUTREACH */}
          {tab==='outreach'&&(
            <div>
              <div style={{background:twilioReady?'rgba(16,185,129,0.07)':'rgba(245,158,11,0.07)',border:`1px solid ${twilioReady?'rgba(16,185,129,0.28)':'rgba(245,158,11,0.28)'}`,borderRadius:10,padding:'11px 15px',marginBottom:14,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:twilioReady?C.success:C.warning}}>{twilioReady?'✅ Twilio Auto-SMS Active':'⚠️ Twilio Not Configured'}</div>
                  <div style={{fontSize:11,color:C.muted,marginTop:1}}>{twilioReady?`Sending from ${twilio.fromNumber}`:'Configure Twilio to enable auto-sending.'}</div>
                </div>
                <button onClick={()=>setModal('twilio')} style={{background:twilioReady?'rgba(16,185,129,0.14)':'rgba(245,158,11,0.14)',border:`1px solid ${twilioReady?'rgba(16,185,129,0.4)':'rgba(245,158,11,0.4)'}`,color:twilioReady?C.success:C.warning,borderRadius:7,padding:'6px 12px',cursor:'pointer',fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:12,whiteSpace:'nowrap'}}>{twilioReady?'Manage':'+ Configure'}</button>
              </div>
              <div style={{display:'flex',gap:7,marginBottom:12}}>
                {['All','Not Contacted','Follow Up'].map(f=>(
                  <button key={f} onClick={()=>setOutFilter(f)} style={{padding:'5px 13px',borderRadius:20,fontSize:12,fontWeight:600,cursor:'pointer',border:`1px solid ${outFilter===f?C.accent:C.border}`,background:outFilter===f?'rgba(34,211,238,0.12)':'transparent',color:outFilter===f?C.accent:C.muted,fontFamily:"'DM Sans',sans-serif"}}>{f}</button>
                ))}
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                {filteredOut.length===0&&<div className="card" style={{textAlign:'center',padding:'32px 20px',color:C.muted}}>{outreachReady.length===0?'Add phone numbers to prospects to unlock outreach.':'No prospects match this filter.'}</div>}
                {filteredOut.map(p=>{
                  const m=STAGE_META[p.stage]||STAGE_META['New Lead']
                  const daysSince=p.lastContact?Math.floor((new Date().getTime()-new Date(p.lastContact).getTime())/86400000):null
                  const showScript=expandedScript[p.id]
                  return(
                    <div key={p.id} className="card">
                      <div style={{display:'flex',alignItems:'flex-start',gap:11,marginBottom:10}}>
                        <div style={{width:38,height:38,borderRadius:8,background:'rgba(34,211,238,0.08)',border:`1px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:800,color:C.accent,flexShrink:0}}>{p.niche.substring(0,5).toUpperCase()}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:600,fontSize:14}}>{p.businessName}</div>
                          <div style={{fontSize:12,color:C.muted,marginTop:1}}>{[p.city,p.ownerName].filter(Boolean).join(' · ')}</div>
                        </div>
                        <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4,flexShrink:0}}>
                          <Chip label={`${m.icon} ${p.stage}`} color={m.color} bg={m.bg}/>
                          <span style={{fontSize:10,color:daysSince!==null&&daysSince>3?C.orange:C.muted}}>{daysSince===null?'Not yet contacted':daysSince===0?'Contacted today':`${daysSince}d ago`}</span>
                        </div>
                      </div>
                      <div style={{fontSize:13,marginBottom:11}}>
                        📞 <a href={`tel:${p.phone}`} style={{color:C.accent,textDecoration:'none',fontWeight:600}}>{p.phone}</a>
                        {p.mapsRank&&<span style={{marginLeft:12,color:C.warning,fontSize:12}}>Maps #{p.mapsRank}</span>}
                        {p.auditScore&&<span style={{marginLeft:10,color:C.accent2,fontSize:12}}>Audit: {p.auditScore}</span>}
                      </div>
                      <div style={{display:'flex',gap:7,flexWrap:'wrap'}}>
                        <a href={`tel:${p.phone}`} className="ab" style={{background:'rgba(16,185,129,0.12)',color:C.success,border:`1px solid rgba(16,185,129,0.3)`,textDecoration:'none'}}>📞 Call</a>
                        <button className="ab" onClick={()=>clickToText(p)} disabled={smsLoading[p.id]} style={{background:'rgba(34,211,238,0.1)',color:C.accent,border:`1px solid rgba(34,211,238,0.3)`}}>{smsLoading[p.id]?'⟳ Writing...':'💬 Text'}</button>
                        <button className="ab" onClick={()=>genScript(p)} disabled={scriptLoading[p.id]} style={{background:'rgba(129,140,248,0.1)',color:C.accent2,border:`1px solid rgba(129,140,248,0.3)`}}>{scriptLoading[p.id]?'⟳ Writing...':'🤖 AI Script'}</button>
                        <button className="ab" onClick={()=>{setLogTarget(p);setModal('log')}} style={{background:'rgba(245,158,11,0.1)',color:C.warning,border:`1px solid rgba(245,158,11,0.3)`}}>📝 Log</button>
                        <button className="ab" disabled={!twilioReady||!p.script} onClick={()=>sendAutoSMS(p)} style={{background:twilioReady&&p.script?'rgba(244,114,182,0.1)':'rgba(107,114,128,0.06)',color:twilioReady&&p.script?C.pink:C.muted,border:`1px solid ${twilioReady&&p.script?'rgba(244,114,182,0.3)':C.border}`}} title={!p.script?'Generate AI Script first':''}>⚡ Auto-SMS</button>
                      </div>
                      {p.script&&(
                        <div style={{marginTop:10}}>
                          <button onClick={()=>setExpandedScript(s=>({...s,[p.id]:!showScript}))} style={{background:'transparent',border:'none',color:C.muted,cursor:'pointer',fontSize:12,display:'flex',alignItems:'center',gap:4,marginBottom:showScript?8:0}}>{showScript?'▲ Hide script':'▼ View AI script'}</button>
                          {showScript&&(
                            <div style={{background:C.bg,borderRadius:8,padding:'12px 13px',border:`1px solid ${C.border}`}}>
                              <div style={{fontSize:10,color:C.accent2,fontWeight:700,letterSpacing:'0.1em',marginBottom:6}}>OUTREACH SCRIPT</div>
                              <div style={{fontSize:13,lineHeight:1.7,whiteSpace:'pre-wrap'}}>{p.script}</div>
                            </div>
                          )}
                        </div>
                      )}
                      {(p.contacts?.length??0)>0&&(
                        <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`}}>
                          <div style={{fontSize:10,color:C.muted,letterSpacing:'0.1em',marginBottom:5}}>CONTACT LOG</div>
                          {p.contacts.slice(0,3).map((ct:any,i:number)=>(
                            <div key={i} style={{fontSize:11,color:C.muted,marginBottom:3}}>
                              <span style={{color:ct.type==='call'?C.success:ct.type==='text'?C.accent:C.warning}}>{ct.type==='call'?'📞':ct.type==='text'?'💬':'📝'}</span> {ct.date}{ct.note?` — ${ct.note}`:''}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* PROSPECT / CLIENT MODAL */}
        {(modal==='prospect'||modal==='client')&&(
          <div style={{position:'fixed',inset:0,background:'rgba(7,16,31,0.9)',backdropFilter:'blur(5px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200,padding:14}}>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:22,width:'100%',maxWidth:500,maxHeight:'92vh',overflowY:'auto'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18}}>
                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:15}}>{(modal==='prospect'?prospects:clients).find((x:any)=>x.id===form.id)?'Edit':'New'} {modal==='prospect'?'Prospect':'Client'}</div>
                <button onClick={()=>setModal(null)} style={{background:'transparent',border:'none',color:C.muted,cursor:'pointer',fontSize:22}}>×</button>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:11}}>
                {modal==='prospect'&&(<>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}><div><Label c="BUSINESS NAME *"/><input className="pi" value={form.businessName||''} onChange={e=>setForm({...form,businessName:e.target.value})} placeholder="Smith's HVAC"/></div><div><Label c="OWNER"/><input className="pi" value={form.ownerName||''} onChange={e=>setForm({...form,ownerName:e.target.value})} placeholder="John Smith"/></div></div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}><div><Label c="NICHE"/><select className="pi" value={form.niche||'HVAC'} onChange={e=>setForm({...form,niche:e.target.value})}>{NICHES.map(n=><option key={n}>{n}</option>)}</select></div><div><Label c="CITY"/><input className="pi" value={form.city||''} onChange={e=>setForm({...form,city:e.target.value})} placeholder="Salt Lake City"/></div></div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}><div><Label c="PHONE 📞"/><input className="pi" value={form.phone||''} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="+18015550000"/></div><div><Label c="EMAIL"/><input className="pi" value={form.email||''} onChange={e=>setForm({...form,email:e.target.value})} placeholder="owner@biz.com"/></div></div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}><div><Label c="MAPS RANK"/><input className="pi" type="number" value={form.mapsRank||''} onChange={e=>setForm({...form,mapsRank:e.target.value})} placeholder="7"/></div><div><Label c="AUDIT SCORE"/><input className="pi" value={form.auditScore||''} onChange={e=>setForm({...form,auditScore:e.target.value})} placeholder="42"/></div><div><Label c="LAST CONTACT"/><input className="pi" type="date" value={form.lastContact||''} onChange={e=>setForm({...form,lastContact:e.target.value})}/></div></div>
                  <div><Label c="STAGE"/><select className="pi" value={form.stage||'New Lead'} onChange={e=>setForm({...form,stage:e.target.value})}>{STAGES.map(s=><option key={s}>{s}</option>)}</select></div>
                  <div><Label c="NOTES"/><textarea className="pi" rows={3} value={form.notes||''} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Notes..." style={{resize:'vertical'}}/></div>
                </>)}
                {modal==='client'&&(<>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}><div><Label c="BUSINESS NAME *"/><input className="pi" value={form.businessName||''} onChange={e=>setForm({...form,businessName:e.target.value})} placeholder="Smith's HVAC"/></div><div><Label c="OWNER"/><input className="pi" value={form.ownerName||''} onChange={e=>setForm({...form,ownerName:e.target.value})} placeholder="John Smith"/></div></div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}><div><Label c="PHONE"/><input className="pi" value={form.phone||''} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="+18015550000"/></div><div><Label c="EMAIL"/><input className="pi" value={form.email||''} onChange={e=>setForm({...form,email:e.target.value})} placeholder="owner@biz.com"/></div></div>
                  <div><Label c="SERVICE"/><select className="pi" value={form.service||'Google Maps Optimization'} onChange={e=>setForm({...form,service:e.target.value})}>{SERVICES.map(s=><option key={s}>{s}</option>)}</select></div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}><div><Label c="MONTHLY VALUE ($)"/><input className="pi" type="number" value={form.monthlyValue||''} onChange={e=>setForm({...form,monthlyValue:e.target.value})} placeholder="697"/></div><div><Label c="START DATE"/><input className="pi" type="date" value={form.startDate||''} onChange={e=>setForm({...form,startDate:e.target.value})}/></div></div>
                  <div><Label c="NEXT ACTION"/><input className="pi" value={form.nextAction||''} onChange={e=>setForm({...form,nextAction:e.target.value})} placeholder="Send month 2 report"/></div>
                  <div><Label c="NOTES"/><textarea className="pi" rows={3} value={form.notes||''} onChange={e=>setForm({...form,notes:e.target.value})} style={{resize:'vertical'}}/></div>
                </>)}
              </div>
              <div style={{display:'flex',gap:10,marginTop:18}}>
                <button onClick={()=>setModal(null)} style={{flex:1,background:C.border,border:'none',color:C.muted,borderRadius:8,padding:10,cursor:'pointer'}}>Cancel</button>
                <button onClick={saveForm} style={{flex:2,background:form.businessName?.trim()?`linear-gradient(135deg,${modal==='client'?C.success+',#059669':C.accent+','+C.accent2})`:C.border,color:form.businessName?.trim()?(modal==='client'?'white':'#07101F'):C.muted,border:'none',borderRadius:8,padding:10,cursor:'pointer',fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:14}}>Save {modal==='prospect'?'Prospect':'Client'}</button>
              </div>
            </div>
          </div>
        )}

        {/* LOG MODAL */}
        {modal==='log'&&logTarget&&(
          <div style={{position:'fixed',inset:0,background:'rgba(7,16,31,0.9)',backdropFilter:'blur(5px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200,padding:14}}>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:22,width:'100%',maxWidth:390}}>
              <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:15,marginBottom:4}}>Log Contact</div>
              <div style={{color:C.muted,fontSize:12,marginBottom:16}}>{logTarget.businessName}</div>
              <div style={{marginBottom:13}}><Label c="TYPE"/>
                <div style={{display:'flex',gap:7}}>
                  {[['call','📞 Call'],['text','💬 Text'],['note','📝 Note']].map(([v,l])=>(
                    <button key={v} onClick={()=>setLogType(v)} style={{flex:1,padding:'8px 0',borderRadius:7,border:`1px solid ${logType===v?C.accent:C.border}`,background:logType===v?'rgba(34,211,238,0.12)':'transparent',color:logType===v?C.accent:C.muted,cursor:'pointer',fontSize:13,fontFamily:"'DM Sans',sans-serif"}}>{l}</button>
                  ))}
                </div>
              </div>
              <div style={{marginBottom:16}}><Label c="NOTES (optional)"/><textarea className="pi" rows={3} value={logNote} onChange={e=>setLogNote(e.target.value)} placeholder="What happened? Next step?" style={{resize:'vertical'}}/></div>
              <div style={{display:'flex',gap:10}}>
                <button onClick={()=>{setModal(null);setLogNote('')}} style={{flex:1,background:C.border,border:'none',color:C.muted,borderRadius:8,padding:10,cursor:'pointer'}}>Cancel</button>
                <button onClick={logContact} style={{flex:2,background:`linear-gradient(135deg,${C.accent},${C.accent2})`,color:'#07101F',border:'none',borderRadius:8,padding:10,cursor:'pointer',fontFamily:"'Syne',sans-serif",fontWeight:800}}>Save Log</button>
              </div>
            </div>
          </div>
        )}

        {/* TWILIO MODAL */}
        {modal==='twilio'&&(
          <div style={{position:'fixed',inset:0,background:'rgba(7,16,31,0.9)',backdropFilter:'blur(5px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200,padding:14}}>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:22,width:'100%',maxWidth:430}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:5}}>
                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:15}}>Twilio Auto-SMS Setup</div>
                <button onClick={()=>setModal(null)} style={{background:'transparent',border:'none',color:C.muted,cursor:'pointer',fontSize:22}}>×</button>
              </div>
              <div style={{color:C.muted,fontSize:12,marginBottom:16,lineHeight:1.6}}>Credentials saved securely in Supabase.</div>
              <div style={{display:'flex',flexDirection:'column',gap:11,marginBottom:16}}>
                <div><Label c="ACCOUNT SID"/><input className="pi" value={twilio.accountSid} onChange={e=>setTwilio({...twilio,accountSid:e.target.value})} placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"/></div>
                <div><Label c="AUTH TOKEN"/><input className="pi" type="password" value={twilio.authToken} onChange={e=>setTwilio({...twilio,authToken:e.target.value})} placeholder="••••••••••••••••••••••••••••••••"/></div>
                <div><Label c="FROM NUMBER"/><input className="pi" value={twilio.fromNumber} onChange={e=>setTwilio({...twilio,fromNumber:e.target.value})} placeholder="+13854620082"/></div>
              </div>
              <div style={{display:'flex',gap:10}}>
                <button onClick={()=>setModal(null)} style={{flex:1,background:C.border,border:'none',color:C.muted,borderRadius:8,padding:10,cursor:'pointer'}}>Cancel</button>
                <button onClick={async()=>{await saveT(twilio);setModal(null)}} style={{flex:2,background:`linear-gradient(135deg,${C.success},#059669)`,color:'white',border:'none',borderRadius:8,padding:10,cursor:'pointer',fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:14}}>Save Credentials</button>
              </div>
            </div>
          </div>
        )}

        {/* CONFIRM DELETE */}
        {confirmDelete&&(
          <div style={{position:'fixed',inset:0,background:'rgba(7,16,31,0.9)',backdropFilter:'blur(5px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:300,padding:14}}>
            <div style={{background:C.card,border:'1px solid rgba(239,68,68,0.4)',borderRadius:14,padding:24,maxWidth:320,width:'100%',textAlign:'center'}}>
              <div style={{fontSize:28,marginBottom:9}}>⚠️</div>
              <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:14,marginBottom:6}}>Delete this {confirmDelete.type}?</div>
              <div style={{color:C.muted,fontSize:13,marginBottom:18}}>"{confirmDelete.name||'Unnamed'}" will be permanently removed.</div>
              <div style={{display:'flex',gap:10}}>
                <button onClick={()=>setConfirmDelete(null)} style={{flex:1,background:C.border,border:'none',color:C.muted,borderRadius:8,padding:10,cursor:'pointer'}}>Cancel</button>
                <button onClick={doDelete} style={{flex:1,background:'rgba(239,68,68,0.14)',border:'1px solid rgba(239,68,68,0.4)',color:C.danger,borderRadius:8,padding:10,cursor:'pointer',fontWeight:700}}>Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
