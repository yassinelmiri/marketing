'use client'

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Activity, ArrowRight, CheckCircle2, Database, Filter, Loader2, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'

type FieldFilter = { id: number; field: string; operator: string; value: string }
type SearchResult = { records: Record<string, unknown>[]; fields: string[]; total: number | null; totalPages: number | null; page: number; pageSize: number; rawCount?: number }
const operators = [
  { value: 'contains', label: 'Contient' }, { value: 'eq', label: 'Égal à' },
  { value: 'starts_with', label: 'Commence par' }, { value: 'gt', label: 'Supérieur à' },
  { value: 'gte', label: 'Supérieur ou égal' }, { value: 'lt', label: 'Inférieur à' }, { value: 'lte', label: 'Inférieur ou égal' },
]
const aliases: Record<string, string[]> = {
  'E-mail': ['email', 'e-mail', 'mail'], 'Téléphone': ['phone', 'telephone', 'tel', 'mobile', 'phone_number'],
  'Âge': ['age'], 'Ville': ['city', 'ville', 'locality'], 'Pays': ['country', 'pays'],
  'Code postal': ['postal_code', 'postcode', 'zip', 'zipcode', 'code_postal'],
  'Nom': ['name', 'nom', 'full_name', 'fullname'], 'Prénom': ['first_name', 'firstname', 'prenom'],
  'Entreprise': ['company', 'company_name', 'organisation', 'organization'],
}
const fieldLabel = (field: string) => {
  const match = Object.entries(aliases).find(([, names]) => names.includes(field.toLowerCase()))
  return match?.[0] ?? field.replace(/[._-]/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}
const readField = (record: Record<string, unknown>, field: string) => {
  const value = field.split('.').reduce<unknown>((current, key) => current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined, record)
  return value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
}
const fieldAliases = Object.values(aliases).flat()
const canonicalFields = [
  { key: 'name', label: 'Nom complet', aliases: ['name','nom','full_name','fullname'] },
  { key: 'firstName', label: 'Prénom', aliases: ['first_name','firstname','prenom','given_name'] },
  { key: 'lastName', label: 'Nom', aliases: ['last_name','lastname','surname','family_name'] },
  { key: 'email', label: 'E-mail', aliases: ['email','e-mail','mail'] },
  { key: 'phone', label: 'Téléphone', aliases: ['phone','telephone','tel','mobile','phone_number'] },
  { key: 'age', label: 'Âge', aliases: ['age'] },
  { key: 'city', label: 'Ville', aliases: ['city','ville','locality'] },
  { key: 'country', label: 'Pays', aliases: ['country','pays'] },
  { key: 'postalCode', label: 'Code postal', aliases: ['postal_code','postcode','zip','zipcode','code_postal'] },
  { key: 'address', label: 'Adresse', aliases: ['address','street','adresse'] },
]

export function ProspectionView({ onSaved }: { onSaved?: () => void | Promise<void> }) {
  const [fields, setFields] = useState<string[]>([])
  const [filters, setFilters] = useState<FieldFilter[]>([])
  const [nextId, setNextId] = useState(1)
  const [result, setResult] = useState<SearchResult | null>(null)
  const [loadingFields, setLoadingFields] = useState(false)
  const [searching, setSearching] = useState(false)
  const [preparationProgress, setPreparationProgress] = useState(0)
  const [preparationPage, setPreparationPage] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [listName, setListName] = useState('')
  const [listDescription, setListDescription] = useState('')
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [paginationMode, setPaginationMode] = useState('page')
  const [filterMode, setFilterMode] = useState('query')

  const loadFields = useCallback(async () => {
    setLoadingFields(true); setError('')
    try {
      const response = await fetch('/api/prospection?page=1&pageSize=100', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Impossible de découvrir les champs de cette API.')
      const detected = Array.isArray(data.fields) ? data.fields as string[] : []
      setFields(detected)
      setMapping(current => Object.keys(current).length ? current : Object.fromEntries(canonicalFields.map(item => [item.key, detected.find(field => item.aliases.includes(field.toLowerCase())) ?? ''])))
      if (!detected.length) throw new Error('Aucun champ détecté. Vérifiez l’URL et le format JSON de l’API.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Erreur de connexion.') }
    finally { setLoadingFields(false) }
  }, [])

  useEffect(() => { void loadFields() }, [loadFields])

  const addFilter = () => {
    const available = fields.filter(field => !filters.some(filter => filter.field === field))
    if (!available.length) return
    setFilters(current => [...current, { id: nextId, field: available[0], operator: 'contains', value: '' }])
    setNextId(current => current + 1)
  }

  const updateFilter = (id: number, patch: Partial<FieldFilter>) => setFilters(current => current.map(filter => filter.id === id ? { ...filter, ...patch } : filter))
  const removeFilter = (id: number) => setFilters(current => current.filter(filter => filter.id !== id))
  const activeFilters = useMemo(() => filters.filter(filter => filter.value.trim()).map(({ field, operator, value }) => ({ field, operator, value })), [filters])

  async function searchAll() {
    setSearching(true); setPreparationProgress(0); setPreparationPage(0); setError(''); setNotice(''); setResult(null)
    try {
      const all: Record<string, unknown>[] = []
      let page = 1
      let total: number | null = null
      let totalPages: number | null = null
      let detectedFields: string[] = fields
      let previousFirst = ''
      while (page <= 50 && all.length < 5000) {
        const params = new URLSearchParams({ page: String(page), pageSize: '100', filters: JSON.stringify(activeFilters), pagination: paginationMode, filterMode })
        const response = await fetch('/api/prospection?' + params.toString(), { cache: 'no-store' })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'La recherche a échoué.')
        const rows = Array.isArray(data.records) ? data.records as Record<string, unknown>[] : []
        detectedFields = Array.isArray(data.fields) && data.fields.length ? data.fields : detectedFields
        total = data.total ?? total; totalPages = data.totalPages ?? totalPages
        setPreparationPage(page)
        setPreparationProgress(totalPages && totalPages > 0 ? Math.min(99, Math.round((page / totalPages) * 100)) : Math.min(95, Math.round((page / 50) * 95)))
        const rawCount = Number(data.rawCount ?? rows.length)
        if (rawCount === 0) break
        const firstId = String(data.rawFirstId ?? rows[0]?.id ?? rows[0]?.email ?? JSON.stringify(rows[0]))
        if (page > 1 && firstId === previousFirst) break
        previousFirst = firstId
        all.push(...rows)
        if (rawCount < 100 || (total !== null && all.length >= total) || (totalPages !== null && page >= totalPages)) break
        page += 1
      }
      setFields(detectedFields)
      setPreparationProgress(100)
      setResult({ records: all.slice(0, 5000), fields: detectedFields, total: total ?? all.length, totalPages, page: 1, pageSize: 100 })
      if (!all.length) setNotice('Aucun contact ne correspond aux critères sélectionnés.')
      else setNotice(`${all.length.toLocaleString('fr-FR')} contact(s) récupéré(s). Vous pouvez maintenant enregistrer la liste.`)
    } catch (err) { setError(err instanceof Error ? err.message : 'Erreur de recherche.') }
    finally { setSearching(false) }
  }

  async function saveList() {
    if (!result?.records.length || !listName.trim()) return
    setSaving(true); setError(''); setNotice('')
    try {
      const response = await fetch('/api/prospection', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-list', name: listName.trim(), description: listDescription, mapping, target: activeFilters.map(filter => `${fieldLabel(filter.field)} ${filter.operator} ${filter.value}`).join(' · '), records: result.records }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Impossible de sauvegarder la liste.')
      setNotice(`Liste « ${listName} » créée avec ${data.saved} contacts. Elle est maintenant disponible dans Listes et Campagnes.`)
      setListName(''); setListDescription('')
      await onSaved?.()
    } catch (err) { setError(err instanceof Error ? err.message : 'Erreur de sauvegarde.') }
    finally { setSaving(false) }
  }

  const preview = result?.records.slice(0, 8) ?? []
  const suggested = fields.filter(field => fieldAliases.includes(field.toLowerCase()))
  return <section className="workspace-section prospection-page">
    <div className="prospection-panel" style={panel}>
      <header className="prospection-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:14, flexWrap:'wrap', marginBottom:24 }}>
        <div style={{ display:'flex', alignItems:'center', gap:13 }}>
          <span style={heroIcon}><Search size={23}/></span>
          <div><h2 style={{ margin:0, color:'#172033', fontSize:23 }}>Préparation de fichier</h2><p style={sub}>Construisez une audience depuis votre base de données API, puis enregistrez-la dans vos listes.</p></div>
        </div>
        <button type="button" style={secondary} disabled={loadingFields} onClick={() => void loadFields()}>{loadingFields?<Loader2 size={15}/>:<RefreshCw size={15}/>} Actualiser les champs</button>
      </header>

      <div className="prospection-step-heading" style={stepHeading}><span style={stepNumber}>1</span><div><h3 style={stepTitle}>Définir les caractéristiques</h3><p style={sub}>Les champs sont détectés automatiquement à partir des données renvoyées par votre API.</p></div></div>
      <div style={infoBar}><Database size={16}/> {loadingFields ? 'Analyse de la structure API…' : fields.length ? `${fields.length} champs détectés dans la réponse API` : 'En attente de la connexion API'}</div>
      <div style={apiModes}>
        <label style={modeLabel}>Format des filtres API<select style={control} value={filterMode} onChange={event=>setFilterMode(event.target.value)}><option value="query">field=value</option><option value="filter">filter[field]=value</option><option value="filters">filters[field]=value</option><option value="none">Filtrage local uniquement</option></select></label>
        <label style={modeLabel}>Pagination API<select style={control} value={paginationMode} onChange={event=>setPaginationMode(event.target.value)}><option value="page">page + per_page</option><option value="pageSize">page + pageSize</option><option value="offset">limit + offset</option><option value="none">Sans pagination API</option></select></label>
      </div>
      {suggested.length > 0 && <div style={chips}>{suggested.map(field=><span key={field} style={chip}>{fieldLabel(field)}</span>)}</div>}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', margin:'18px 0 10px', gap:10 }}><strong style={{fontSize:14,color:'#344054'}}>Filtres de recherche</strong><button type="button" style={secondary} disabled={!fields.length || filters.length>=15} onClick={addFilter}><Plus size={15}/> Ajouter un critère</button></div>
      {filters.length === 0 ? <div style={emptyFilter}>Aucun critère ajouté. Vous pouvez lancer une recherche sans filtre ou ajouter des caractéristiques.</div> : <div style={{display:'grid',gap:10}}>
        {filters.map(filter=><div key={filter.id} style={filterRow}>
          <select aria-label="Champ" style={control} value={filter.field} onChange={event=>updateFilter(filter.id,{field:event.target.value})}>{fields.map(field=><option key={field} value={field}>{fieldLabel(field)} — {field}</option>)}</select>
          <select aria-label="Opérateur" style={control} value={filter.operator} onChange={event=>updateFilter(filter.id,{operator:event.target.value})}>{operators.map(op=><option key={op.value} value={op.value}>{op.label}</option>)}</select>
          <input aria-label="Valeur" style={control} value={filter.value} placeholder="Valeur recherchée" onChange={event=>updateFilter(filter.id,{value:event.target.value})}/>
          <button type="button" style={iconButton} onClick={()=>removeFilter(filter.id)} aria-label="Supprimer le critère"><Trash2 size={16}/></button>
        </div>)}
      </div>}
      <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',marginTop:18}}>
        <button type="button" style={primary} disabled={searching||loadingFields||!fields.length} onClick={()=>void searchAll()}>{searching?<Loader2 size={16}/>:<Filter size={16}/>} {searching?'Recherche en cours…':'Lancer la recherche'}</button>
        <span style={{fontSize:12,color:'#7b8494'}}>Maximum 5 000 contacts par préparation.</span>
      </div>

      {(searching || (result !== null && preparationProgress === 100)) && <div style={progressPanel} role="status" aria-live="polite">
        <div style={progressCircleWrap}>
          <svg width="76" height="76" viewBox="0 0 76 76" aria-label={`Préparation à ${preparationProgress}%`}>
            <circle cx="38" cy="38" r="31" fill="none" stroke="#ece9f8" strokeWidth="7" />
            <circle cx="38" cy="38" r="31" fill="none" stroke="#7655d9" strokeWidth="7" strokeLinecap="round" strokeDasharray={String(2*Math.PI*31)} strokeDashoffset={String(2*Math.PI*31*(1-preparationProgress/100))} transform="rotate(-90 38 38)" style={{transition:'stroke-dashoffset .35s ease'}} />
            <text x="38" y="42" textAnchor="middle" fill="#263047" fontSize="15" fontWeight="700">{preparationProgress}%</text>
          </svg>
        </div>
        <div style={{flex:1,minWidth:180}}><strong style={{fontSize:14,color:'#263047'}}>{preparationProgress === 100 ? 'Préparation terminée !' : 'Préparation de votre audience…'}</strong><p style={{...sub,marginTop:4}}>{preparationProgress === 100 ? `${result?.records.length.toLocaleString('fr-FR') ?? 0} contacts prêts à être enregistrés.` : `Page ${preparationPage} · Les données sont récupérées et analysées.`}</p><p style={{...sub,marginTop:3}}>{preparationProgress === 100 ? 'Vous pouvez maintenant consulter les résultats et enregistrer la liste.' : 'Vous pouvez continuer à utiliser les autres modules : la préparation continue en arrière-plan.'}</p></div>
      </div>}

      {error && <div role="alert" style={errorBox}>{error}</div>}
      {notice && <div role="status" style={successBox}>{notice}</div>}

      {result && <>
        <div style={divider}/>
        <div style={stepHeading}><span style={stepNumber}>2</span><div><h3 style={stepTitle}>Résultats de la requête</h3><p style={sub}>Aperçu des données récupérées depuis l’API avant leur enregistrement.</p></div></div>
        <div className="prospection-result-stats" style={resultStats}><div><strong>{result.records.length.toLocaleString('fr-FR')}</strong><span>Contacts récupérés</span></div><div><strong>{result.fields.length}</strong><span>Champs disponibles</span></div><div><strong>{activeFilters.length}</strong><span>Critères appliqués</span></div></div>
        <div className="prospection-mapping-panel" style={mappingPanel}>
          <strong style={{fontSize:13,color:'#344054'}}>Correspondance des champs de contacts</strong>
          <p style={sub}>Associez les champs de l’API aux champs de votre base. Les correspondances automatiques peuvent être modifiées.</p>
          <div style={mappingGrid}>{canonicalFields.map(item=><label key={item.key} style={fieldLabelStyle}>{item.label}<select style={control} value={mapping[item.key] ?? ''} onChange={event=>setMapping(current=>({...current,[item.key]:event.target.value}))}><option value="">Non disponible / ignorer</option>{result.fields.map(field=><option key={field} value={field}>{field}</option>)}</select></label>)}</div>
        </div>
        <div className="prospection-preview-table" style={{overflowX:'auto',border:'1px solid #e7eaf0',borderRadius:12,marginTop:16}}>
          <table style={{width:'100%',borderCollapse:'collapse',minWidth:680}}><thead><tr style={{background:'#f8f9fc',textAlign:'left'}}>{result.fields.slice(0,7).map(field=><th key={field} style={th}>{fieldLabel(field)}</th>)}</tr></thead>
          <tbody>{preview.map((record,index)=><tr key={String(record.id??record.email??index)} style={{borderTop:'1px solid #edf0f5'}}>{result.fields.slice(0,7).map(field=><td key={field} style={td}>{readField(record,field)||'—'}</td>)}</tr>)}</tbody></table>
        </div>
        <p style={{fontSize:12,color:'#7b8494',marginTop:8}}>Aperçu de {preview.length} ligne(s) sur {result.records.length.toLocaleString('fr-FR')}.</p>

        <div style={divider}/>
        <div style={stepHeading}><span style={stepNumber}>3</span><div><h3 style={stepTitle}>Enregistrer comme liste</h3><p style={sub}>La liste sera disponible dans le module Listes pour l’ajouter ensuite à une campagne.</p></div></div>
        <div className="prospection-save-grid" style={saveGrid}>
          <label style={fieldLabelStyle}>Nom de la liste<input style={control} value={listName} onChange={event=>setListName(event.target.value)} placeholder="Ex. Prospects Casablanca — Décembre"/></label>
          <label style={fieldLabelStyle}>Description (facultatif)<input style={control} value={listDescription} onChange={event=>setListDescription(event.target.value)} placeholder="Description de la cible"/></label>
        </div>
        <div style={{display:'flex',justifyContent:'flex-end',marginTop:16}}><button type="button" style={primary} disabled={saving||!listName.trim()||!result.records.length} onClick={()=>void saveList()}>{saving?<Loader2 size={16}/>:<CheckCircle2 size={16}/>} {saving?'Enregistrement…':'Sauvegarder dans mes listes'} <ArrowRight size={15}/></button></div>
      </>}
    </div>
  </section>
}

const panel:CSSProperties={padding:26,borderRadius:18,background:'#fff',border:'1px solid #e8eaf0'}
const heroIcon:CSSProperties={width:48,height:48,display:'grid',placeItems:'center',borderRadius:14,background:'#f1edff',color:'#7655d9'}
const sub:CSSProperties={margin:'5px 0 0',color:'#687386',fontSize:13,lineHeight:1.55}
const stepHeading:CSSProperties={display:'flex',alignItems:'center',gap:12,margin:'22px 0 14px'}
const stepNumber:CSSProperties={width:32,height:32,borderRadius:10,background:'#f1edff',color:'#7655d9',display:'grid',placeItems:'center',fontWeight:800}
const stepTitle:CSSProperties={margin:0,fontSize:16,color:'#202a3d'}
const infoBar:CSSProperties={display:'flex',alignItems:'center',gap:9,padding:'11px 13px',borderRadius:10,background:'#f7f8fc',color:'#586579',fontSize:12}
const apiModes:CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12,marginTop:12}
const modeLabel:CSSProperties={display:'flex',flexDirection:'column',gap:6,color:'#536075',fontSize:12,fontWeight:650}
const chips:CSSProperties={display:'flex',gap:7,flexWrap:'wrap',marginTop:12}
const chip:CSSProperties={fontSize:11,padding:'5px 9px',borderRadius:20,background:'#f2efff',color:'#674ac5'}
const emptyFilter:CSSProperties={padding:18,border:'1px dashed #d8dce6',borderRadius:10,color:'#8791a2',fontSize:13,textAlign:'center'}
const filterRow:CSSProperties={display:'grid',gridTemplateColumns:'minmax(150px,1.1fr) minmax(145px,.8fr) minmax(160px,1fr) 38px',gap:9,alignItems:'center'}
const control:CSSProperties={width:'100%',minHeight:40,border:'1px solid #dfe3ec',borderRadius:9,padding:'8px 10px',color:'#202a3d',background:'#fff',fontSize:13}
const iconButton:CSSProperties={width:38,height:38,display:'grid',placeItems:'center',border:'1px solid #f2cbd0',borderRadius:9,background:'#fff7f7',color:'#be3345',cursor:'pointer'}
const primary:CSSProperties={display:'inline-flex',alignItems:'center',justifyContent:'center',gap:8,padding:'10px 15px',border:0,borderRadius:9,background:'#7655d9',color:'#fff',fontWeight:650,cursor:'pointer',fontSize:13}
const secondary:CSSProperties={display:'inline-flex',alignItems:'center',justifyContent:'center',gap:8,padding:'9px 12px',border:'1px solid #dfe3ec',borderRadius:9,background:'#fff',color:'#465268',fontWeight:600,cursor:'pointer',fontSize:12}
const divider:CSSProperties={height:1,background:'#e9ecf2',margin:'26px 0'}
const progressPanel:CSSProperties={display:'flex',alignItems:'center',gap:16,marginTop:18,padding:16,border:'1px solid #e7e2f8',borderRadius:14,background:'linear-gradient(110deg,#fbfaff,#fff)'}
const progressCircleWrap:CSSProperties={width:76,height:76,flex:'0 0 76px',display:'grid',placeItems:'center'}
const resultStats:CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:10}
const mappingPanel:CSSProperties={marginTop:16,padding:16,border:'1px solid #e8eaf0',borderRadius:12,background:'#fbfcfe'}
const mappingGrid:CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:10,marginTop:12}
const th:CSSProperties={padding:'12px 13px',color:'#667085',fontSize:11,fontWeight:700,textTransform:'uppercase'}
const td:CSSProperties={padding:'11px 13px',color:'#536075',fontSize:12,maxWidth:240,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}
const saveGrid:CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12}
const fieldLabelStyle:CSSProperties={display:'flex',flexDirection:'column',gap:7,color:'#536075',fontSize:12,fontWeight:650}
const errorBox:CSSProperties={marginTop:16,padding:13,borderRadius:10,background:'#fff1f2',border:'1px solid #fecdd3',color:'#9f1239',fontSize:13}
const successBox:CSSProperties={marginTop:16,padding:13,borderRadius:10,background:'#f0fdf4',border:'1px solid #bbf7d0',color:'#166534',fontSize:13}
