import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
export const runtime='nodejs'
export async function GET(request:NextRequest){
 const campaign=Number(request.nextUrl.searchParams.get('campaign'));const email=String(request.nextUrl.searchParams.get('email')||'').toLowerCase()
 if(!Number.isInteger(campaign)||!email)return new NextResponse('Requête invalide',{status:400})
 const admin=createAdminClient();const {error}=await admin.from('email_campaign_events').insert({campaign_id:campaign,recipient_email:email,event_type:'open'})
 if(error)console.error('[email/open-tracking]',error)
 const gif=Buffer.from('R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=','base64')
 return new NextResponse(gif,{headers:{'Content-Type':'image/gif','Cache-Control':'no-store, no-cache, must-revalidate, proxy-revalidate','Content-Length':String(gif.length)}})
}
