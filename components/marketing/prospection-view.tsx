'use client'

import { Database, ListFilter, LockKeyhole, MessageCircle, Mail, Smartphone, Search } from 'lucide-react'

export function ProspectionView() {
  return (
    <section className="workspace-section prospection-page">
      <div className="workspace-panel" style={{ padding: '28px', borderRadius: '18px', background: '#ffffff', border: '1px solid #e8eaf0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
          <span style={{ width: 48, height: 48, display: 'grid', placeItems: 'center', borderRadius: 14, background: '#f1edff', color: '#7655d9' }}><Search size={24} /></span>
          <div><h2 style={{ margin: 0, color: '#172033', fontSize: 22 }}>Prospection</h2><p style={{ margin: '5px 0 0', color: '#687386' }}>Recherche et création de listes de prospects ciblés.</p></div>
        </div>
        <div style={{ padding: 20, border: '1px dashed #d8dce7', borderRadius: 14, background: '#fafbfe', textAlign: 'center' }}>
          <Database size={30} style={{ color: '#8b78c9', margin: '0 auto 12px' }} />
          <h3 style={{ margin: '0 0 8px', color: '#202a3d' }}>Connexion à la base de données en attente</h3>
          <p style={{ maxWidth: 620, margin: '0 auto', color: '#687386', lineHeight: 1.65 }}>La page Prospection est maintenant disponible. Pour activer la recherche de contacts et enregistrer les listes, il reste à appliquer la migration Supabase puis à recevoir la documentation de votre API (URL des routes, paramètres de recherche et format des résultats).</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginTop: 18 }}>
          {[{icon:ListFilter,title:'Critères de recherche',desc:'E-mail, téléphone, âge, ville, pays et code postal'},{icon:Database,title:'Listes enregistrées',desc:'Créer, nommer, modifier et retrouver vos listes'},{icon:MessageCircle,title:'Canaux de contact',desc:'WhatsApp, e-mail et SMS'},{icon:LockKeyhole,title:'Accès sécurisé',desc:'Les réglages API restent réservés à Admin'}].map(({icon:Icon,title,desc}) => <div key={title} style={{ padding: 16, border: '1px solid #e8eaf0', borderRadius: 12, background: '#fff' }}><Icon size={19} style={{ color: '#7655d9', marginBottom: 10 }} /><strong style={{ display: 'block', color: '#202a3d', marginBottom: 5 }}>{title}</strong><span style={{ color: '#687386', fontSize: 13, lineHeight: 1.5 }}>{desc}</span></div>)}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 18, color: '#7b8494', fontSize: 12 }}><Mail size={15} /><Smartphone size={15} /> Les envois et statistiques seront activés après le branchement de l’API et des fournisseurs de messagerie.</div>
      </div>
    </section>
  )
}
