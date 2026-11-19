import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime='nodejs'
export const dynamic='force-dynamic'

async function authorize(){
 const session=await createClient()
 const {data:auth,error}=await session.auth.getUser()
 if(error||!auth.user) return {response:NextResponse.json({error:'Connexion requise.'},{status:401}) as const}
 const {data:profile,error:pError}=await session.from('user_profiles').select('id').eq('auth_user_id',auth.user.id).maybeSingle()
 if(pError||!profile) return {response:NextResponse.json({error:'Profil non autorisé.'},{status:403}) as const}
 try{return {admin:createAdminClient(),userId:Number(profile.id)} as const}catch{return {response:NextResponse.json({error:'Configuration serveur indisponible.'},{status:503}) as const}}
}
function originCheck(req:NextRequest){const origin=req.headers.get('origin');if(!origin)return NextResponse.json({error:'Origin manquant.'},{status:403});try{if(new URL(origin).origin!==req.nextUrl.origin)return NextResponse.json({error:'Origin refusé.'},{status:403})}catch{return NextResponse.json({error:'Origin invalide.'},{status:403})}return null}
export async function GET(){
 const auth=await authorize();if('response'in auth)return auth.response
 const {data,error}=await auth.admin.from('notifications').select('id,type,title,body,task_id,is_read,created_at').eq('user_id',auth.userId).order('created_at',{ascending:false}).limit(40)
 if(error)return NextResponse.json({error:'Chargement des notifications impossible.'},{status:500})
 return NextResponse.json({notifications:data??[]},{headers:{'Cache-Control':'no-store'}})
}
export async function PATCH(req:NextRequest){
 const check=originCheck(req);if(check)return check
 const auth=await authorize();if('response'in auth)return auth.response
 let body:{id?:number;all?:boolean};try{body=await req.json()}catch{return NextResponse.json({error:'Requête invalide.'},{status:400})}
 let query=auth.admin.from('notifications').update({is_read:true}).eq('user_id',auth.userId).eq('is_read',false)
 if(!body.all){const id=Number(body.id);if(!Number.isSafeInteger(id)||id<=0)return NextResponse.json({error:'Identifiant notification invalide.'},{status:400});query=query.eq('id',id)}
 const {error}=await query
 if(error)return NextResponse.json({error:'Mise à jour notification impossible.'},{status:500})
 return NextResponse.json({success:true})
}
