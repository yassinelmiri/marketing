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
 const rows=(messages??[]).reverse().map(m=>({...m,profile:profileMap.get(Number(m.user_id))??null}))
 return NextResponse.json({messages:rows},{headers:{'Cache-Control':'no-store'}})
}
export async function POST(req:NextRequest){
 const check=originCheck(req);if(check)return check
 const auth=await authorize();if('response'in auth)return auth.response
 let body:{message?:string};try{body=await req.json()}catch{return NextResponse.json({error:'Requête invalide.'},{status:400})}
 const message=typeof body.message==='string'?body.message.trim().slice(0,2000):''
 if(!message)return NextResponse.json({error:'Écrivez un message.'},{status:400})
 const {data,error}=await auth.admin.from('team_chat_messages').insert({user_id:auth.profile.id,message}).select('id,user_id,message,created_at').single()
 if(error||!data)return NextResponse.json({error:'Envoi du message impossible.'},{status:500})
 const {data:team}=await auth.admin.from('user_profiles').select('id').neq('id',auth.profile.id)
 if(team?.length){const {error:notificationError}=await auth.admin.from('notifications').insert(team.map(member=>({user_id:Number(member.id),type:'chat_message',title:'Nouveau message dans le chat',body:message.slice(0,180),task_id:null})));if(notificationError)console.warn('[chat] notification creation failed',notificationError.message)}
 return NextResponse.json({message:{...data,profile:auth.profile}},{status:201})
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
 const {data,error}=await auth.admin.from('team_chat_messages').update({message,updated_at:new Date().toISOString()}).eq('id',id).select('id,user_id,message,created_at').single()
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
 const {error}=await auth.admin.from('team_chat_messages').delete().eq('id',id)
 if(error)return NextResponse.json({error:'Suppression du message impossible.'},{status:500})
 return NextResponse.json({success:true})
}
