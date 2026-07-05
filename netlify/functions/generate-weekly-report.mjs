// netlify/functions/generate-weekly-report.mjs
// C3 Weekly Seller Report generator.
// Pulls live movers + buy/sell signals, builds the email HTML, fetches all
// active subscribers from the MailerLite "Paid - C3 Seller Intelligence" group,
// and sends the report via Resend's batch endpoint (up to 100 per call). Each
// recipient gets a personalised mailto unsubscribe link plus an RFC 8058
// List-Unsubscribe header so Gmail and Apple Mail can render a one-click button.
//
// Trigger (manual, weekly): GET/POST /api/generate-weekly-report with header
//   x-sync-secret: <SYNC_SECRET>
// Returns JSON: { ok, message, counts: { recipients, sent, failed, up, down, buy, sell } }
//
// Env vars required (Netlify):
//   SUPABASE_URL, SUPABASE_ANON_KEY, TCGAPI_KEY  (already set, used by /market)
//   RESEND_API_KEY                                (delivery)
//   MAILERLITE_API_KEY                            (paid subscriber list)
//   SYNC_SECRET                                   (auth header)
// Optional:
//   REPORT_CALL_TITLE, REPORT_CALL_BODY  (override the editorial C3 Call this week)

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const TCGAPI_KEY        = Netlify.env.get('TCGAPI_KEY');
const RESEND_API_KEY    = Netlify.env.get('RESEND_API_KEY');
const MAILERLITE_KEY    = Netlify.env.get('MAILERLITE_API_KEY');
const SYNC_SECRET       = Netlify.env.get('SYNC_SECRET');
const SUPPORT_EMAIL     = 'ccc.squadhelp@gmail.com';
const LIST_UNSUBSCRIBE  = `<mailto:${SUPPORT_EMAIL}?subject=Unsubscribe%20C3%20Weekly%20Report>`;

const EPN_CAMPID   = '5339146789';
const PAID_GROUP_ID = '188799131758626620'; // Paid - C3 Seller Intelligence (verified live)
const ML_BASE      = 'https://connect.mailerlite.com/api';
const TCGAPI_BASE  = 'https://api.tcgapi.dev/v1';
const FROM_EMAIL   = 'alerts@cardsoncardsoncards.com.au';
const FROM_NAME    = 'Cards on Cards on Cards';
const FETCH_TIMEOUT = 9000;

const GAME_CONFIG = {
  mtg:        { label: 'MTG',         path: '/cards/mtg' },
  pokemon:    { label: 'Pokemon',     path: '/cards/pokemon' },
  yugioh:     { label: 'Yu-Gi-Oh',    path: '/cards/yugioh' },
  lorcana:    { label: 'Lorcana',     path: '/cards/lorcana' },
  onepiece:   { label: 'One Piece',   path: '/cards/onepiece' },
  dragonball: { label: 'Dragon Ball', path: '/cards/dragonball' },
  starwars:   { label: 'Star Wars',   path: '/cards/starwars' },
  riftbound:  { label: 'Riftbound',   path: '/cards/riftbound' },
};
const TCG_API_GAME_MAP = {
  pokemon: 'pokemon', yugioh: 'yugioh', lorcana: 'disney-lorcana',
  onepiece: 'one-piece-card-game', dragonball: 'dragon-ball-super',
  starwars: 'star-wars-unlimited', riftbound: 'riftbound-league-of-legends-trading-card-game',
};

// ---------- helpers ----------
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function escAttr(s){return esc(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function fmtAUD(n){return (!n||n<=0)?'N/A':'A$'+parseFloat(n).toFixed(2);}

async function timedFetch(url,opts){
  const ctrl=new AbortController();
  const t=setTimeout(()=>ctrl.abort(),FETCH_TIMEOUT);
  try{return await fetch(url,{...opts,signal:ctrl.signal});}
  finally{clearTimeout(t);}
}
async function sbGet(path){
  try{
    const res=await timedFetch(`${SUPABASE_URL}/rest/v1/${path}`,{headers:{apikey:SUPABASE_ANON_KEY,Authorization:`Bearer ${SUPABASE_ANON_KEY}`}});
    if(!res.ok)return[];
    return await res.json();
  }catch{return[];}
}
function ebayUrl(name,game){
  const kw=encodeURIComponent(name+' '+(game==='mtg'?'mtg':(GAME_CONFIG[game]?GAME_CONFIG[game].label:game)));
  return `https://www.ebay.com.au/sch/i.html?_nkw=${kw}&_sacat=183454&mkcid=1&mkrid=705-53470-19255-0&campid=${EPN_CAMPID}&toolid=10001&mkevt=1`;
}

// ---------- data (mirrors /market logic) ----------
async function tcgMovers(game,direction,limit){
  if(!TCGAPI_KEY)return[];
  const g=TCG_API_GAME_MAP[game]; if(!g)return[];
  try{
    const res=await timedFetch(`${TCGAPI_BASE}/prices/top-movers?game=${g}&direction=${direction}&period=7d&limit=${limit}`,{headers:{'X-API-Key':TCGAPI_KEY}});
    if(!res.ok)return[];
    const d=await res.json();
    return (d.data||[]).map(c=>({
      name:c.name||c.card_name||'', setName:c.set_name||c.set||'',
      priceAud:((c.market_price||c.price||0)*1.45).toFixed(2),
      change7d:c.price_change_7d||c.change_7d||0, rarity:c.rarity||'',
      slug:c.slug||'', game,
    }));
  }catch{return[];}
}
async function mtgMovers(direction,limit){
  try{
    const today=await sbGet(`mtg_price_snapshots?order=snapshot_date.desc&limit=1&select=snapshot_date`);
    if(!today.length)return[];
    const latest=today[0].snapshot_date;
    const d=new Date(latest); d.setDate(d.getDate()-7);
    const wk=d.toISOString().split('T')[0];
    const [a,b]=await Promise.all([
      sbGet(`mtg_price_snapshots?snapshot_date=eq.${latest}&price_aud=gt.1&select=scryfall_id,price_aud&order=price_aud.desc&limit=1500`),
      sbGet(`mtg_price_snapshots?snapshot_date=eq.${wk}&price_aud=gt.1&select=scryfall_id,price_aud&order=price_aud.desc&limit=1500`)
    ]);
    if(!a.length||!b.length)return[];
    const map={}; b.forEach(s=>{map[s.scryfall_id]=parseFloat(s.price_aud);});
    const movers=a.filter(s=>map[s.scryfall_id]>0)
      .map(s=>({scryfall_id:s.scryfall_id,priceAud:parseFloat(s.price_aud),pct:((parseFloat(s.price_aud)-map[s.scryfall_id])/map[s.scryfall_id])*100}))
      .filter(s=>direction==='up'?s.pct>=5:s.pct<=-5)
      .sort((x,y)=>direction==='up'?y.pct-x.pct:x.pct-y.pct)
      .slice(0,limit);
    if(!movers.length)return[];
    const ids=movers.map(s=>s.scryfall_id).join(',');
    const cards=await sbGet(`mtg_cards?scryfall_id=in.(${ids})&select=name,slug,set_name,rarity,scryfall_id`);
    return movers.map(m=>{
      const c=cards.find(x=>x.scryfall_id===m.scryfall_id); if(!c)return null;
      return {name:c.name,setName:c.set_name,priceAud:m.priceAud,change7d:parseFloat(m.pct.toFixed(1)),rarity:c.rarity||'',slug:c.slug,game:'mtg'};
    }).filter(Boolean);
  }catch{return[];}
}
async function mtgBuy(limit){
  try{
    const data=await sbGet(`mtg_price_snapshots?price_52w_low_aud=gt.1&order=price_aud.asc&limit=50&select=scryfall_id,price_aud,price_52w_high_aud,price_52w_low_aud`);
    const sig=data.filter(s=>{
      if(!s.price_52w_high_aud||!s.price_52w_low_aud)return false;
      const r=s.price_52w_high_aud-s.price_52w_low_aud; if(r<1)return false;
      return ((s.price_aud-s.price_52w_low_aud)/r)<=0.20;
    }).slice(0,limit);
    if(!sig.length)return[];
    const ids=sig.map(s=>s.scryfall_id).join(',');
    const cards=await sbGet(`mtg_cards?scryfall_id=in.(${ids})&select=name,slug,set_name,rarity,scryfall_id`);
    return sig.map(s=>{
      const c=cards.find(x=>x.scryfall_id===s.scryfall_id); if(!c)return null;
      const discount=Math.round(((s.price_52w_high_aud-s.price_aud)/s.price_52w_high_aud)*100);
      return {name:c.name,setName:c.set_name,rarity:c.rarity||'',slug:c.slug,priceAud:s.price_aud,discount,game:'mtg'};
    }).filter(Boolean);
  }catch{return[];}
}
async function mtgSell(limit){
  try{
    const data=await sbGet(`mtg_price_snapshots?price_52w_high_aud=gt.2&order=price_aud.desc&limit=50&select=scryfall_id,price_aud,price_52w_high_aud,price_52w_low_aud`);
    const sig=data.filter(s=>{
      if(!s.price_52w_high_aud||!s.price_52w_low_aud)return false;
      const r=s.price_52w_high_aud-s.price_52w_low_aud; if(r<1)return false;
      return ((s.price_aud-s.price_52w_low_aud)/r)>=0.80;
    }).slice(0,limit);
    if(!sig.length)return[];
    const ids=sig.map(s=>s.scryfall_id).join(',');
    const cards=await sbGet(`mtg_cards?scryfall_id=in.(${ids})&select=name,slug,set_name,rarity,scryfall_id`);
    return sig.map(s=>{
      const c=cards.find(x=>x.scryfall_id===s.scryfall_id); if(!c)return null;
      const nearHighPct=Math.round(((s.price_aud-s.price_52w_low_aud)/(s.price_52w_high_aud-s.price_52w_low_aud))*100);
      return {name:c.name,setName:c.set_name,rarity:c.rarity||'',slug:c.slug,priceAud:s.price_aud,nearHighPct,game:'mtg'};
    }).filter(Boolean);
  }catch{return[];}
}

// ---------- email row + html ----------
function row(card,mode){
  const cfg=GAME_CONFIG[card.game]||GAME_CONFIG.mtg;
  const path=card.slug?`https://cardsoncardsoncards.com.au${cfg.path}/${card.slug}`:'https://cardsoncardsoncards.com.au/market';
  let badgeColor,badgeText;
  if(mode==='up'){badgeColor='#22c55e';badgeText='\u25B2 '+Math.abs(parseFloat(card.change7d)).toFixed(1)+'% 7d';}
  else if(mode==='down'){badgeColor='#ef4444';badgeText='\u25BC '+Math.abs(parseFloat(card.change7d)).toFixed(1)+'% 7d';}
  else if(mode==='buy'){badgeColor='#C9A84C';badgeText=card.discount+'% off high';}
  else{badgeColor='#f97316';badgeText='Near '+card.nearHighPct+'% of high';}
  const sub=[cfg.label,card.setName,card.rarity].filter(Boolean).map(esc).join(' &middot; ');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0;border-bottom:1px solid #161d2e;padding-bottom:10px;"><tr>
  <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#e8eaf0;line-height:1.4;">
    <a href="${escAttr(path)}" style="color:#e8eaf0;text-decoration:none;font-weight:bold;">${esc(card.name)}</a>
    <div style="font-size:11px;color:#8892b0;margin-top:2px;">${sub}</div>
  </td>
  <td align="right" valign="top" style="font-family:Arial,Helvetica,sans-serif;white-space:nowrap;">
    <div style="font-size:14px;font-weight:bold;color:#e8eaf0;">${fmtAUD(card.priceAud)}</div>
    <div style="font-size:11px;font-weight:bold;color:${badgeColor};">${badgeText}</div>
    <a href="${escAttr(ebayUrl(card.name,card.game))}" style="font-size:11px;color:#C9A84C;text-decoration:none;">eBay AU &rarr;</a>
  </td>
</tr></table>`;
}
function sectionRows(list,mode){
  if(!list||!list.length)return '<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#8892b0;padding:6px 0;">Nothing notable this week.</div>';
  return list.map(c=>row(c,mode)).join('');
}

function buildEmail({dateStr,callTitle,callBody,up,down,buy,sell}){
  return `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">This week in the AU TCG market: the movers, the buy signals, and where to list.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#080b12" style="background:#080b12;margin:0;padding:0;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
  <tr><td bgcolor="#0f1420" style="background:#0f1420;border:1px solid #1e2638;border-radius:10px 10px 0 0;padding:22px 26px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="font-family:Georgia,serif;font-size:15px;font-weight:bold;color:#C9A84C;letter-spacing:1px;text-transform:uppercase;">Cards on Cards on Cards</td>
      <td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#8892b0;">${esc(dateStr)}</td>
    </tr></table>
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#8892b0;margin-top:4px;">Weekly Seller Report &middot; Australian TCG market</div>
  </td></tr>
  <tr><td bgcolor="#0f1420" style="background:#0f1420;border-left:1px solid #1e2638;border-right:1px solid #1e2638;padding:24px 26px;">
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#C9A84C;">The C3 Call of the Week</div>
    <div style="font-family:Georgia,serif;font-size:20px;font-weight:bold;color:#e8eaf0;margin:8px 0;line-height:1.3;">${esc(callTitle)}</div>
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#b8c0d8;line-height:1.65;">${esc(callBody)}</div>
  </td></tr>
  <tr><td bgcolor="#0f1420" style="background:#0f1420;border-left:1px solid #1e2638;border-right:1px solid #1e2638;padding:8px 26px 4px;">
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;color:#22c55e;border-top:1px solid #1e2638;padding-top:18px;">&#9650;&nbsp; Biggest movers up this week</div>
  </td></tr>
  <tr><td bgcolor="#0f1420" style="background:#0f1420;border-left:1px solid #1e2638;border-right:1px solid #1e2638;padding:6px 26px 10px;">${sectionRows(up,'up')}</td></tr>
  <tr><td bgcolor="#0f1420" style="background:#0f1420;border-left:1px solid #1e2638;border-right:1px solid #1e2638;padding:8px 26px 4px;">
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;color:#ef4444;border-top:1px solid #1e2638;padding-top:18px;">&#9660;&nbsp; Sliding this week, clear stock before it drops</div>
  </td></tr>
  <tr><td bgcolor="#0f1420" style="background:#0f1420;border-left:1px solid #1e2638;border-right:1px solid #1e2638;padding:6px 26px 10px;">${sectionRows(down,'down')}</td></tr>
  <tr><td bgcolor="#0f1420" style="background:#0f1420;border-left:1px solid #1e2638;border-right:1px solid #1e2638;padding:8px 26px 4px;">
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;color:#C9A84C;border-top:1px solid #1e2638;padding-top:18px;">Grab these, well below their 52 week high</div>
  </td></tr>
  <tr><td bgcolor="#0f1420" style="background:#0f1420;border-left:1px solid #1e2638;border-right:1px solid #1e2638;padding:6px 26px 10px;">${sectionRows(buy,'buy')}</td></tr>
  <tr><td bgcolor="#0f1420" style="background:#0f1420;border-left:1px solid #1e2638;border-right:1px solid #1e2638;padding:8px 26px 4px;">
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;color:#f97316;border-top:1px solid #1e2638;padding-top:18px;">List these now, near their 52 week high</div>
  </td></tr>
  <tr><td bgcolor="#0f1420" style="background:#0f1420;border-left:1px solid #1e2638;border-right:1px solid #1e2638;padding:6px 26px 18px;">${sectionRows(sell,'sell')}</td></tr>
  <tr><td bgcolor="#0f1420" style="background:#0f1420;border-left:1px solid #1e2638;border-right:1px solid #1e2638;padding:4px 26px 26px;" align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#C9A84C" style="border-radius:8px;">
      <a href="https://cardsoncardsoncards.com.au/market" style="display:inline-block;padding:13px 28px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#080b12;text-decoration:none;">See the full live market &rarr;</a>
    </td></tr></table>
  </td></tr>
  <tr><td bgcolor="#0b0e16" style="background:#0b0e16;border:1px solid #1e2638;border-top:none;border-radius:0 0 10px 10px;padding:22px 26px;">
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#8892b0;line-height:1.6;">Know a seller who would use this? Forward it on. They can join free at <a href="https://cardsoncardsoncards.com.au/pricing" style="color:#C9A84C;text-decoration:none;">cardsoncardsoncards.com.au</a>.</div>
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#5a6580;line-height:1.6;margin-top:14px;">Prices are indicative AUD market estimates and move constantly. Always check the live price before you buy or sell. C3 participates in the eBay Partner Network and may earn a small commission on purchases made through links, at no extra cost to you.</div>
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#5a6580;margin-top:12px;">The C3 Team &middot; <a href="{$unsubscribe}" style="color:#8892b0;text-decoration:underline;">Manage subscription</a></div>
  </td></tr>
</table>
</td></tr></table>`;
}

function plainText(dateStr){
  return `C3 Weekly Seller Report, ${dateStr}.\n\nYour email client cannot display HTML. View the full market at https://cardsoncardsoncards.com.au/market\n\nThe C3 Team.\nManage subscription: {$unsubscribe}`;
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

// Send up to 100 emails in one Resend batch call.
async function sendBatch(items){
  return timedFetch('https://api.resend.com/emails/batch',{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      Authorization:`Bearer ${RESEND_API_KEY}`,
    },
    body:JSON.stringify(items.map(it=>({
      from:`${FROM_NAME} <${FROM_EMAIL}>`,
      to:[it.email],
      subject:it.subject,
      html:it.html,
      text:it.text,
      headers:{'List-Unsubscribe':LIST_UNSUBSCRIBE},
    }))),
  });
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

  // Pull data
  const r=await Promise.allSettled([
    mtgMovers('up',6), mtgMovers('down',6), mtgBuy(6), mtgSell(6),
    tcgMovers('pokemon','gainers',4), tcgMovers('pokemon','losers',4),
    tcgMovers('onepiece','gainers',3), tcgMovers('onepiece','losers',3),
    tcgMovers('lorcana','gainers',3), tcgMovers('lorcana','losers',3),
    tcgMovers('riftbound','gainers',3), tcgMovers('riftbound','losers',3),
  ]);
  const v=i=>r[i].status==='fulfilled'?r[i].value:[];
  const up=[v(0),v(4),v(6),v(8),v(10)].flat().sort((a,b)=>Math.abs(b.change7d)-Math.abs(a.change7d)).slice(0,8);
  const down=[v(1),v(5),v(7),v(9),v(11)].flat().sort((a,b)=>a.change7d-b.change7d).slice(0,6);
  const buy=v(2), sell=v(3);

  // The C3 Call (auto-draft from top mover, override via env)
  const top=up[0];
  const dateStr=new Date().toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const callTitle=Netlify.env.get('REPORT_CALL_TITLE')||(top?`${top.name} leads the market this week`:'This week in the Australian TCG market');
  const callBody=Netlify.env.get('REPORT_CALL_BODY')||(top
    ?`${top.name} is up ${Math.abs(parseFloat(top.change7d)).toFixed(1)} per cent in seven days, leading this week's movers. The full picture across your games is below. Review the buy list and the cards near their highs, then list with the timing on your side.`
    :`Here are this week's movers, buy signals and sell-side timing across your games. Review the lists below and list with the timing on your side.`);

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
  try{ await sendBatch([previewItem]); }catch(e){ /* preview failure is non-fatal */ }
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
    try{ res=await sendBatch(items); }
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
