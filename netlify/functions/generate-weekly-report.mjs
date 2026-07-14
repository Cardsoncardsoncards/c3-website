// netlify/functions/generate-weekly-report.mjs
// C3 Weekly Seller Report generator (PAID tier).
// Pulls live movers + buy/sell signals, builds the email HTML, fetches all
// active subscribers from the MailerLite "Paid - C3 Seller Intelligence" group,
// and sends the report via Resend's batch endpoint (up to 100 per call). Each
// recipient gets a personalised mailto unsubscribe link plus an RFC 8058
// List-Unsubscribe header so Gmail and Apple Mail can render a one-click button.
//
// The market queries, the email template, the plain-text body and Resend batch delivery all
// come from shared/weekly-report-core.mjs (task-100). This file previously carried its own
// verbatim copy of that layer, roughly 257 duplicated lines, which is now deleted. What
// remains here is only what is genuinely paid-tier specific: the MailerLite paid group,
// the per-recipient unsubscribe link, the paid List-Unsubscribe subject, and the handler.
//
// The free digest (generate-weekly-digest-free.mjs) imports the same module against a
// different MailerLite group. Neither function knows about the other.
//
// Trigger (manual, weekly): GET/POST /api/generate-weekly-report with header
//   x-sync-secret: <SYNC_SECRET>
// Returns JSON: { ok, message, counts: { recipients, sent, failed, up, down, buy, sell } }
//
// Env vars required (Netlify):
//   SUPABASE_URL, SUPABASE_ANON_KEY, TCGAPI_KEY  (already set, used by /market, read by the core)
//   RESEND_API_KEY                                (delivery)
//   MAILERLITE_API_KEY                            (paid subscriber list)
//   SYNC_SECRET                                   (auth header)
// Optional:
//   REPORT_CALL_TITLE, REPORT_CALL_BODY  (override the editorial C3 Call this week)

import {
  fetchMarketData,
  buildEmail,
  plainText,
  sendBatch,
  RESEND_API_KEY,
  SUPPORT_EMAIL
} from './shared/weekly-report-core.mjs';

const MAILERLITE_KEY = Netlify.env.get('MAILERLITE_API_KEY');
const SYNC_SECRET    = Netlify.env.get('SYNC_SECRET');

// Paid-tier unsubscribe subject. The free digest supplies its own, shorter wording. This is
// passed into sendBatch rather than read from the shared module, so the two lists cannot
// inherit each other's copy.
const LIST_UNSUBSCRIBE = `<mailto:${SUPPORT_EMAIL}?subject=Unsubscribe%20C3%20Weekly%20Report>`;

const PAID_GROUP_ID = '188799131758626620'; // Paid - C3 Seller Intelligence (verified live)
const ML_BASE       = 'https://connect.mailerlite.com/api';
const FETCH_TIMEOUT = 9000;

async function timedFetch(url,opts){
  const ctrl=new AbortController();
  const t=setTimeout(()=>ctrl.abort(),FETCH_TIMEOUT);
  try{return await fetch(url,{...opts,signal:ctrl.signal});}
  finally{clearTimeout(t);}
}

// Per-recipient mailto unsubscribe link. Until a hosted /unsubscribe endpoint
// exists, this routes opt-outs to support so they can be processed manually
// against MailerLite. Paired with the List-Unsubscribe header for one-click.
function unsubscribeUrl(email){
  const subject = encodeURIComponent('Unsubscribe from C3 Weekly Report');
  const body = encodeURIComponent(`Please unsubscribe ${email} from the C3 Weekly Seller Report.`);
  return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
}

// Paginated fetch of active subscribers in the paid Seller Intelligence group.
// Returns null if the API key is missing, [] if the call fails or the group is
// empty. Safety cap: 50 pages = 5000 subscribers.
async function fetchPaidSubscribers(){
  if(!MAILERLITE_KEY) return null;
  const out=[]; let cursor=null;
  for(let i=0;i<50;i++){
    const params=new URLSearchParams({limit:'100'});
    if(cursor) params.set('cursor',cursor);
    const url=`${ML_BASE}/groups/${PAID_GROUP_ID}/subscribers?${params.toString()}`;
    let res;
    try{
      res=await timedFetch(url,{headers:{Authorization:`Bearer ${MAILERLITE_KEY}`,Accept:'application/json'}});
    }catch{ break; }
    if(!res.ok) break;
    let data; try{ data=await res.json(); }catch{ break; }
    const page=data.data||[];
    for(const s of page){
      if(s.email && (s.status==='active'||!s.status)){
        out.push({id:s.id,email:s.email});
      }
    }
    cursor=(data.meta&&data.meta.next_cursor)||null;
    if(!cursor||page.length===0) break;
  }
  return out;
}

// ---------- handler ----------
export default async (req)=>{
  // Auth
  const secret=req.headers.get('x-sync-secret');
  if(!SYNC_SECRET||secret!==SYNC_SECRET){
    return new Response(JSON.stringify({ok:false,error:'unauthorised'}),{status:401,headers:{'Content-Type':'application/json'}});
  }
  if(!RESEND_API_KEY){
    return new Response(JSON.stringify({ok:false,error:'RESEND_API_KEY not set'}),{status:500,headers:{'Content-Type':'application/json'}});
  }

  // Pull data. Identical query set and slicing to the copy this file used to carry.
  const {up,down,buy,sell}=await fetchMarketData();

  // The C3 Call (auto-draft from top mover, override via env)
  const top=up[0];
  const dateStr=new Date().toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const callTitle=Netlify.env.get('REPORT_CALL_TITLE')||(top?`${top.name} leads the market this week`:'This week in the Australian TCG market');
  const callBody=Netlify.env.get('REPORT_CALL_BODY')||(top
    ?`${top.name} is up ${Math.abs(parseFloat(top.change7d)).toFixed(1)} per cent in seven days, leading this week's movers. The full picture across your games is below. Review the buy list and the cards near their highs, then list with the timing on your side.`
    :`Here are this week's movers, buy signals and sell-side timing across your games. Review the lists below and list with the timing on your side.`);

  // buildEmail and plainText default to the paid-tier labels ("Weekly Seller Report" and
  // "C3 Weekly Seller Report"), which is exactly what this file used to hardcode, so the
  // rendered output is unchanged.
  const htmlEmail=buildEmail({dateStr,callTitle,callBody,up,down,buy,sell});
  const text=plainText(dateStr);

  // Fetch paid subscribers from MailerLite, then fan out via Resend batch.
  const subscribers=await fetchPaidSubscribers();
  if(subscribers===null){
    return new Response(JSON.stringify({ok:false,error:'MAILERLITE_API_KEY not set'}),{status:500,headers:{'Content-Type':'application/json'}});
  }
  const baseCounts={up:up.length,down:down.length,buy:buy.length,sell:sell.length};
  const PREVIEW_EMAIL='ccc.squadhelp@gmail.com';
  const previewItem={
    email:PREVIEW_EMAIL,
    subject:`[PREVIEW] ${callTitle}`,
    html:htmlEmail.split('{$unsubscribe}').join(`mailto:ccc.squadhelp@gmail.com?subject=Unsubscribe`),
    text:text.split('{$unsubscribe}').join('mailto:ccc.squadhelp@gmail.com?subject=Unsubscribe'),
  };
  try{ await sendBatch([previewItem],LIST_UNSUBSCRIBE); }catch(e){ /* preview failure is non-fatal */ }
  if(subscribers.length===0){
    return new Response(JSON.stringify({
      ok:true,
      sent:0,
      skipped:0,
      selfPreview:true,
      subscriberCount:0,
      message:'Sent to 0 paid subscribers. Preview sent to ccc.squadhelp@gmail.com.',
    }),{status:200,headers:{'Content-Type':'application/json'}});
  }

  let sentCount=0,failedCount=0;
  const errors=[];
  for(let i=0;i<subscribers.length;i+=100){
    const chunk=subscribers.slice(i,i+100);
    const items=chunk.map(s=>{
      const url=unsubscribeUrl(s.email);
      return {
        email:s.email,
        subject:callTitle,
        html:htmlEmail.split('{$unsubscribe}').join(url),
        text:text.split('{$unsubscribe}').join(url),
      };
    });
    let res;
    try{ res=await sendBatch(items,LIST_UNSUBSCRIBE); }
    catch(e){
      failedCount+=chunk.length;
      errors.push({status:0,detail:String(e&&e.message||e).slice(0,200)});
      continue;
    }
    if(res.ok){
      sentCount+=chunk.length;
    }else{
      failedCount+=chunk.length;
      let detail=''; try{ detail=await res.text(); }catch{}
      errors.push({status:res.status,detail:detail.slice(0,200)});
    }
  }

  return new Response(JSON.stringify({
    ok:failedCount===0,
    message:failedCount===0
      ?`Weekly report sent to ${sentCount} paid subscribers.`
      :`Sent ${sentCount}, failed ${failedCount}.`,
    counts:{recipients:subscribers.length,sent:sentCount,failed:failedCount,...baseCounts},
    ...(errors.length?{errors}:{}),
  }),{status:failedCount===0?200:502,headers:{'Content-Type':'application/json'}});
};

export const config = { path: '/api/generate-weekly-report' };
