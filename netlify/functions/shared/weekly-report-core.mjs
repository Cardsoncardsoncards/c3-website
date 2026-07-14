// netlify/functions/shared/weekly-report-core.mjs
// Shared engine for the weekly emails: price-movement queries, the Resend email template,
// and Resend batch delivery. Everything in here is list-agnostic, there is no MailerLite in it.
//
// Extracted VERBATIM from generate-weekly-report.mjs (the paid Seller Intelligence report),
// so the two cannot drift through re-typing.
//
// task-87 left generate-weekly-report.mjs carrying its own copy of all of this, because it is
// live, paid and revenue-bearing and could not be touched at the time. That duplication is now
// resolved (task-100): the paid report imports this module and its local copies are deleted, so
// there is exactly one implementation of the queries, the template and the Resend layer.
//
// Callers supply their own subscriber source, their own copy strings, and their own
// List-Unsubscribe header value.

const SUPABASE_URL      = Netlify.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY');
const TCGAPI_KEY        = Netlify.env.get('TCGAPI_KEY');
const RESEND_API_KEY    = Netlify.env.get('RESEND_API_KEY');

const EPN_CAMPID    = '5339146789';
const TCGAPI_BASE   = 'https://api.tcgapi.dev/v1';
const FROM_EMAIL    = 'alerts@cardsoncardsoncards.com.au';
const FROM_NAME     = 'Cards on Cards on Cards';
const FETCH_TIMEOUT = 9000;
const SUPPORT_EMAIL = 'ccc.squadhelp@gmail.com';

// The List-Unsubscribe subject differs per list: the paid Seller Intelligence report says
// "Unsubscribe C3 Weekly Report", the free digest says "Unsubscribe C3 Weekly". Neither is
// the shared module's to decide, so callers pass their own into sendBatch. This value is a
// last-resort fallback only, so a caller that forgets still sends a valid RFC 8058 header
// rather than the string "undefined". It is deliberately neither list's wording.
const LIST_UNSUBSCRIBE = `<mailto:${SUPPORT_EMAIL}?subject=Unsubscribe%20C3>`;

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
}// ---------- data (mirrors /market logic) ----------
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
// Buy and sell signals come from mtg_signals, a table rebuilt nightly by the
// update-mtg-signals-daily pg_cron job. The high/low columns on mtg_price_snapshots
// were abandoned on 18 June 2026 when that job took over, and have been NULL on every
// row written since, so anything reading them returns nothing. mtg_signals also ships
// buy_verdict and sell_verdict already computed, so the ratio thresholds that used to
// live here are gone.
//
// The range is a high/low over all price history C3 holds, roughly ten weeks, not a
// true 52 week window. The column names say 52w because the schema predates that
// reality. Customer-facing copy says "recent", which is what the data can support.
// Every scanned row is already a signal (the verdict is the filter), so all of them reach
// the scryfall_id=in.(...) card lookup. At 400 ids that URL runs past 15KB and the request
// dies with a header overflow before it ever reaches Supabase. The top 50 rows already hold
// 46 distinct names and only 6 are ever shown, so scan far less and chunk the lookup so the
// URL cannot overflow whatever the scan returns.
const SIGNAL_SCAN_LIMIT   = 120;
const SIGNAL_MIN_AUD      = 5;
const CARD_LOOKUP_CHUNK   = 50;

// A card name has many printings, each its own scryfall_id. The email lists cards,
// not printings, so collapse by name and keep the most valuable printing of each.
function dedupeByName(list){
  const best=new Map();
  for(const c of list){
    const prev=best.get(c.name);
    if(!prev||parseFloat(c.priceAud)>parseFloat(prev.priceAud))best.set(c.name,c);
  }
  return [...best.values()];
}

// Attaches card identity to a batch of mtg_signals rows. Returns [] rather than
// throwing so a signal section degrades to "Nothing notable" instead of killing the send.
async function namedSignals(rows){
  if(!rows.length)return[];
  const chunks=[];
  for(let i=0;i<rows.length;i+=CARD_LOOKUP_CHUNK){
    const ids=rows.slice(i,i+CARD_LOOKUP_CHUNK).map(s=>s.scryfall_id).join(',');
    chunks.push(sbGet(`mtg_cards?scryfall_id=in.(${ids})&select=name,slug,set_name,rarity,scryfall_id`));
  }
  const settled=await Promise.allSettled(chunks);
  const cards=settled.flatMap(r=>r.status==='fulfilled'&&Array.isArray(r.value)?r.value:[]);
  const byId=new Map(cards.map(c=>[c.scryfall_id,c]));
  return rows.map(s=>{
    const c=byId.get(s.scryfall_id); if(!c)return null;
    return {row:s,card:c};
  }).filter(Boolean);
}

async function mtgBuy(limit){
  try{
    // Ordered by value, not cheapness. Ordering ascending surfaced six A$1.01 cards,
    // which is not a buy list any seller can act on.
    const data=await sbGet(`mtg_signals?buy_verdict=eq.buy&latest_price_aud=gte.${SIGNAL_MIN_AUD}&order=latest_price_aud.desc&limit=${SIGNAL_SCAN_LIMIT}&select=scryfall_id,latest_price_aud,price_52w_high_aud,price_52w_low_aud`);
    const pairs=await namedSignals(data);
    const rows=pairs.map(({row:s,card:c})=>{
      const high=parseFloat(s.price_52w_high_aud), price=parseFloat(s.latest_price_aud);
      if(!(high>0))return null;
      const discount=Math.round(((high-price)/high)*100);
      return {name:c.name,setName:c.set_name,rarity:c.rarity||'',slug:c.slug,priceAud:price,discount,game:'mtg'};
    }).filter(Boolean);
    return dedupeByName(rows)
      .sort((a,b)=>parseFloat(b.priceAud)-parseFloat(a.priceAud))
      .slice(0,limit);
  }catch{return[];}
}
async function mtgSell(limit){
  try{
    const data=await sbGet(`mtg_signals?sell_verdict=eq.sell&latest_price_aud=gte.${SIGNAL_MIN_AUD}&order=latest_price_aud.desc&limit=${SIGNAL_SCAN_LIMIT}&select=scryfall_id,latest_price_aud,price_52w_high_aud,price_52w_low_aud`);
    const pairs=await namedSignals(data);
    const rows=pairs.map(({row:s,card:c})=>{
      const high=parseFloat(s.price_52w_high_aud), low=parseFloat(s.price_52w_low_aud), price=parseFloat(s.latest_price_aud);
      const range=high-low;
      if(!(range>0))return null;
      const nearHighPct=Math.round(((price-low)/range)*100);
      return {name:c.name,setName:c.set_name,rarity:c.rarity||'',slug:c.slug,priceAud:price,nearHighPct,game:'mtg'};
    }).filter(Boolean);
    return dedupeByName(rows)
      .sort((a,b)=>parseFloat(b.priceAud)-parseFloat(a.priceAud))
      .slice(0,limit);
  }catch{return[];}
}// ---------- email row + html ----------
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

// `reportLabel` is the only thing parameterised away from the verbatim paid version: it is the
// masthead subtitle, and "Weekly Seller Report" is paid-tier framing that must not appear in the
// free digest. The default reproduces the paid output byte for byte, so migrating the paid
// function onto this module later is a no-op.
function buildEmail({dateStr,callTitle,callBody,up,down,buy,sell,reportLabel='Weekly Seller Report'}){
  return `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">This week in the AU TCG market: the movers, the buy signals, and where to list.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#080b12" style="background:#080b12;margin:0;padding:0;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
  <tr><td bgcolor="#0f1420" style="background:#0f1420;border:1px solid #1e2638;border-radius:10px 10px 0 0;padding:22px 26px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="font-family:Georgia,serif;font-size:15px;font-weight:bold;color:#C9A84C;letter-spacing:1px;text-transform:uppercase;">Cards on Cards on Cards</td>
      <td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#8892b0;">${esc(dateStr)}</td>
    </tr></table>
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#8892b0;margin-top:4px;">${esc(reportLabel)} &middot; Australian TCG market</div>
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
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;color:#C9A84C;border-top:1px solid #1e2638;padding-top:18px;">Grab these, well below their recent high</div>
  </td></tr>
  <tr><td bgcolor="#0f1420" style="background:#0f1420;border-left:1px solid #1e2638;border-right:1px solid #1e2638;padding:6px 26px 10px;">${sectionRows(buy,'buy')}</td></tr>
  <tr><td bgcolor="#0f1420" style="background:#0f1420;border-left:1px solid #1e2638;border-right:1px solid #1e2638;padding:8px 26px 4px;">
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;color:#f97316;border-top:1px solid #1e2638;padding-top:18px;">List these now, near their recent high</div>
  </td></tr>
  <tr><td bgcolor="#0f1420" style="background:#0f1420;border-left:1px solid #1e2638;border-right:1px solid #1e2638;padding:6px 26px 18px;">${sectionRows(sell,'sell')}</td></tr>
  <tr><td bgcolor="#0f1420" style="background:#0f1420;border-left:1px solid #1e2638;border-right:1px solid #1e2638;padding:4px 26px 26px;" align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#C9A84C" style="border-radius:8px;">
      <a href="https://cardsoncardsoncards.com.au/market" style="display:inline-block;padding:13px 28px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#080b12;text-decoration:none;">See the full live market &rarr;</a>
    </td></tr></table>
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;margin-top:12px;"><a href="https://cardsoncardsoncards.com.au/compare" style="color:#C9A84C;text-decoration:none;">Compare prices across sellers &rarr;</a></div>
  </td></tr>
  <tr><td bgcolor="#0b0e16" style="background:#0b0e16;border:1px solid #1e2638;border-top:none;border-radius:0 0 10px 10px;padding:22px 26px;">
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#8892b0;line-height:1.6;">Follow any card for real-time price alerts, no need to wait for the weekly email. <a href="https://cardsoncardsoncards.com.au/market" style="color:#C9A84C;text-decoration:none;">Browse the market and follow a card &rarr;</a></div>
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#8892b0;line-height:1.6;margin-top:12px;">Know a seller who would use this? Forward it on. They can join free at <a href="https://cardsoncardsoncards.com.au/pricing" style="color:#C9A84C;text-decoration:none;">cardsoncardsoncards.com.au</a>.</div>
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#5a6580;line-height:1.6;margin-top:14px;">Prices are indicative AUD market estimates and move constantly. Always check the live price before you buy or sell. C3 participates in the eBay Partner Network and may earn a small commission on purchases made through links, at no extra cost to you.</div>
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#5a6580;margin-top:12px;">The C3 Team &middot; <a href="{$unsubscribe}" style="color:#8892b0;text-decoration:underline;">Manage subscription</a></div>
  </td></tr>
</table>
</td></tr></table>`;
}

function plainText(dateStr,reportLabel='C3 Weekly Seller Report'){
  return `${reportLabel}, ${dateStr}.\n\nYour email client cannot display HTML.\n\nSee the full live market: https://cardsoncardsoncards.com.au/market\nCompare prices across sellers: https://cardsoncardsoncards.com.au/compare\n\nFollow any card for real-time price alerts, no need to wait for the weekly email: https://cardsoncardsoncards.com.au/market\n\nThe C3 Team.\nManage subscription: {$unsubscribe}`;
}

// Send up to 100 emails in one Resend batch call.
// `listUnsubscribe` is the RFC 8058 List-Unsubscribe header value. Each caller supplies its
// own, because the paid report and the free digest carry different unsubscribe subjects.
async function sendBatch(items, listUnsubscribe = LIST_UNSUBSCRIBE){
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
      headers:{'List-Unsubscribe':listUnsubscribe},
    }))),
  });
}
// Pull the week's movers and buy/sell signals. Identical logic to the paid report.
export async function fetchMarketData() {
  const r = await Promise.allSettled([
    mtgMovers('up',6), mtgMovers('down',6), mtgBuy(6), mtgSell(6),
    tcgMovers('pokemon','gainers',4), tcgMovers('pokemon','losers',4),
    tcgMovers('onepiece','gainers',3), tcgMovers('onepiece','losers',3),
    tcgMovers('lorcana','gainers',3), tcgMovers('lorcana','losers',3),
    tcgMovers('riftbound','gainers',3), tcgMovers('riftbound','losers',3),
  ]);
  const v = i => r[i].status === 'fulfilled' ? r[i].value : [];
  const up   = [v(0),v(4),v(6),v(8),v(10)].flat().sort((a,b)=>Math.abs(b.change7d)-Math.abs(a.change7d)).slice(0,8);
  const down = [v(1),v(5),v(7),v(9),v(11)].flat().sort((a,b)=>a.change7d-b.change7d).slice(0,6);
  return { up, down, buy: v(2), sell: v(3) };
}

export { buildEmail, plainText, sendBatch, FROM_EMAIL, FROM_NAME, LIST_UNSUBSCRIBE, SUPPORT_EMAIL, RESEND_API_KEY };
