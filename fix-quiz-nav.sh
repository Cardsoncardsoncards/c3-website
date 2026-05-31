#!/bin/bash
# Run from: C:\Users\sgyim\OneDrive\Desktop\C3 Website\c3-eleventy\c3-eleventy
# Usage: bash fix-quiz-nav.sh
# This updates nav + footer paths in all 15 existing quiz files.

QUIZ_DIR="./quizzes"

FILES=(
  "digimon-partner.html"
  "dragonball-character.html"
  "investor-collector.html"
  "lorcana-ink.html"
  "mtg-archetype.html"
  "mtg-colour.html"
  "onepiece-character.html"
  "pokemon-era.html"
  "rarity.html"
  "riftbound-champion.html"
  "starwars-affiliation.html"
  "weissschwarz-series.html"
  "which-tcg.html"
  "which-tcg-extended.html"
  "yugioh-archetype.html"
)

for FILE in "${FILES[@]}"; do
  PATH_FULL="$QUIZ_DIR/$FILE"
  if [ ! -f "$PATH_FULL" ]; then
    echo "SKIP (not found): $FILE"
    continue
  fi

  # NAV: Card Vault -> Card Prices
  sed -i 's/class="nav-link">Card Vault</class="nav-link">Card Prices</g' "$PATH_FULL"
  sed -i 's/style="color:#C9A84C;border-color:rgba(201,168,76,.35)">Card Vault</style="color:#C9A84C;border-color:rgba(201,168,76,.35)">Card Prices</g' "$PATH_FULL"

  # NAV: /shop.html -> /shop
  sed -i 's|href="/shop.html" class="nav-link">Shop|href="/shop" class="nav-link">Shop|g' "$PATH_FULL"

  # NAV: /ev-calculator.html -> /tools
  sed -i 's|href="/ev-calculator.html" class="nav-link">EV Calc|href="/tools" class="nav-link">EV Calc|g' "$PATH_FULL"

  # NAV: /tracker.html -> /tracker
  sed -i 's|href="/tracker.html" class="nav-link">Tracker|href="/tracker" class="nav-link">Tracker|g' "$PATH_FULL"

  # NAV: Quizzes active -> /play
  sed -i 's|href="/quizzes" class="nav-link nav-link--active">Quizzes|href="/play" class="nav-link nav-link--active">Quizzes|g' "$PATH_FULL"
  sed -i 's|href="/quizzes" class="nav-link nav-link--active">Play|href="/play" class="nav-link nav-link--active">Quizzes|g' "$PATH_FULL"
  # which-tcg-extended has both /play and /quizzes active - deduplicate
  sed -i 's|href="/play" class="nav-link nav-link--active">Play</a>.*href="/quizzes" class="nav-link nav-link--active">Quizzes|href="/play" class="nav-link nav-link--active">Quizzes|g' "$PATH_FULL"

  # NAV: Remove Calendar, replace with Market
  sed -i 's|<a href="/calendar" class="nav-link">Calendar</a>|<a href="/market" class="nav-link">Market</a>|g' "$PATH_FULL"

  # FOOTER: Card Vault -> Card Prices
  sed -i 's|href="/cards">Card Vault|href="/cards">Card Prices|g' "$PATH_FULL"

  # FOOTER: /shop.html -> /shop
  sed -i 's|href="/shop.html">Shop|href="/shop">Shop|g' "$PATH_FULL"

  # FOOTER: /tracker.html -> /tracker
  sed -i 's|href="/tracker.html">Tracker|href="/tracker">Tracker|g' "$PATH_FULL"

  # FOOTER: /quizzes -> /play (footer link text)
  sed -i 's|href="/quizzes">Quizzes|href="/play">Quizzes|g' "$PATH_FULL"

  # FOOTER: /contact.html -> /contact
  sed -i 's|href="/contact.html">Contact|href="/contact">Contact|g' "$PATH_FULL"

  echo "UPDATED: $FILE"
done

echo ""
echo "Done. Verify with:"
echo "  grep -r 'Card Vault\|/shop.html\|/tracker.html\|/ev-calculator\|/calendar\|/contact.html' ./quizzes/"
echo "  (should return nothing)"
