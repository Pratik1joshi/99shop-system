-- Phase 3.5: Retail needs perpetual-inventory accounting (Dr Inventory Asset
-- at receipt, Dr COGS / Cr Inventory Asset at sale) — a different model from
-- the restaurant ledger's periodic Dr 5010 Purchases expense, which stays
-- exactly as it is (see the comment on 5010 in lib/accounting.js).
--
-- A NEW account (1210), not the existing 1200 "Inventory", because 1200 is
-- already credited by restaurant wastage write-downs with nothing ever
-- debiting it (restaurant purchases post to 5010, never 1200) — sharing it
-- would make retail inventory valuation permanently unreconcilable against
-- the GL balance. 1210 is retail-only, so Retail Inventory Valuation =
-- account 1210 balance holds cleanly.

INSERT INTO accounts (code, name, type, subtype, is_system)
VALUES ('1210', 'Retail Inventory', 'asset', 'retail_inventory', 1)
ON CONFLICT (code) DO NOTHING;
UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code = '1000')
WHERE code = '1210' AND parent_id IS NULL;

INSERT INTO accounts (code, name, type, subtype, is_system)
VALUES ('5080', 'Cost of Goods Sold', 'expense', 'cogs', 1)
ON CONFLICT (code) DO NOTHING;
UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code = '5000')
WHERE code = '5080' AND parent_id IS NULL;
