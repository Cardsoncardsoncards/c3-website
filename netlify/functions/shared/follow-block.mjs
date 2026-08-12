// netlify/functions/shared/follow-block.mjs
// task-132: the ONE "Follow this card" block, used by every game card page. It replaces MTG's
// legacy "Watch"/"Follow price" markup, Pokemon's broken MailerLite watch popup, and the five
// email-only follow blocks, and is what the other 25 games gain.
//
// Auth-aware AND cache-safe. Card pages are heavily CDN-cached, so the rendered markup MUST be
// identical for every visitor. The signed-in vs signed-out branch therefore happens at the
// /api/card-follow call, not in the HTML: the browser sends the httpOnly c3_session cookie
// automatically, and the backend reads it. Signed in -> the follow is added and auto-confirmed
// in one click. Signed out -> the email-capture input appears (double opt-in, as before).
//
// The block is fully self-contained (inline styles + one scoped inline script), so a game adopts
// it with a single import and one `${followBlockHtml({...})}` call, no per-page CSS needed.
//
// C3L-183, and it corrects the paragraph above. "Used by every game card page" was true of the
// IMPORT and it is still true, but rendering on every game was a defect, not a feature. 32 card
// pages import this module and only 7 games can produce an alert, because `check-card-follows`
// can evaluate 7. Nothing checked: not this module, which rendered for whatever `game` it was
// handed, and not `applyFollow()`, which inserts whatever `game` string it is passed. So the
// other 25 games offered a working, confirmable follow that was then skipped silently every
// night, forever. A weissschwarz follow (id 7) is the live proof.
//
// The gate is here rather than in `applyFollow()` because this is the only one of the two that
// can decline BEFORE making a promise to the person. Validating on write would leave a button
// that fails on click, which is a worse experience than no button. `applyFollow()` is still the
// place to add a server-side guard later; this is not a substitute for one, it is the half that
// stops the promise being made.

import { ALERTABLE_GAMES } from './game-meta.mjs';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// task-153: `printingId` is the identifier of the printing the page SERVER-RENDERED, and is
// what gets submitted unless the page offers a live printing switcher (see PRINTING_SELECTOR
// below). Pass mtg_cards.scryfall_id for MTG and <game>_cards.tcgplayer_id for the other 31
// games; shared/game-meta.mjs GAME_PRINTING_COL is the map, and follows.printing_id stores it.
// Omitting it is not an error: the follow is still recorded, it just falls back to the shared
// slug rule when read, exactly as every follow did before this task.
export function followBlockHtml({ game, slug, cardName, printingId = null }) {
  // Return EMPTY STRING, not a disabled button and not an explanatory notice. Every caller
  // interpolates this straight into a template with `${followBlockHtml({...})}`, so an empty
  // string removes the block cleanly on all 25 unsupported pages with no caller change and no
  // stray empty container. A visible "not available for this game" line was considered and
  // rejected: it advertises an absence on 25 pages to solve a problem the visitor does not have.
  if (!ALERTABLE_GAMES.has(String(game))) return '';

  const btnStyle = 'display:inline-flex;align-items:center;gap:6px;padding:9px 16px;border-radius:8px;border:1px solid rgba(201,168,76,.35);background:rgba(201,168,76,.12);color:#C9A84C;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit';
  return `
<div class="c3-follow" style="margin-top:12px">
  <button type="button" id="c3-follow-btn" style="${btnStyle}">&#128200; Follow this card</button>
  <div id="c3-follow-box" style="display:none;margin-top:10px;padding:14px;background:rgba(201,168,76,.05);border:1px solid rgba(201,168,76,.25);border-radius:8px;max-width:420px">
    <div id="c3-follow-prompt" style="font-size:13px;color:#e8eaf0;margin-bottom:8px">Enter your email and we will alert you when this card's price moves significantly.</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <input id="c3-follow-email" type="email" placeholder="you@example.com" style="flex:1;min-width:200px;padding:9px 12px;border-radius:6px;border:1px solid #242840;background:#0d1117;color:#e8eaf0;font-size:13px">
      <button type="button" id="c3-follow-submit" style="padding:9px 16px;border-radius:6px;border:none;background:#C9A84C;color:#0A0C14;font-weight:700;font-size:13px;cursor:pointer">Follow</button>
    </div>
    <div id="c3-follow-msg" style="font-size:12px;color:#9ba3c4;margin-top:8px"></div>
    <div style="font-size:11px;color:rgba(160,168,192,.5);margin-top:6px">One confirmation email, then alerts on significant moves. <a href="/account" style="color:#C9A84C">Manage your follows</a>.</div>
  </div>
  <script>
  (function(){
    var GAME=${JSON.stringify(String(game))}, SLUG=${JSON.stringify(String(slug))}, NAME=${JSON.stringify(String(cardName || ''))};
    var PRINTING=${JSON.stringify(printingId == null ? '' : String(printingId))};
    var btn=document.getElementById('c3-follow-btn'), box=document.getElementById('c3-follow-box'),
        emailEl=document.getElementById('c3-follow-email'), sub=document.getElementById('c3-follow-submit'),
        msg=document.getElementById('c3-follow-msg');
    if(!btn) return;
    // task-153: the printing on screen is not always the one the server rendered. The MTG card
    // page's printings carousel swaps the hero image, the price block and the printing info in
    // the browser, with no URL change and no reload, so by the time someone presses Follow the
    // card in front of them can be a different printing at a different price. That is precisely
    // how a customer followed the Final Fantasy Ragavan at AU$61.27 and got told about the
    // Modern Horizons 2 one at AU$86.79. So read the ACTIVE thumb at click time and prefer it;
    // fall back to the server-rendered PRINTING when a page has no switcher, which is all 31
    // other games. Read at click time, never cached at load, or switching then following
    // submits the stale one.
    function currentPrinting(){
      try{
        var el=document.querySelector('.printing-thumb.active[data-printing-id]');
        if(el && el.getAttribute('data-printing-id')) return el.getAttribute('data-printing-id');
      }catch(e){}
      return PRINTING;
    }
    function post(body){
      body.printingId=currentPrinting();
      return fetch('/api/card-follow',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(body)})
        .then(function(r){ return r.json(); });
    }
    function done(){ btn.textContent='\\u2713 Following'; btn.disabled=true; btn.style.opacity='.8'; box.style.display='none'; }
    btn.addEventListener('click', function(){
      // Try the signed-in one-click path first (no email; the session cookie is sent automatically).
      // Reveal the email box immediately so signed-out users feel no delay; hide it again if the
      // one-click succeeds.
      btn.disabled=true; box.style.display='block';
      post({game:GAME,cardSlug:SLUG,cardName:NAME}).then(function(d){
        if(d && d.ok && (d.followed || d.alreadyFollowing)){ done(); }
        else if(d && d.needEmail){ btn.style.display='none'; emailEl.focus(); }
        else { btn.disabled=false; }
      }).catch(function(){ btn.disabled=false; });
    });
    sub.addEventListener('click', function(){
      var email=(emailEl.value||'').trim(); var at=email.indexOf('@');
      if(at<1 || email.lastIndexOf('.')<at){ msg.textContent='Please enter a valid email address.'; return; }
      sub.disabled=true; sub.textContent='Saving...';
      post({game:GAME,cardSlug:SLUG,cardName:NAME,email:email}).then(function(d){
        if(d && d.ok){ msg.textContent = d.alreadyFollowing ? 'You are already following this card.' : 'Check your inbox to confirm.'; emailEl.style.display='none'; sub.style.display='none'; }
        else { msg.textContent=(d&&d.error)||'Something went wrong. Please try again.'; sub.disabled=false; sub.textContent='Follow'; }
      }).catch(function(){ msg.textContent='Something went wrong. Please try again.'; sub.disabled=false; sub.textContent='Follow'; });
    });
  })();
  </script>
</div>`;
}
