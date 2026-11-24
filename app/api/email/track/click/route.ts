import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
export const runtime='nodejs'
export async function GET(request:NextRequest){
 const campaign=Number(request.nextUrl.searchParams.get('campaign'));const email=String(request.nextUrl.searchParams.get('email')||'').toLowerCase();const raw=String(request.nextUrl.searchParams.get('url')||'')
 let target:URL;try{target=new URL(raw)}catch{return NextResponse.json({error:'URL invalide'},{status:400})}
 if(!['http:','https:'].includes(target.protocol)||!Number.isInteger(campaign)||!email)return NextResponse.json({error:'Requête invalide'},{status:400})
 const {error}=await createAdminClient().from('email_campaign_events').insert({campaign_id:campaign,recipient_email:email,event_type:'click',target_url:target.toString()})
 if(error)console.error('[email/click-tracking]',error)
 return NextResponse.redirect(target)
}
