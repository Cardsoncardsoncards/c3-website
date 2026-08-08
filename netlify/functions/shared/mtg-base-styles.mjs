// netlify/functions/shared/mtg-base-styles.mjs
//
// Task D. Lifted verbatim out of card-index.mjs so that file and the new
// mtg-random-commander.mjs can share it without either duplicating 15 lines of CSS or
// importing a page function from another page function.
//
// It interpolates NAV_CSS, so it has to be built rather than declared as a plain constant
// in a module with no access to it. Exported as a const, same shape as it had before.
import { NAV_CSS } from './nav.mjs';

const BASE_STYLES = `
  <style>
  ${NAV_CSS}
    :root { --bg:#0f1117;--bg2:#1a1d2e;--bg3:#22263a;--accent:#f5a623;--accent2:#7c6af5;--text:#e8eaf0;--text2:#9ba3c4;--border:#2d3254;--radius:12px; }
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:var(--bg);color:var(--text);font-family:sans-serif;line-height:1.6}
    a{color:var(--accent);text-decoration:none} a:hover{text-decoration:underline}
    .wrap{max-width:1100px;margin:0 auto;padding:0 24px}
    .btn{display:inline-block;padding:10px 20px;border-radius:8px;font-weight:bold;cursor:pointer;border:none;font-size:14px}
    .btn-primary{background:var(--accent);color:#000}
    .btn-secondary{background:var(--bg3);border:1px solid var(--border);color:var(--text)}
    input,select{background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:8px 12px;border-radius:6px;font-size:14px}
    footer{background:var(--bg2);border-top:1px solid var(--border);padding:24px;text-align:center;color:var(--text2);font-size:13px;margin-top:48px}
    footer a{color:var(--text2);margin:0 10px}
  </style>`;

export { BASE_STYLES };
