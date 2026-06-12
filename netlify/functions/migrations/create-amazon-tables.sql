-- Amazon products catalogue (sealed products only)
CREATE TABLE IF NOT EXISTS amazon_products (
  asin TEXT PRIMARY KEY,
  game TEXT NOT NULL,
  product_name TEXT NOT NULL,
  item_type TEXT,
  image_url TEXT,
  current_price_aud NUMERIC,
  affiliate_url TEXT,
  priority INTEGER DEFAULT 2,
  is_active BOOLEAN DEFAULT true,
  last_synced TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_amazon_products_game ON amazon_products(game);
CREATE INDEX IF NOT EXISTS idx_amazon_products_priority ON amazon_products(priority);
CREATE INDEX IF NOT EXISTS idx_amazon_products_active ON amazon_products(is_active);

-- Price history for sealed products
CREATE TABLE IF NOT EXISTS amazon_price_history (
  id BIGSERIAL PRIMARY KEY,
  asin TEXT NOT NULL REFERENCES amazon_products(asin) ON DELETE CASCADE,
  price_aud NUMERIC NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_amazon_price_history_asin ON amazon_price_history(asin);
CREATE INDEX IF NOT EXISTS idx_amazon_price_history_recorded ON amazon_price_history(recorded_at);

-- RLS
ALTER TABLE amazon_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE amazon_price_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_amazon_products" ON amazon_products FOR SELECT TO anon USING (true);
CREATE POLICY "service_all_amazon_products" ON amazon_products FOR ALL TO service_role USING (true);
CREATE POLICY "anon_select_amazon_price_history" ON amazon_price_history FOR SELECT TO anon USING (true);
CREATE POLICY "service_all_amazon_price_history" ON amazon_price_history FOR ALL TO service_role USING (true);
