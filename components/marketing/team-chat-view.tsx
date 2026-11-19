'use client'

import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { MessageCircle, Send, Users, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@/lib/storage'

type ChatMessage={id:number;user_id:number;message:string;created_at:string;profile:{id:number;prenom:string;nom:string}|null}
function initials(name:string){return name.split(' ').filter(Boolean).slice(0,2).map(p=>p[0]?.toUpperCase()).join('')}
function clock(value:string){return new Date(value).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}
export function TeamChatView({user}:{user:User}){
 const [messages,setMessages]=useState<ChatMessage[]>([]),[text,setText]=useState(''),[loading,setLoading]=useState(true),[sending,setSending]=useState(false),[error,setError]=useState('')
 const supabase=createClient(),bottom=useRef<HTMLDivElement|null>(null)
 async function load(){try{const r=await fetch('/api/chat',{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(d.error||'Chat indisponible.');setMessages(d.messages??[]);setError('')}catch(e){setError(e instanceof Error?e.message:'Erreur de chargement')}finally{setLoading(false)}}
 useEffect(()=>{void load();const channel=supabase.channel('team-chat-live').on('postgres_changes',{event:'INSERT',schema:'public',table:'team_chat_messages'},()=>{void load()}).subscribe();return()=>{void supabase.removeChannel(channel)}},[])
 useEffect(()=>{bottom.current?.scrollIntoView({behavior:'smooth'})},[messages])
 async function send(event:FormEvent){event.preventDefault();const message=text.trim();if(!message||sending)return;setSending(true);try{const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Envoi impossible.');setMessages(current=>current.some(m=>m.id===d.message.id)?current:[...current,d.message]);setText('');setError('')}catch(e){setError(e instanceof Error?e.message:'Erreur')}finally{setSending(false)}}
 return <section className="workspace-section chatz-page"><div className="chatz-panel"><header className="chatz-header"><div className="chatz-icon"><MessageCircle/></div><div><h2>Chat d'équipe</h2><p><span className="chatz-online"/>Espace de discussion général · Messages en direct</p></div><button type="button" onClick={()=>void load()} title="Actualiser"><RefreshCw size={17}/></button></header><div className="chatz-messages">{loading?<div className="chatz-empty">Chargement des messages…</div>:messages.length===0?<div className="chatz-empty"><Users size={34}/><strong>Bienvenue dans le chat d'équipe</strong><p>Envoyez le premier message pour démarrer la discussion.</p></div>:messages.map(m=>{const name=((m.profile?.prenom??'')+' '+(m.profile?.nom??'')).trim()||'Membre';const own=m.user_id===user.id;return <article className={'chatz-message '+(own?'own':'')} key={m.id}><span className="chatz-avatar">{initials(name)||'?'}</span><div className="chatz-message-content"><div className="chatz-message-head"><strong>{own?'Vous':name}</strong><time>{clock(m.created_at)}</time></div><div className="chatz-bubble">{m.message}</div></div></article>})}<div ref={bottom}/></div>{error&&<p className="chatz-error">{error}</p>}<form className="chatz-compose" onSubmit={send}><textarea rows={1} value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void send(e)}}} placeholder="Écrire un message… (Entrée pour envoyer, Maj+Entrée pour une ligne)" maxLength={2000}/><button type="submit" disabled={sending||!text.trim()} aria-label="Envoyer"><Send size={18}/>{sending?'…':'Envoyer'}</button></form><footer className="chatz-footer">Les messages sont synchronisés en temps réel entre les membres connectés.</footer></div></section>
}
