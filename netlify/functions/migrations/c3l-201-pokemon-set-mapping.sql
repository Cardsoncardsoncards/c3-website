-- c3l-201-pokemon-set-mapping.sql
-- task4, 2 September 2026. C3L-201 / C3L-103.
--
-- ============================================================================
-- THIS MIGRATION IS NOT APPLIED. It is the human-reviewable output Phase 2 asked for.
-- Read the status column before anything consumes this table.
-- ============================================================================
--
-- WHY A TABLE AND NOT AN ALGORITHM. C3 holds 238 pokemon sets. pokemontcg.io publishes
-- 174 sets in total. Those two catalogues are not the same shape and never will be, so a
-- matcher that is clever enough to close the gap is also clever enough to match the wrong set,
-- and enriching a card with another set's stats is worse than the current empty state.
--
-- COVERAGE, measured rather than estimated:
--   ready                : 134 of 238 sets (56.3%)
--   needs-manual-review  : 104
--   baseline before this : 72 of 236 (30.5%) by the name matching in sync-pokemon-enrichment-background.mjs
--
-- MATCH METHODS AND WHAT EACH ONE IS WORTH:
--   exact                    114
--   none                      63
--   exact_name                26
--   date_unique_token         24
--   date_only                 11
--
-- A row is only ever 'ready' when the NAMES agree, after a conservative normalisation that
-- folds case, punctuation, the and/ampersand split and the numeric prefixes C3 adds
-- ("SWSH05:", "SV03:"). Date proximity ALONE never promotes a row. That restraint is not
-- theoretical: several Pokemon sets ship on the same day, and Crown Zenith, its Galarian
-- Gallery, Hidden Fates and its Shiny Vault would all have matched each other on date.
--
-- CONFLICT RESOLUTION, the part that matters most. The first pass produced 11 upstream ids
-- claimed by more than one C3 set, which is exactly how a card would receive another set's
-- stats. Every contested id was resolved before anything was marked ready:
--   - one high-confidence claimant and the rest merely coinciding on date: the named match
--     stays ready and the others are demoted. This is what separated "Diamond and Pearl"
--     (kept, matches dp1 by name) from "Diamond and Pearl Promos" (demoted, a different set).
--   - two or more equally strong claimants: ALL are demoted. C3 holds three separate rows
--     called some form of "Crown Zenith" and nothing available here can say which of them the
--     cards actually live under, so none of them is trusted.
-- 16 rows were demoted this way. ZERO upstream ids are now claimed by more than one C3 set,
-- which is asserted by a constraint below rather than left as a claim in a comment.
--
-- WHAT THIS TABLE DOES NOT FIX, stated plainly because the task asked for it. The enrichment
-- job cannot run today for a reason that has nothing to do with matching:
--   1. POKEMONTCG_API_KEY does not exist in the Netlify environment. The function returns 500
--      before it reaches any matching code, so 0 of 32,593 cards being enriched is explained by
--      the missing key, not by the abbreviation gap.
--   2. sync-pokemon-enrichment-background.mjs declares export const config = {}, so it has no
--      schedule and no path and is never invoked automatically.
-- Both must be fixed before this mapping changes a single card. See the register.

BEGIN;

CREATE TABLE IF NOT EXISTS public.pokemon_set_mapping (
  c3_set_id     bigint PRIMARY KEY,
  c3_set_name   text NOT NULL,
  ptcg_set_id   text,
  match_method  text NOT NULL,
  confidence    text NOT NULL,
  status        text NOT NULL,
  note          text,
  reviewed_by   text,
  reviewed_at   timestamp with time zone,
  created_at    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT pokemon_set_mapping_status_chk
    CHECK (status IN ('ready', 'needs-manual-review')),
  -- A 'ready' row without a target is meaningless, and a consumer that trusted status alone
  -- would dereference NULL. Made unstorable rather than documented.
  CONSTRAINT pokemon_set_mapping_ready_has_target_chk
    CHECK (status <> 'ready' OR ptcg_set_id IS NOT NULL)
);

-- The single most important line in this file. Two C3 sets pointing at one pokemontcg.io set
-- is the mechanism that enriches a card with another set's stats. This makes that state
-- physically unstorable rather than relying on the generator having got it right.
CREATE UNIQUE INDEX IF NOT EXISTS pokemon_set_mapping_unique_target
  ON public.pokemon_set_mapping (ptcg_set_id)
  WHERE ptcg_set_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS pokemon_set_mapping_status_idx
  ON public.pokemon_set_mapping (status);

ALTER TABLE public.pokemon_set_mapping ENABLE ROW LEVEL SECURITY;

-- Matches the convention every other non-identity table here uses: anon reads, service writes.
CREATE POLICY anon_select_pokemon_set_mapping ON public.pokemon_set_mapping
  AS PERMISSIVE FOR SELECT TO anon USING (true);
CREATE POLICY service_all_pokemon_set_mapping ON public.pokemon_set_mapping
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.pokemon_set_mapping
  (c3_set_id, c3_set_name, ptcg_set_id, match_method, confidence, status, note)
VALUES
  (5500001, 'Crown Zenith', NULL, 'exact', 'none', 'needs-manual-review', 'names identical, released 0d apart. DEMOTED: 3 C3 sets claim this upstream set on equally strong evidence, so none can be trusted. upstream swsh12pt5 is also claimed by SWSH: Crown Zenith and SWSH: Crown Zenith'),
  (5500002, 'McDonald''s Promos 2016', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500003, 'Sandstorm', 'ex2', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500004, 'XY - Steam Siege', 'xy11', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500005, 'Base Set', NULL, 'date_only', 'none', 'needs-manual-review', '1 upstream sets share this release date, none separable by name'),
  (5500006, 'Base Set 2', 'base4', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500007, 'Base Set (Shadowless)', NULL, 'date_only', 'none', 'needs-manual-review', '1 upstream sets share this release date, none separable by name'),
  (5500008, 'Platinum', 'pl1', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500009, 'SV10: Destined Rivals', 'sv10', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500010, 'Battle Academy 2022', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500011, 'Aquapolis', 'ecard2', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500012, 'XY Trainer Kit: Bisharp & Wigglytuff', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500013, 'SM - Ultra Prism', 'sm5', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500014, 'MEE: Mega Evolution Energies', NULL, 'date_unique_token', 'none', 'needs-manual-review', 'only upstream set on 2025-09-26 sharing a name token (2 shared). DEMOTED: ME01: Mega Evolution matched the same upstream set on name, this row only coincided. upstream me1 is also claimed by ME: Mega Evolution Promo and ME01: Mega Evolution'),
  (5500015, 'Power Keepers', 'ex16', 'exact', 'high', 'ready', 'names identical, released 1d apart'),
  (5500016, 'Team Rocket Returns', 'ex7', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500017, 'SV: Prismatic Evolutions', 'sv8pt5', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500018, 'SM Base Set', NULL, 'date_only', 'none', 'needs-manual-review', '2 upstream sets share this release date, none separable by name'),
  (5500019, 'XY - Flashfire', 'xy2', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500020, 'Deoxys', 'ex8', 'exact_name', 'high', 'ready', 'names identical, released 13d apart'),
  (5500021, 'Pokemon GO', NULL, 'date_only', 'none', 'needs-manual-review', '1 upstream sets share this release date, none separable by name'),
  (5500022, 'HGSS Trainer Kit: Gyarados & Raichu', NULL, 'date_only', 'none', 'needs-manual-review', '1 upstream sets share this release date, none separable by name'),
  (5500023, 'First Partner Pack', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500024, 'SWSH11: Lost Origin', 'swsh11', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500025, 'SWSH01: Sword & Shield Base Set', 'swsh1', 'date_unique_token', 'medium', 'needs-manual-review', 'only upstream set on 2020-02-07 sharing a name token (2 shared)'),
  (5500026, 'Professor Program Promos', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500027, 'XY - Furious Fists', 'xy3', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500028, 'Champion''s Path', 'swsh35', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500029, 'World Championship Decks', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500030, 'SV: Paldean Fates', 'sv4pt5', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500031, 'Ash vs Team Rocket Deck Kit (JP Exclusive)', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500032, 'SV01: Scarlet & Violet Base Set', NULL, 'date_only', 'none', 'needs-manual-review', '2 upstream sets share this release date, none separable by name'),
  (5500033, 'McDonald''s Promos 2023', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500034, 'Diamond and Pearl', 'dp1', 'exact_name', 'high', 'ready', 'names identical, released 22d apart'),
  (5500035, 'Stormfront', 'dp7', 'exact_name', 'high', 'ready', 'names identical, released 4d apart'),
  (5500036, 'SM - Guardians Rising', 'sm2', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500037, 'HeartGold SoulSilver', 'hgss1', 'date_unique_token', 'medium', 'needs-manual-review', 'only upstream set on 2010-02-10 sharing a name token (2 shared)'),
  (5500038, 'Southern Islands', 'si1', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500039, 'Neo Revelation', 'neo3', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500040, 'Team Magma vs Team Aqua', 'ex4', 'exact_name', 'high', 'ready', 'names identical, released 14d apart'),
  (5500041, 'SWSH05: Battle Styles', 'swsh5', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500042, 'Shining Fates: Shiny Vault', 'swsh45sv', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500043, 'SM - Crimson Invasion', 'sm4', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500044, 'POP Series 2', 'pop2', 'exact_name', 'high', 'ready', 'names identical, a release date is missing'),
  (5500045, 'SV07: Stellar Crown', 'sv7', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500046, 'Mysterious Treasures', 'dp2', 'exact_name', 'high', 'ready', 'names identical, released 21d apart'),
  (5500047, 'ME03: Perfect Order', 'me3', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500048, 'SWSH07: Evolving Skies', 'swsh7', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500049, 'Dragon Majesty', 'sm75', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500050, 'Kalos Starter Set', 'xy0', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500051, 'SV06: Twilight Masquerade', 'sv6', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500052, 'Ruby and Sapphire', 'ex1', 'exact_name', 'high', 'ready', 'names identical, released 13d apart'),
  (5500053, 'Trading Card Game Classic', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500054, 'Fossil', 'base3', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500055, 'Nintendo Promos', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500056, 'Crystal Guardians', 'ex14', 'exact_name', 'high', 'ready', 'names identical, released 29d apart'),
  (5500057, 'POP Series 9', 'pop9', 'exact_name', 'high', 'ready', 'names identical, a release date is missing'),
  (5500058, 'Shining Legends', 'sm35', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500059, 'Delta Species', 'ex11', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500060, 'Alternate Art Promos', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500061, 'SWSH10: Astral Radiance Trainer Gallery', 'swsh10tg', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500062, 'Legendary Collection', 'base6', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500063, 'Supreme Victors', 'pl3', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500064, 'Plasma Blast', 'bw10', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500065, 'HGSS Promos', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500066, 'SV05: Temporal Forces', 'sv5', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500067, 'XY - Phantom Forces', 'xy4', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500068, 'Detective Pikachu', 'det1', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500069, 'Jumbo Cards', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500070, 'SV: Scarlet & Violet Promo Cards', NULL, 'date_only', 'none', 'needs-manual-review', '2 upstream sets share this release date, none separable by name'),
  (5500071, 'Unseen Forces', 'ex10', 'exact_name', 'high', 'ready', 'names identical, released 21d apart'),
  (5500072, 'XY Trainer Kit: Sylveon & Noivern', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500073, 'EX Battle Stadium', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500074, 'SM Trainer Kit: Alolan Sandslash & Alolan Ninetales', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500075, 'Pikachu World Collection Promos', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500076, 'SM Promos', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500077, 'SV09: Journey Together', 'sv9', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500078, 'Triumphant', 'hgss4', 'date_unique_token', 'medium', 'needs-manual-review', 'only upstream set on 2010-11-03 sharing a name token (1 shared)'),
  (5500079, 'SM - Team Up', 'sm9', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500080, 'Dragon Vault', 'dv1', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500081, 'Trick or Trade BOOster Bundle', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500082, 'Secret Wonders', 'dp3', 'exact_name', 'high', 'ready', 'names identical, released 6d apart'),
  (5500083, 'Hidden Fates: Shiny Vault', 'sma', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500084, 'Trick or Trade BOOster Bundle 2023', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500085, 'Gym Challenge', 'gym2', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500086, 'POP Series 4', 'pop4', 'exact_name', 'high', 'ready', 'names identical, a release date is missing'),
  (5500087, 'League & Championship Cards', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500088, 'SM - Celestial Storm', 'sm7', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500089, 'Generations', 'g1', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500090, 'SVE: Scarlet & Violet Energies', 'sve', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500091, 'Black and White Promos', NULL, 'date_unique_token', 'none', 'needs-manual-review', 'only upstream set on 2011-04-25 sharing a name token (2 shared). DEMOTED: Black and White matched the same upstream set on name, this row only coincided. upstream bw1 is also claimed by Black and White'),
  (5500092, 'e-Reader Sample Cards', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500093, 'SV: Black Bolt', 'zsv10pt5', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500094, 'SWSH02: Rebel Clash', 'swsh2', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500095, 'XY - Roaring Skies', 'xy6', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500096, 'Arceus', 'pl4', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500097, 'McDonald''s Promos 2011', 'mcd11', 'date_unique_token', 'medium', 'needs-manual-review', 'only upstream set on 2011-06-17 sharing a name token (2 shared)'),
  (5500098, 'Legendary Treasures: Radiant Collection', NULL, 'date_unique_token', 'none', 'needs-manual-review', 'only upstream set on 2013-11-06 sharing a name token (2 shared). DEMOTED: Legendary Treasures matched the same upstream set on name, this row only coincided. upstream bw11 is also claimed by Legendary Treasures'),
  (5500099, 'SWSH10: Astral Radiance', 'swsh10', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500100, 'Dragon Frontiers', 'ex15', 'exact_name', 'high', 'ready', 'names identical, released 7d apart'),
  (5500101, 'Deck Exclusives', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500102, 'Call of Legends', 'col1', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500103, 'Blister Exclusives', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500104, 'Hidden Legends', 'ex5', 'exact_name', 'high', 'ready', 'names identical, released 13d apart'),
  (5500105, 'Neo Discovery', 'neo2', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500106, 'Plasma Freeze', 'bw9', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500107, 'SWSH03: Darkness Ablaze', 'swsh3', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500108, 'Legend Maker', 'ex12', 'exact_name', 'high', 'ready', 'names identical, released 12d apart'),
  (5500109, 'Battle Academy 2024', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500110, 'Kids WB Promos', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500111, 'ME: Mega Evolution Promo', NULL, 'date_unique_token', 'none', 'needs-manual-review', 'only upstream set on 2025-09-26 sharing a name token (2 shared). DEMOTED: ME01: Mega Evolution matched the same upstream set on name, this row only coincided. upstream me1 is also claimed by MEE: Mega Evolution Energies and ME01: Mega Evolution'),
  (5500112, 'ME: Ascended Heroes', 'me2pt5', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500113, 'Legends Awakened', 'dp6', 'exact_name', 'high', 'ready', 'names identical, released 19d apart'),
  (5500114, 'Celebrations', 'cel25', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500115, 'Black and White', 'bw1', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500116, 'Diamond and Pearl Promos', NULL, 'date_unique_token', 'none', 'needs-manual-review', 'only upstream set on 2007-05-01 sharing a name token (2 shared). DEMOTED: Diamond and Pearl matched the same upstream set on name, this row only coincided. upstream dp1 is also claimed by Diamond and Pearl'),
  (5500117, 'McDonald''s 25th Anniversary Promos', 'mcd21', 'date_unique_token', 'medium', 'needs-manual-review', 'only upstream set on 2021-02-09 sharing a name token (1 shared)'),
  (5500118, 'XY - Primal Clash', 'xy5', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500119, 'SM - Burning Shadows', 'sm3', 'exact', 'high', 'ready', 'names identical, released 1d apart'),
  (5500120, 'XY Base Set', NULL, 'date_only', 'none', 'needs-manual-review', '1 upstream sets share this release date, none separable by name'),
  (5500121, 'XY Trainer Kit: Latias & Latios', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500122, 'Celebrations: Classic Collection', 'cel25c', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500123, 'Miscellaneous Cards & Products', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500124, 'Trick or Trade BOOster Bundle 2024', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500125, 'Hidden Fates', 'sm115', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500126, 'Jungle', 'base2', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500127, 'POP Series 6', 'pop6', 'exact_name', 'high', 'ready', 'names identical, a release date is missing'),
  (5500128, 'POP Series 3', 'pop3', 'exact_name', 'high', 'ready', 'names identical, a release date is missing'),
  (5500129, 'Emerging Powers', 'bw2', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500130, 'SWSH11: Lost Origin Trainer Gallery', 'swsh11tg', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500131, 'Battle Academy', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500132, 'DP Trainer Kit: Manaphy & Lucario', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500133, 'Generations: Radiant Collection', NULL, 'date_unique_token', 'none', 'needs-manual-review', 'only upstream set on 2016-02-22 sharing a name token (1 shared). DEMOTED: Generations matched the same upstream set on name, this row only coincided. upstream g1 is also claimed by Generations'),
  (5500134, 'SM Trainer Kit: Lycanroc & Alolan Raichu', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500135, 'Great Encounters', 'dp4', 'exact_name', 'high', 'ready', 'names identical, released 12d apart'),
  (5500136, 'McDonald''s Promos 2024', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500137, 'Undaunted', 'hgss3', 'date_unique_token', 'medium', 'needs-manual-review', 'only upstream set on 2010-08-18 sharing a name token (1 shared)'),
  (5500138, 'SV03: Obsidian Flames', 'sv3', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500139, 'SV: Shrouded Fable', 'sv6pt5', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500140, 'Boundaries Crossed', 'bw7', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500141, 'SM - Lost Thunder', 'sm8', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500142, 'Rumble', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500143, 'Dragon', 'ex3', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500144, 'SWSH09: Brilliant Stars Trainer Gallery', 'swsh9tg', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500145, 'McDonald''s Promos 2017', 'mcd17', 'date_unique_token', 'medium', 'needs-manual-review', 'only upstream set on 2017-11-07 sharing a name token (2 shared)'),
  (5500146, 'POP Series 1', 'pop1', 'exact_name', 'high', 'ready', 'names identical, a release date is missing'),
  (5500147, 'XY - Evolutions', 'xy12', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500148, 'EX Trainer Kit 1: Latias & Latios', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500149, 'SWSH: Sword & Shield Promo Cards', NULL, 'date_only', 'none', 'needs-manual-review', '1 upstream sets share this release date, none separable by name'),
  (5500150, 'SV02: Paldea Evolved', 'sv2', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500151, 'Burger King Promos', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500152, 'ME02: Phantasmal Flames', 'me2', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500153, 'SV: White Flare', 'rsv10pt5', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500154, 'Crown Zenith: Galarian Gallery', NULL, 'exact', 'none', 'needs-manual-review', 'names identical, released 0d apart. DEMOTED: 3 C3 sets claim this upstream set on equally strong evidence, so none can be trusted. upstream swsh12pt5gg is also claimed by SWSH: Crown Zenith: Galarian Gallery and SWSH: Crown Zenith: Galarian Gallery'),
  (5500155, 'Plasma Storm', 'bw8', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500156, 'Neo Destiny', 'neo4', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500157, 'Gym Heroes', 'gym1', 'exact_name', 'high', 'ready', 'names identical, released 61d apart'),
  (5500158, 'XY Trainer Kit: Pikachu Libre & Suicune', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500159, 'BW Trainer Kit: Excadrill & Zoroark', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500160, 'Skyridge', 'ecard3', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500161, 'SWSH12: Silver Tempest', 'swsh12', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500162, 'WoTC Promo', NULL, 'date_only', 'none', 'needs-manual-review', '1 upstream sets share this release date, none separable by name'),
  (5500163, 'Emerald', 'ex9', 'exact_name', 'high', 'ready', 'names identical, released 8d apart'),
  (5500164, 'McDonald''s Promos 2012', 'mcd12', 'date_unique_token', 'medium', 'needs-manual-review', 'only upstream set on 2012-06-15 sharing a name token (2 shared)'),
  (5500165, 'My First Battle', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500166, 'Expedition', 'ecard1', 'date_unique_token', 'medium', 'needs-manual-review', 'only upstream set on 2002-09-15 sharing a name token (1 shared)'),
  (5500167, 'Unleashed', 'hgss2', 'date_unique_token', 'medium', 'needs-manual-review', 'only upstream set on 2010-05-12 sharing a name token (1 shared)'),
  (5500168, 'EX Trainer Kit 2: Plusle & Minun', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500169, 'XY - Fates Collide', 'xy10', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500170, 'SWSH06: Chilling Reign', 'swsh6', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500171, 'SV: Scarlet & Violet 151', 'sv3pt5', 'date_unique_token', 'medium', 'needs-manual-review', 'only upstream set on 2023-09-22 sharing a name token (1 shared)'),
  (5500172, 'McDonald''s Promos 2015', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500173, 'Rising Rivals', 'pl2', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500174, 'Majestic Dawn', 'dp5', 'exact_name', 'high', 'ready', 'names identical, released 20d apart'),
  (5500175, 'Shining Fates', 'swsh45', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500176, 'Next Destinies', 'bw4', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500177, 'XY Promos', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500178, 'SWSH04: Vivid Voltage', 'swsh4', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500179, 'ME01: Mega Evolution', 'me1', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500180, 'SV08: Surging Sparks', 'sv8', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500181, 'Player Placement Trainer Promos', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500182, 'Holon Phantoms', 'ex13', 'exact', 'high', 'ready', 'names identical, released 2d apart'),
  (5500183, 'First Partner Collection 2026', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500184, 'Dragons Exalted', 'bw6', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500185, 'POP Series 7', 'pop7', 'exact_name', 'high', 'ready', 'names identical, a release date is missing'),
  (5500186, 'Best of Promos', 'bp', 'date_unique_token', 'medium', 'needs-manual-review', 'only upstream set on 2002-12-01 sharing a name token (1 shared)'),
  (5500187, 'Double Crisis', 'dc1', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500188, 'XY - BREAKpoint', 'xy9', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500189, 'Noble Victories', 'bw3', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500190, 'Team Rocket', 'base5', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500191, 'SM - Unbroken Bonds', 'sm10', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500192, 'SM - Forbidden Light', 'sm6', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500193, 'McDonald''s Promos 2018', NULL, 'date_only', 'none', 'needs-manual-review', '1 upstream sets share this release date, none separable by name'),
  (5500194, 'Prize Pack Series Cards', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500195, 'XY - BREAKthrough', 'xy8', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500196, 'XY - Ancient Origins', 'xy7', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500197, 'SWSH12: Silver Tempest Trainer Gallery', 'swsh12tg', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500198, 'McDonald''s Promos 2022', 'mcd22', 'date_unique_token', 'medium', 'needs-manual-review', 'only upstream set on 2022-08-03 sharing a name token (2 shared)'),
  (5500199, 'POP Series 5', 'pop5', 'exact_name', 'high', 'ready', 'names identical, a release date is missing'),
  (5500200, 'McDonald''s Promos 2014', 'mcd14', 'date_unique_token', 'medium', 'needs-manual-review', 'only upstream set on 2014-05-23 sharing a name token (2 shared)'),
  (5500201, 'SWSH09: Brilliant Stars', 'swsh9', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500202, 'POP Series 8', 'pop8', 'exact_name', 'high', 'ready', 'names identical, a release date is missing'),
  (5500203, 'McDonald''s Promos 2019', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500204, 'Dark Explorers', 'bw5', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500205, 'Neo Genesis', 'neo1', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500206, 'SM - Cosmic Eclipse', 'sm12', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500207, 'Legendary Treasures', 'bw11', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500208, 'SWSH08: Fusion Strike', 'swsh8', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500209, 'FireRed & LeafGreen', 'ex6', 'exact', 'high', 'ready', 'names identical, released 2d apart'),
  (5500210, 'Countdown Calendar Promos', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500211, 'SM - Unified Minds', 'sm11', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500212, 'SV04: Paradox Rift', 'sv4', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500213, 'ME04: Chaos Rising', 'me4', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500214, 'SWSH: Crown Zenith', NULL, 'exact', 'none', 'needs-manual-review', 'names identical, released 0d apart. DEMOTED: 3 C3 sets claim this upstream set on equally strong evidence, so none can be trusted. upstream swsh12pt5 is also claimed by Crown Zenith and SWSH: Crown Zenith'),
  (5500215, 'SWSH: Crown Zenith: Galarian Gallery', NULL, 'exact', 'none', 'needs-manual-review', 'names identical, released 0d apart. DEMOTED: 3 C3 sets claim this upstream set on equally strong evidence, so none can be trusted. upstream swsh12pt5gg is also claimed by Crown Zenith: Galarian Gallery and SWSH: Crown Zenith: Galarian Gallery'),
  (5500216, 'ME05: Pitch Black', 'me5', 'exact', 'high', 'ready', 'names identical, released 0d apart'),
  (5500217, 'SWSH: Crown Zenith', NULL, 'exact', 'none', 'needs-manual-review', 'names identical, released 0d apart. DEMOTED: 3 C3 sets claim this upstream set on equally strong evidence, so none can be trusted. upstream swsh12pt5 is also claimed by Crown Zenith and SWSH: Crown Zenith'),
  (5500218, 'SWSH: Crown Zenith: Galarian Gallery', NULL, 'exact', 'none', 'needs-manual-review', 'names identical, released 0d apart. DEMOTED: 3 C3 sets claim this upstream set on equally strong evidence, so none can be trusted. upstream swsh12pt5gg is also claimed by Crown Zenith: Galarian Gallery and SWSH: Crown Zenith: Galarian Gallery'),
  (5500219, 'ME: 30th Celebration', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500220, 'EX Holon Phantoms', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500221, 'EX Dragon Frontiers', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500222, 'EX Emerald', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500223, 'EX Legend Maker', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500224, 'EX Dragon', NULL, 'date_unique_token', 'none', 'needs-manual-review', 'only upstream set on 2003-11-24 sharing a name token (1 shared). DEMOTED: Dragon matched the same upstream set on name, this row only coincided. upstream ex3 is also claimed by Dragon'),
  (5500225, 'EX Team Magma vs Team Aqua', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500226, 'EX Team Rocket Returns', NULL, 'date_unique_token', 'none', 'needs-manual-review', 'only upstream set on 2004-11-01 sharing a name token (3 shared). DEMOTED: Team Rocket Returns matched the same upstream set on name, this row only coincided. upstream ex7 is also claimed by Team Rocket Returns'),
  (5500227, 'EX Crystal Guardians', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500228, 'EX Ruby and Sapphire', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500229, 'EX Power Keepers', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500230, 'EX FireRed & LeafGreen', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500231, 'EX Hidden Legends', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500232, 'EX Unseen Forces', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500233, 'EX Deoxys', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500234, 'EX Delta Species', NULL, 'date_unique_token', 'none', 'needs-manual-review', 'only upstream set on 2005-10-31 sharing a name token (2 shared). DEMOTED: Delta Species matched the same upstream set on name, this row only coincided. upstream ex11 is also claimed by Delta Species'),
  (5500235, 'EX Sandstorm', NULL, 'date_unique_token', 'none', 'needs-manual-review', 'only upstream set on 2003-09-18 sharing a name token (1 shared). DEMOTED: Sandstorm matched the same upstream set on name, this row only coincided. upstream ex2 is also claimed by Sandstorm'),
  (5500236, 'ME06: Delta Reign', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500237, 'Southeast Asia Exclusives', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date'),
  (5500238, 'ME: 30th Celebration Classic Collection', NULL, 'none', 'none', 'needs-manual-review', 'no upstream set with this name or release date')
ON CONFLICT (c3_set_id) DO UPDATE SET
  c3_set_name  = EXCLUDED.c3_set_name,
  ptcg_set_id  = EXCLUDED.ptcg_set_id,
  match_method = EXCLUDED.match_method,
  confidence   = EXCLUDED.confidence,
  status       = EXCLUDED.status,
  note         = EXCLUDED.note;

COMMIT;

-- ============================================================================
-- HOW A REVIEWER USES THIS
-- ============================================================================
-- The 104 needs-manual-review rows are listed below with the reason each one failed.
-- To approve one by hand, after checking it on pokemontcg.io:
--
--   UPDATE public.pokemon_set_mapping
--      SET ptcg_set_id = '<the id>', status = 'ready', confidence = 'manual',
--          match_method = 'manual', reviewed_by = '<who>', reviewed_at = now()
--    WHERE c3_set_id = <id>;
--
-- The unique index will refuse the update if that upstream set is already spoken for, which is
-- the safety net doing its job rather than an error to work around.
--
-- ROLLBACK: DROP TABLE public.pokemon_set_mapping;
--
-- THE 104 ROWS NEEDING REVIEW:
--   5500001  Crown Zenith                                          exact              names identical, released 0d apart. DEMOTED: 3 C3 sets claim this upstream set on equally strong evidence, so none can be trusted. upstream swsh12pt5 is also claimed by SWSH: Crown Zenith and SWSH: Crown Zenith
--   5500002  McDonald's Promos 2016                                none               no upstream set with this name or release date
--   5500005  Base Set                                              date_only          1 upstream sets share this release date, none separable by name
--   5500007  Base Set (Shadowless)                                 date_only          1 upstream sets share this release date, none separable by name
--   5500010  Battle Academy 2022                                   none               no upstream set with this name or release date
--   5500012  XY Trainer Kit: Bisharp & Wigglytuff                  none               no upstream set with this name or release date
--   5500014  MEE: Mega Evolution Energies                          date_unique_token  only upstream set on 2025-09-26 sharing a name token (2 shared). DEMOTED: ME01: Mega Evolution matched the same upstream set on name, this row only coincided. upstream me1 is also claimed by ME: Mega Evolution Promo and ME01: Mega Evolution
--   5500018  SM Base Set                                           date_only          2 upstream sets share this release date, none separable by name
--   5500021  Pokemon GO                                            date_only          1 upstream sets share this release date, none separable by name
--   5500022  HGSS Trainer Kit: Gyarados & Raichu                   date_only          1 upstream sets share this release date, none separable by name
--   5500023  First Partner Pack                                    none               no upstream set with this name or release date
--   5500025  SWSH01: Sword & Shield Base Set                       date_unique_token  only upstream set on 2020-02-07 sharing a name token (2 shared)
--   5500026  Professor Program Promos                              none               no upstream set with this name or release date
--   5500029  World Championship Decks                              none               no upstream set with this name or release date
--   5500031  Ash vs Team Rocket Deck Kit (JP Exclusive)            none               no upstream set with this name or release date
--   5500032  SV01: Scarlet & Violet Base Set                       date_only          2 upstream sets share this release date, none separable by name
--   5500033  McDonald's Promos 2023                                none               no upstream set with this name or release date
--   5500037  HeartGold SoulSilver                                  date_unique_token  only upstream set on 2010-02-10 sharing a name token (2 shared)
--   5500053  Trading Card Game Classic                             none               no upstream set with this name or release date
--   5500055  Nintendo Promos                                       none               no upstream set with this name or release date
--   5500060  Alternate Art Promos                                  none               no upstream set with this name or release date
--   5500065  HGSS Promos                                           none               no upstream set with this name or release date
--   5500069  Jumbo Cards                                           none               no upstream set with this name or release date
--   5500070  SV: Scarlet & Violet Promo Cards                      date_only          2 upstream sets share this release date, none separable by name
--   5500072  XY Trainer Kit: Sylveon & Noivern                     none               no upstream set with this name or release date
--   5500073  EX Battle Stadium                                     none               no upstream set with this name or release date
--   5500074  SM Trainer Kit: Alolan Sandslash & Alolan Ninetales   none               no upstream set with this name or release date
--   5500075  Pikachu World Collection Promos                       none               no upstream set with this name or release date
--   5500076  SM Promos                                             none               no upstream set with this name or release date
--   5500078  Triumphant                                            date_unique_token  only upstream set on 2010-11-03 sharing a name token (1 shared)
--   5500081  Trick or Trade BOOster Bundle                         none               no upstream set with this name or release date
--   5500084  Trick or Trade BOOster Bundle 2023                    none               no upstream set with this name or release date
--   5500087  League & Championship Cards                           none               no upstream set with this name or release date
--   5500091  Black and White Promos                                date_unique_token  only upstream set on 2011-04-25 sharing a name token (2 shared). DEMOTED: Black and White matched the same upstream set on name, this row only coincided. upstream bw1 is also claimed by Black and White
--   5500092  e-Reader Sample Cards                                 none               no upstream set with this name or release date
--   5500097  McDonald's Promos 2011                                date_unique_token  only upstream set on 2011-06-17 sharing a name token (2 shared)
--   5500098  Legendary Treasures: Radiant Collection               date_unique_token  only upstream set on 2013-11-06 sharing a name token (2 shared). DEMOTED: Legendary Treasures matched the same upstream set on name, this row only coincided. upstream bw11 is also claimed by Legendary Treasures
--   5500101  Deck Exclusives                                       none               no upstream set with this name or release date
--   5500103  Blister Exclusives                                    none               no upstream set with this name or release date
--   5500109  Battle Academy 2024                                   none               no upstream set with this name or release date
--   5500110  Kids WB Promos                                        none               no upstream set with this name or release date
--   5500111  ME: Mega Evolution Promo                              date_unique_token  only upstream set on 2025-09-26 sharing a name token (2 shared). DEMOTED: ME01: Mega Evolution matched the same upstream set on name, this row only coincided. upstream me1 is also claimed by MEE: Mega Evolution Energies and ME01: Mega Evolution
--   5500116  Diamond and Pearl Promos                              date_unique_token  only upstream set on 2007-05-01 sharing a name token (2 shared). DEMOTED: Diamond and Pearl matched the same upstream set on name, this row only coincided. upstream dp1 is also claimed by Diamond and Pearl
--   5500117  McDonald's 25th Anniversary Promos                    date_unique_token  only upstream set on 2021-02-09 sharing a name token (1 shared)
--   5500120  XY Base Set                                           date_only          1 upstream sets share this release date, none separable by name
--   5500121  XY Trainer Kit: Latias & Latios                       none               no upstream set with this name or release date
--   5500123  Miscellaneous Cards & Products                        none               no upstream set with this name or release date
--   5500124  Trick or Trade BOOster Bundle 2024                    none               no upstream set with this name or release date
--   5500131  Battle Academy                                        none               no upstream set with this name or release date
--   5500132  DP Trainer Kit: Manaphy & Lucario                     none               no upstream set with this name or release date
--   5500133  Generations: Radiant Collection                       date_unique_token  only upstream set on 2016-02-22 sharing a name token (1 shared). DEMOTED: Generations matched the same upstream set on name, this row only coincided. upstream g1 is also claimed by Generations
--   5500134  SM Trainer Kit: Lycanroc & Alolan Raichu              none               no upstream set with this name or release date
--   5500136  McDonald's Promos 2024                                none               no upstream set with this name or release date
--   5500137  Undaunted                                             date_unique_token  only upstream set on 2010-08-18 sharing a name token (1 shared)
--   5500142  Rumble                                                none               no upstream set with this name or release date
--   5500145  McDonald's Promos 2017                                date_unique_token  only upstream set on 2017-11-07 sharing a name token (2 shared)
--   5500148  EX Trainer Kit 1: Latias & Latios                     none               no upstream set with this name or release date
--   5500149  SWSH: Sword & Shield Promo Cards                      date_only          1 upstream sets share this release date, none separable by name
--   5500151  Burger King Promos                                    none               no upstream set with this name or release date
--   5500154  Crown Zenith: Galarian Gallery                        exact              names identical, released 0d apart. DEMOTED: 3 C3 sets claim this upstream set on equally strong evidence, so none can be trusted. upstream swsh12pt5gg is also claimed by SWSH: Crown Zenith: Galarian Gallery and SWSH: Crown Zenith: Galarian Gallery
--   5500158  XY Trainer Kit: Pikachu Libre & Suicune               none               no upstream set with this name or release date
--   5500159  BW Trainer Kit: Excadrill & Zoroark                   none               no upstream set with this name or release date
--   5500162  WoTC Promo                                            date_only          1 upstream sets share this release date, none separable by name
--   5500164  McDonald's Promos 2012                                date_unique_token  only upstream set on 2012-06-15 sharing a name token (2 shared)
--   5500165  My First Battle                                       none               no upstream set with this name or release date
--   5500166  Expedition                                            date_unique_token  only upstream set on 2002-09-15 sharing a name token (1 shared)
--   5500167  Unleashed                                             date_unique_token  only upstream set on 2010-05-12 sharing a name token (1 shared)
--   5500168  EX Trainer Kit 2: Plusle & Minun                      none               no upstream set with this name or release date
--   5500171  SV: Scarlet & Violet 151                              date_unique_token  only upstream set on 2023-09-22 sharing a name token (1 shared)
--   5500172  McDonald's Promos 2015                                none               no upstream set with this name or release date
--   5500177  XY Promos                                             none               no upstream set with this name or release date
--   5500181  Player Placement Trainer Promos                       none               no upstream set with this name or release date
--   5500183  First Partner Collection 2026                         none               no upstream set with this name or release date
--   5500186  Best of Promos                                        date_unique_token  only upstream set on 2002-12-01 sharing a name token (1 shared)
--   5500193  McDonald's Promos 2018                                date_only          1 upstream sets share this release date, none separable by name
--   5500194  Prize Pack Series Cards                               none               no upstream set with this name or release date
--   5500198  McDonald's Promos 2022                                date_unique_token  only upstream set on 2022-08-03 sharing a name token (2 shared)
--   5500200  McDonald's Promos 2014                                date_unique_token  only upstream set on 2014-05-23 sharing a name token (2 shared)
--   5500203  McDonald's Promos 2019                                none               no upstream set with this name or release date
--   5500210  Countdown Calendar Promos                             none               no upstream set with this name or release date
--   5500214  SWSH: Crown Zenith                                    exact              names identical, released 0d apart. DEMOTED: 3 C3 sets claim this upstream set on equally strong evidence, so none can be trusted. upstream swsh12pt5 is also claimed by Crown Zenith and SWSH: Crown Zenith
--   5500215  SWSH: Crown Zenith: Galarian Gallery                  exact              names identical, released 0d apart. DEMOTED: 3 C3 sets claim this upstream set on equally strong evidence, so none can be trusted. upstream swsh12pt5gg is also claimed by Crown Zenith: Galarian Gallery and SWSH: Crown Zenith: Galarian Gallery
--   5500217  SWSH: Crown Zenith                                    exact              names identical, released 0d apart. DEMOTED: 3 C3 sets claim this upstream set on equally strong evidence, so none can be trusted. upstream swsh12pt5 is also claimed by Crown Zenith and SWSH: Crown Zenith
--   5500218  SWSH: Crown Zenith: Galarian Gallery                  exact              names identical, released 0d apart. DEMOTED: 3 C3 sets claim this upstream set on equally strong evidence, so none can be trusted. upstream swsh12pt5gg is also claimed by Crown Zenith: Galarian Gallery and SWSH: Crown Zenith: Galarian Gallery
--   5500219  ME: 30th Celebration                                  none               no upstream set with this name or release date
--   5500220  EX Holon Phantoms                                     none               no upstream set with this name or release date
--   5500221  EX Dragon Frontiers                                   none               no upstream set with this name or release date
--   5500222  EX Emerald                                            none               no upstream set with this name or release date
--   5500223  EX Legend Maker                                       none               no upstream set with this name or release date
--   5500224  EX Dragon                                             date_unique_token  only upstream set on 2003-11-24 sharing a name token (1 shared). DEMOTED: Dragon matched the same upstream set on name, this row only coincided. upstream ex3 is also claimed by Dragon
--   5500225  EX Team Magma vs Team Aqua                            none               no upstream set with this name or release date
--   5500226  EX Team Rocket Returns                                date_unique_token  only upstream set on 2004-11-01 sharing a name token (3 shared). DEMOTED: Team Rocket Returns matched the same upstream set on name, this row only coincided. upstream ex7 is also claimed by Team Rocket Returns
--   5500227  EX Crystal Guardians                                  none               no upstream set with this name or release date
--   5500228  EX Ruby and Sapphire                                  none               no upstream set with this name or release date
--   5500229  EX Power Keepers                                      none               no upstream set with this name or release date
--   5500230  EX FireRed & LeafGreen                                none               no upstream set with this name or release date
--   5500231  EX Hidden Legends                                     none               no upstream set with this name or release date
--   5500232  EX Unseen Forces                                      none               no upstream set with this name or release date
--   5500233  EX Deoxys                                             none               no upstream set with this name or release date
--   5500234  EX Delta Species                                      date_unique_token  only upstream set on 2005-10-31 sharing a name token (2 shared). DEMOTED: Delta Species matched the same upstream set on name, this row only coincided. upstream ex11 is also claimed by Delta Species
--   5500235  EX Sandstorm                                          date_unique_token  only upstream set on 2003-09-18 sharing a name token (1 shared). DEMOTED: Sandstorm matched the same upstream set on name, this row only coincided. upstream ex2 is also claimed by Sandstorm
--   5500236  ME06: Delta Reign                                     none               no upstream set with this name or release date
--   5500237  Southeast Asia Exclusives                             none               no upstream set with this name or release date
--   5500238  ME: 30th Celebration Classic Collection               none               no upstream set with this name or release date
