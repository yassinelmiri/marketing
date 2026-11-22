import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime='nodejs'
export const dynamic='force-dynamic'

async function authorize(){
 const session=await createClient()
 const {data:auth,error}=await session.auth.getUser()
 if(error||!auth.user) return {response:NextResponse.json({error:'Connexion requise.'},{status:401})}
 const {data:profile,error:pError}=await session.from('user_profiles').select('id').eq('auth_user_id',auth.user.id).maybeSingle()
 if(pError||!profile) return {response:NextResponse.json({error:'Profil non autorisé.'},{status:403})}
 try{return {admin:createAdminClient(),userId:Number(profile.id)} as const}catch{return {response:NextResponse.json({error:'Configuration serveur indisponible.'},{status:503})}}
}
function originCheck(req:NextRequest){const origin=req.headers.get('origin');if(!origin)return NextResponse.json({error:'Origin manquant.'},{status:403});try{if(new URL(origin).origin!==req.nextUrl.origin)return NextResponse.json({error:'Origin refusé.'},{status:403})}catch{return NextResponse.json({error:'Origin invalide.'},{status:403})}return null}
export async function GET(){
 const auth=await authorize();if('response'in auth)return auth.response
 // Generate a one-time in-app reminder for assigned tasks due today or tomorrow when the member opens notifications.
 const today=new Date().toISOString().slice(0,10)
 const tomorrowDate=new Date(Date.now()+86400000).toISOString().slice(0,10)
 const {data:assigned}=await auth.admin.from('task_assignments').select('task_id').eq('user_id',auth.userId)
 const taskIds=(assigned??[]).map(row=>Number(row.task_id))
 if(taskIds.length){
  const {data:dueTasks}=await auth.admin.from('tasks').select('id,title,due_date,status').in('id',taskIds).in('due_date',[today,tomorrowDate]).neq('status','done')
  const due=(dueTasks??[])
  if(due.length){
   const {data:existing}=await auth.admin.from('notifications').select('task_id').eq('user_id',auth.userId).eq('type','task_due').in('task_id',due.map(t=>Number(t.id)))
   const existingIds=new Set((existing??[]).map(row=>Number(row.task_id)))
   const reminders=due.filter(t=>!existingIds.has(Number(t.id))).map(t=>({user_id:auth.userId,type:'task_due',title:t.due_date===today?'Tâche à terminer aujourd’hui':'Échéance proche',body:t.title,task_id:Number(t.id)}))
   if(reminders.length)await auth.admin.from('notifications').insert(reminders)
  }
 }
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
