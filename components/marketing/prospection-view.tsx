'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { Activity, Database, Filter, Loader2, Mail, RefreshCw, Search, UserPlus } from 'lucide-react'

type Prospect = { id: number | string; name: string; email: string; gender?: string; status?: string }
type ApiResult = { prospects: Prospect[]; page: number; perPage: number; total: number | null; totalPages: number | null }
const emptyFilters = { name: '', email: '', gender: '', status: '' }

export function ProspectionView() {
  const [filters, setFilters] = useState(emptyFilters)
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<ApiResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savedIds, setSavedIds] = useState<string[]>([])

  const load = useCallback(async (targetPage = 1, criteria = filters) => {
    setLoading(true); setError(''); setNotice('')
    try {
      const params = new URLSearchParams({ page: String(targetPage), per_page: '10' })
      Object.entries(criteria).forEach(([key, value]) => { if (value.trim()) params.set(key, value.trim()) })
      const response = await fetch(`/api/prospection?${params.toString()}`, { cache: 'no-store' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Impossible de charger les prospects.')
      setResult(data); setPage(targetPage)
    } catch (err) { setError(err instanceof Error ? err.message : 'Erreur de chargement.'); setResult(null) }
    finally { setLoading(false) }
  }, [filters])

  useEffect(() => { void load(1, emptyFilters) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function save(prospect: Prospect) {
    const id = String(prospect.id); setSavingId(id); setError(''); setNotice('')
    try {
      const response = await fetch('/api/prospection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prospect }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Enregistrement impossible.')
      setSavedIds((current) => current.includes(id) ? current : [...current, id])
      setNotice(`${prospect.name} a été enregistré dans Supabase.`)
    } catch (err) { setError(err instanceof Error ? err.message : 'Enregistrement impossible.') }
    finally { setSavingId(null) }
  }

  const prospects = result?.prospects ?? []
  return <section className="workspace-section prospection-page">
    <div className="workspace-panel" style={{ padding: 24, borderRadius: 18, background: '#fff', border: '1px solid #e8eaf0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ width: 48, height: 48, display: 'grid', placeItems: 'center', borderRadius: 14, background: '#f1edff', color: '#7655d9' }}><Search size={24} /></span>
          <div><h2 style={{ margin: 0, color: '#172033', fontSize: 22 }}>Prospection</h2><p style={{ margin: '5px 0 0', color: '#687386' }}>Recherchez des contacts depuis votre API et enregistrez-les dans vos prospects.</p></div>
        </div>
        <button type="button" disabled={loading} onClick={() => void load(page)} style={secondaryButton}>{loading ? <Loader2 size={15}/> : <RefreshCw size={15}/>} Actualiser</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 16 }}>
        <label style={fieldStyle}>Nom<input style={inputStyle} value={filters.name} placeholder="Nom du contact" onChange={e => setFilters(v => ({...v,name:e.target.value}))} onKeyDown={e => {if(e.key==='Enter') void load(1)}} /></label>
        <label style={fieldStyle}>E-mail<input style={inputStyle} value={filters.email} placeholder="Adresse e-mail" onChange={e => setFilters(v => ({...v,email:e.target.value}))} onKeyDown={e => {if(e.key==='Enter') void load(1)}} /></label>
        <label style={fieldStyle}>Genre<select style={inputStyle} value={filters.gender} onChange={e => setFilters(v => ({...v,gender:e.target.value}))}><option value="">Tous</option><option value="male">Homme</option><option value="female">Femme</option></select></label>
        <label style={fieldStyle}>Statut<select style={inputStyle} value={filters.status} onChange={e => setFilters(v => ({...v,status:e.target.value}))}><option value="">Tous</option><option value="active">Actif</option><option value="inactive">Inactif</option></select></label>
      </div>
      <div style={{ display:'flex', gap:9, alignItems:'center', flexWrap:'wrap', marginBottom:18 }}>
        <button type="button" disabled={loading} onClick={() => void load(1)} style={primaryButton}><Filter size={15}/> Rechercher</button>
        <button type="button" disabled={loading} onClick={() => {setFilters(emptyFilters); void load(1,emptyFilters)}} style={secondaryButton}>Réinitialiser</button>
        <span style={{marginLeft:'auto',fontSize:12,color:'#778196'}}>{result?.total != null ? `${result.total.toLocaleString('fr-FR')} résultats` : 'Données de l’API'}</span>
      </div>
      {error && <div role="alert" style={alertError}>{error}</div>}
      {notice && <div role="status" style={alertSuccess}>{notice}</div>}
      <div style={{display:'flex',gap:8,alignItems:'center',fontSize:13,color:'#586579',marginBottom:10}}><Activity size={16} color="#7655d9"/>{loading?'Chargement…':`${prospects.length} contact(s) affiché(s)`}</div>
      <div style={{overflowX:'auto',border:'1px solid #e8eaf0',borderRadius:12}}>
        <table style={{width:'100%',borderCollapse:'collapse',minWidth:650}}>
          <thead><tr style={{background:'#f8f9fc',textAlign:'left'}}>{['Nom','Adresse e-mail','Genre','Statut','Action'].map(h=><th key={h} style={thStyle}>{h}</th>)}</tr></thead>
          <tbody>
            {loading && <tr><td colSpan={5} style={emptyStyle}><Loader2 size={17}/> Chargement des résultats…</td></tr>}
            {!loading && prospects.length===0 && <tr><td colSpan={5} style={emptyStyle}>Aucun résultat. Vérifiez l’URL API dans Paramètres ou modifiez les filtres.</td></tr>}
            {!loading && prospects.map(p=>{const id=String(p.id);const saved=savedIds.includes(id);return <tr key={id} style={{borderTop:'1px solid #edf0f5'}}>
              <td style={tdStyle}><strong style={{color:'#202a3d'}}>{p.name||'—'}</strong><div style={{fontSize:11,color:'#8a93a3'}}>ID : {id}</div></td>
              <td style={tdStyle}><span style={{display:'inline-flex',gap:7,alignItems:'center'}}><Mail size={14} color="#8b78c9"/>{p.email||'—'}</span></td>
              <td style={tdStyle}>{p.gender==='male'?'Homme':p.gender==='female'?'Femme':p.gender||'—'}</td>
              <td style={tdStyle}><span style={{padding:'4px 9px',borderRadius:20,fontSize:11,fontWeight:700,background:p.status==='active'?'#ecfdf3':'#f1f5f9',color:p.status==='active'?'#15803d':'#64748b'}}>{p.status==='active'?'Actif':p.status==='inactive'?'Inactif':p.status||'—'}</span></td>
              <td style={tdStyle}><button type="button" disabled={saved||savingId===id} onClick={()=>void save(p)} style={{...secondaryButton,padding:'8px 10px',opacity:saved ? 0.65 : 1}}>{savingId===id?<Loader2 size={14}/>:saved?<Database size={14}/>:<UserPlus size={14}/>} {saved?'Enregistré':'Enregistrer'}</button></td>
            </tr>})}
          </tbody>
        </table>
      </div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap',marginTop:16}}>
        <span style={{fontSize:12,color:'#8a93a3'}}>Source : API configurée dans Paramètres</span>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <button type="button" style={secondaryButton} disabled={loading||page<=1} onClick={()=>void load(page-1)}>← Précédent</button>
          <span style={{fontSize:13,color:'#586579'}}>Page {page}{result?.totalPages?` / ${result.totalPages}`:''}</span>
          <button type="button" style={secondaryButton} disabled={loading||(result?.totalPages?page>=result.totalPages:prospects.length<10)} onClick={()=>void load(page+1)}>Suivant →</button>
        </div>
      </div>
    </div>
  </section>
}

const primaryButton: CSSProperties = {display:'inline-flex',alignItems:'center',justifyContent:'center',gap:8,padding:'10px 15px',border:0,borderRadius:9,background:'#7655d9',color:'#fff',fontWeight:650,cursor:'pointer',fontSize:13}
const secondaryButton: CSSProperties = {display:'inline-flex',alignItems:'center',justifyContent:'center',gap:8,padding:'10px 13px',border:'1px solid #dfe3ec',borderRadius:9,background:'#fff',color:'#465268',fontWeight:600,cursor:'pointer',fontSize:13}
const fieldStyle: CSSProperties = {display:'flex',flexDirection:'column',gap:7,color:'#536075',fontSize:12,fontWeight:650}
const inputStyle: CSSProperties = {width:'100%',minHeight:40,border:'1px solid #dfe3ec',borderRadius:9,padding:'8px 10px',color:'#202a3d',background:'#fff',fontSize:13}
const thStyle: CSSProperties = {padding:'12px 14px',color:'#667085',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em'}
const tdStyle: CSSProperties = {padding:'13px 14px',color:'#536075',fontSize:13,verticalAlign:'middle'}
const emptyStyle: CSSProperties = {padding:32,textAlign:'center',color:'#8791a2',fontSize:13}
const alertError: CSSProperties = {padding:13,borderRadius:10,background:'#fff1f2',border:'1px solid #fecdd3',color:'#9f1239',marginBottom:16,fontSize:13}
const alertSuccess: CSSProperties = {padding:13,borderRadius:10,background:'#f0fdf4',border:'1px solid #bbf7d0',color:'#166534',marginBottom:16,fontSize:13}
