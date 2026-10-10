-- Retail naming cleanup: rename 99 Shop-era setting keys to shop_*, and
-- drop the dine-in tables (reservations, waiter requests, table floor/type
-- taxonomy) that have had no writer since the retail conversion — no FK
-- references them.

DELETE FROM system_settings WHERE setting_key = 'shop_name'
  AND EXISTS (SELECT 1 FROM system_settings s2 WHERE s2.setting_key = 'restaurant_name');
UPDATE system_settings SET setting_key = 'shop_name' WHERE setting_key = 'restaurant_name';

DELETE FROM system_settings WHERE setting_key = 'shop_address'
  AND EXISTS (SELECT 1 FROM system_settings s2 WHERE s2.setting_key = 'restaurant_address');
UPDATE system_settings SET setting_key = 'shop_address' WHERE setting_key = 'restaurant_address';

DELETE FROM system_settings WHERE setting_key = 'shop_phone'
  AND EXISTS (SELECT 1 FROM system_settings s2 WHERE s2.setting_key = 'restaurant_phone');
UPDATE system_settings SET setting_key = 'shop_phone' WHERE setting_key = 'restaurant_phone';

DELETE FROM system_settings WHERE setting_key = 'shop_email'
  AND EXISTS (SELECT 1 FROM system_settings s2 WHERE s2.setting_key = 'restaurant_email');
UPDATE system_settings SET setting_key = 'shop_email' WHERE setting_key = 'restaurant_email';

DELETE FROM system_settings WHERE setting_key = 'bill_show_shop_name'
  AND EXISTS (SELECT 1 FROM system_settings s2 WHERE s2.setting_key = 'bill_show_restaurant');
UPDATE system_settings SET setting_key = 'bill_show_shop_name' WHERE setting_key = 'bill_show_restaurant';

DELETE FROM system_settings WHERE setting_key = 'kot_show_shop_name'
  AND EXISTS (SELECT 1 FROM system_settings s2 WHERE s2.setting_key = 'kot_show_restaurant');
UPDATE system_settings SET setting_key = 'kot_show_shop_name' WHERE setting_key = 'kot_show_restaurant';

DELETE FROM system_settings WHERE setting_key = 'qr_show_shop_name'
  AND EXISTS (SELECT 1 FROM system_settings s2 WHERE s2.setting_key = 'qr_show_restaurant');
UPDATE system_settings SET setting_key = 'qr_show_shop_name' WHERE setting_key = 'qr_show_restaurant';

DROP TABLE IF EXISTS waiter_requests;
DROP TABLE IF EXISTS reservations;
DROP TABLE IF EXISTS table_floors;
DROP TABLE IF EXISTS table_types;
