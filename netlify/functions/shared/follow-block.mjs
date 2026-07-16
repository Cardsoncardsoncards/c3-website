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

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function followBlockHtml({ game, slug, cardName }) {
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
    var btn=document.getElementById('c3-follow-btn'), box=document.getElementById('c3-follow-box'),
        emailEl=document.getElementById('c3-follow-email'), sub=document.getElementById('c3-follow-submit'),
        msg=document.getElementById('c3-follow-msg');
    if(!btn) return;
    function post(body){
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
