import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime='nodejs'
export const dynamic='force-dynamic'
async function authorize(){
 const session=await createClient()
 const {data:auth,error}=await session.auth.getUser()
 if(error||!auth.user)return {response:NextResponse.json({error:'Connexion requise.'},{status:401}) as const}
 const {data:profile,error:pError}=await session.from('user_profiles').select('id,prenom,nom,role_id').eq('auth_user_id',auth.user.id).maybeSingle()
 if(pError||!profile)return {response:NextResponse.json({error:'Profil non autorisé.'},{status:403}) as const}
 try{return {admin:createAdminClient(),profile:{id:Number(profile.id),prenom:profile.prenom??'',nom:profile.nom??''},isAdmin:Number(profile.role_id)===1} as const}catch{return {response:NextResponse.json({error:'Configuration serveur indisponible.'},{status:503}) as const}}
}
function originCheck(req:NextRequest){const origin=req.headers.get('origin');if(!origin)return NextResponse.json({error:'Origin manquant.'},{status:403});try{if(new URL(origin).origin!==req.nextUrl.origin)return NextResponse.json({error:'Origin refusé.'},{status:403})}catch{return NextResponse.json({error:'Origin invalide.'},{status:403})}return null}
export async function GET(){
 const auth=await authorize();if('response'in auth)return auth.response
 const {data:messages,error}=await auth.admin.from('team_chat_messages').select('id,user_id,message,created_at').order('created_at',{ascending:false}).limit(100)
 if(error)return NextResponse.json({error:'Chargement du chat impossible.'},{status:500})
 const ids=Array.from(new Set((messages??[]).map(m=>Number(m.user_id))))
 const {data:profiles}=ids.length?await auth.admin.from('user_profiles').select('id,prenom,nom').in('id',ids):{data:[]}
 const profileMap=new Map((profiles??[]).map(p=>[Number(p.id),p]))
 const messageRows = (messages ?? []).reverse()
 const messageIds = messageRows.map((message) => Number(message.id))
 const { data: attachments, error: attachmentError } = messageIds.length
   ? await auth.admin.from('team_chat_attachments')
       .select('id,user_id,message_id,file_name,mime_type,file_size,storage_path,created_at')
       .in('message_id', messageIds)
   : { data: [], error: null }
 // Les messages texte restent accessibles même si la migration des pièces jointes
 // n'a pas encore été appliquée sur ce projet Supabase.
 if (attachmentError) {
   console.error('[chat] attachments lookup failed:', attachmentError.code, attachmentError.message)
 }
 const attachmentRows = await Promise.all((attachments ?? []).map(async (attachment) => {
   const { data: signed } = await auth.admin.storage.from('team-chat-private')
     .createSignedUrl(attachment.storage_path, 60 * 5)
   return {
     message_id: Number(attachment.message_id),
     file: {
       id: Number(attachment.id),
       user_id: Number(attachment.user_id),
       file_name: attachment.file_name,
       mime_type: attachment.mime_type,
       file_size: Number(attachment.file_size),
       signed_url: signed?.signedUrl ?? null,
     },
   }
 }))
 const attachmentMap = new Map<number, (typeof attachmentRows)[number]['file'][]>()
 for (const item of attachmentRows) {
   const list = attachmentMap.get(item.message_id) ?? []
   list.push(item.file)
   attachmentMap.set(item.message_id, list)
 }
 const rows = messageRows.map((message) => ({
   ...message,
   profile: profileMap.get(Number(message.user_id)) ?? null,
   attachments: attachmentMap.get(Number(message.id)) ?? [],
 }))
 return NextResponse.json({ messages: rows }, { headers: { 'Cache-Control': 'no-store' } })
}
export async function POST(req:NextRequest){
 const check=originCheck(req);if(check)return check
 const auth=await authorize();if('response'in auth)return auth.response
 let body: { message?: string; attachmentIds?: number[] }
 try { body = await req.json() } catch { return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 }) }
 const attachmentIds = Array.isArray(body.attachmentIds)
   ? [...new Set(body.attachmentIds.map(Number))]
   : []
 if (attachmentIds.length > 5 || attachmentIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
   return NextResponse.json({ error: 'Pièces jointes invalides (5 maximum).' }, { status: 400 })
 }
 const message = typeof body.message === 'string' ? body.message.trim().slice(0, 2000) : ''
 if (!message && attachmentIds.length === 0) return NextResponse.json({ error: 'Écrivez un message ou ajoutez un fichier.' }, { status: 400 })
 const { count: recentMessages, error: rateLimitError } = await auth.admin.from('team_chat_messages')
   .select('id', { count: 'exact', head: true })
   .eq('user_id', auth.profile.id)
   .gte('created_at', new Date(Date.now() - 60 * 1000).toISOString())
 if (rateLimitError) return NextResponse.json({ error: 'Vérification anti-spam impossible.' }, { status: 500 })
 if ((recentMessages ?? 0) >= 20) return NextResponse.json({ error: 'Limite de 20 messages par minute atteinte.' }, { status: 429 })
 if (attachmentIds.length) {
   const { data: owned, error: ownedError } = await auth.admin.from('team_chat_attachments')
     .select('id').in('id', attachmentIds).eq('user_id', auth.profile.id).is('message_id', null)
   if (ownedError || (owned ?? []).length !== attachmentIds.length) {
     return NextResponse.json({ error: 'Une pièce jointe est invalide ou n’est pas autorisée.' }, { status: 403 })
   }
 }
 const { data, error } = await auth.admin.from('team_chat_messages')
   .insert({ user_id: auth.profile.id, message: message || 'Pièce jointe' })
   .select('id,user_id,message,created_at').single()
 if (error || !data) {
   console.error('[chat] message insert failed:', error?.code, error?.message, error?.details, error?.hint)
   return NextResponse.json(
     { error: `Enregistrement impossible. Vérifiez la migration team_chat_messages dans Supabase. Code: ${error?.code ?? 'CHAT_INSERT_FAILED'}`, code: error?.code ?? 'CHAT_INSERT_FAILED' },
     { status: 500, headers: { 'Cache-Control': 'no-store' } },
   )
 }
 if (attachmentIds.length) {
   const { error: attachError } = await auth.admin.from('team_chat_attachments')
     .update({ message_id: data.id }).in('id', attachmentIds).eq('user_id', auth.profile.id)
   if (attachError) {
     await auth.admin.from('team_chat_messages').delete().eq('id', data.id)
     return NextResponse.json({ error: 'Association des fichiers impossible.' }, { status: 500 })
   }
 }
 const {data:team}=await auth.admin.from('user_profiles').select('id').neq('id',auth.profile.id)
 if(team?.length){const {error:notificationError}=await auth.admin.from('notifications').insert(team.map(member=>({user_id:Number(member.id),type:'chat_message',title:'Nouveau message dans le chat',body:(message || 'Une pièce jointe a été partagée.').slice(0,180),task_id:null})));if(notificationError)console.warn('[chat] notification creation failed',notificationError.message)}
 const { data: attached } = attachmentIds.length
   ? await auth.admin.from('team_chat_attachments')
       .select('id,user_id,file_name,mime_type,file_size,storage_path').in('id', attachmentIds)
   : { data: [] }
 const signedAttachments = await Promise.all((attached ?? []).map(async (attachment) => {
   const { data: signed } = await auth.admin.storage.from('team-chat-private')
     .createSignedUrl(attachment.storage_path, 60 * 5)
   return {
     id: Number(attachment.id),
     user_id: Number(attachment.user_id),
     file_name: attachment.file_name,
     mime_type: attachment.mime_type,
     file_size: Number(attachment.file_size),
     signed_url: signed?.signedUrl ?? null,
   }
 }))
 return NextResponse.json({
   message: { ...data, profile: auth.profile, attachments: signedAttachments },
 }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
}

export async function PATCH(req:NextRequest){
 const check=originCheck(req);if(check)return check
 const auth=await authorize();if('response'in auth)return auth.response
 let body:{id?:number;message?:string};try{body=await req.json()}catch{return NextResponse.json({error:'Requête invalide.'},{status:400})}
 const id=Number(body.id),message=typeof body.message==='string'?body.message.trim().slice(0,2000):''
 if(!Number.isSafeInteger(id)||id<=0||!message)return NextResponse.json({error:'Message ou identifiant invalide.'},{status:400})
 const {data:existing,error:readError}=await auth.admin.from('team_chat_messages').select('id,user_id').eq('id',id).maybeSingle()
 if(readError||!existing)return NextResponse.json({error:'Message introuvable.'},{status:404})
 if(Number(existing.user_id)!==auth.profile.id)return NextResponse.json({error:'Vous pouvez modifier uniquement vos propres messages.'},{status:403})
 const {data,error}=await auth.admin.from('team_chat_messages').update({message}).eq('id',id).select('id,user_id,message,created_at').single()
 if(error||!data)return NextResponse.json({error:'Modification du message impossible.'},{status:500})
 return NextResponse.json({message:{...data,profile:auth.profile}})
}

export async function DELETE(req:NextRequest){
 const check=originCheck(req);if(check)return check
 const auth=await authorize();if('response'in auth)return auth.response
 let body:{id?:number};try{body=await req.json()}catch{return NextResponse.json({error:'Requête invalide.'},{status:400})}
 const id=Number(body.id)
 if(!Number.isSafeInteger(id)||id<=0)return NextResponse.json({error:'Identifiant invalide.'},{status:400})
 const {data:existing,error:readError}=await auth.admin.from('team_chat_messages').select('id,user_id').eq('id',id).maybeSingle()
 if(readError||!existing)return NextResponse.json({error:'Message introuvable.'},{status:404})
 if(Number(existing.user_id)!==auth.profile.id&&!auth.isAdmin)return NextResponse.json({error:'Suppression non autorisée.'},{status:403})
 const { data: attachments } = await auth.admin.from('team_chat_attachments')
   .select('storage_path').eq('message_id', id)
 if (attachments?.length) {
   const { error: storageError } = await auth.admin.storage.from('team-chat-private')
     .remove(attachments.map((attachment) => attachment.storage_path))
   if (storageError) console.error('[chat] attachment cleanup failed:', storageError.message)
 }
 const { error } = await auth.admin.from('team_chat_messages').delete().eq('id', id)
 if (error) return NextResponse.json({ error: 'Suppression du message impossible.' }, { status: 500 })
 return NextResponse.json({success:true})
}
