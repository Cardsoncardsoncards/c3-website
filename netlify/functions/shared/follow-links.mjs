// netlify/functions/shared/follow-links.mjs
// task-111: the one definition of the "manage your follows" link that sits under the follow
// button on a card page.
//
// The follow box itself is duplicated byte-for-byte across all seven card-page files
// (card-page.mjs for MTG plus the six per-game ones). No shared card-page component exists,
// and building one is far out of scope for a task that only adds links. So rather than paste
// this snippet seven times and let it drift, the snippet lives here once and each card page
// imports it. If the wording or the destination ever changes, it changes in one place.
//
// Deliberately low emphasis: a small muted line, not a second button. The primary action on a
// card page is still following the card, and this must not compete with it. It exists for the
// person who already has an account and is following their second or third card, so they have
// an obvious route to the dashboard without digging through an old email.

export const MANAGE_FOLLOWS_LINK =
  `<div style="font-size:11px;color:rgba(160,168,192,.5);margin-top:6px">Already following cards? <a href="/account" style="color:#C9A84C">Manage your follows</a>.</div>`;
