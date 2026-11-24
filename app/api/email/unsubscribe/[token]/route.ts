import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
export const runtime='nodejs'
export async function GET(_request:NextRequest,{params}:{params:Promise<{token:string}>}){
 const {token}=await params;const admin=createAdminClient()
 const {data,error}=await admin.from('email_unsubscribe_tokens').select('token,email,campaign_id,used_at').eq('token',token).maybeSingle()
 if(error||!data)return new NextResponse('Lien de désabonnement invalide ou expiré.',{status:404})
 const {error:saveError}=await admin.from('email_unsubscribes').upsert({email:data.email,campaign_id:data.campaign_id,reason:'Désabonnement depuis une campagne e-mail'},{onConflict:'email'})
 if(saveError)return new NextResponse('Impossible de traiter votre demande. Réessayez plus tard.',{status:500})
 await admin.from('email_unsubscribe_tokens').update({used_at:new Date().toISOString()}).eq('token',token)
 return new NextResponse('<!doctype html><html lang="fr"><meta charset="utf-8"><title>Désabonnement confirmé</title><body style="font-family:Arial,sans-serif;max-width:600px;margin:12vh auto;padding:24px;color:#172554"><h1>Désabonnement confirmé</h1><p>Cette adresse ne recevra plus nos campagnes e-mail.</p></body></html>',{headers:{'Content-Type':'text/html; charset=utf-8'}})
}
