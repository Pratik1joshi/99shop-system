-- Replace the previous deployment's branding, still stored in databases that
-- ran the old identity migration, with 99 Shop's own identity. Only the old
-- default values are matched (they have to be named to be found); anything an
-- administrator typed in themselves is left alone.

UPDATE system_settings
SET setting_value = CASE setting_key
  WHEN 'shop_name' THEN '99 Shop by Shahana'
  WHEN 'shop_address' THEN 'Surkhet, Nepal'
  WHEN 'shop_phone' THEN '+977 976-7896814'
  WHEN 'shop_email' THEN ''
  WHEN 'receipt_footer' THEN 'Thank you for shopping at 99 Shop!'
  ELSE setting_value
END
WHERE (setting_key = 'shop_name' AND setting_value IN ('Kathmandu Momo', 'Dim Sum Puri Fastfood Restaurant'))
  OR (setting_key = 'shop_address' AND setting_value IN (
    'Birendranagar, Surkhet',
    'Birendranagar, Surkhet, Karnali Province, Nepal',
    'Birendranagar-6, New Road, Surkhet 21700, Nepal'
  ))
  OR (setting_key = 'shop_phone' AND setting_value IN ('+977 984-9216081', '+977 980-8174841'))
  OR (setting_key = 'shop_email' AND setting_value = 'dimsumpurifastfood@gmail.com')
  OR (setting_key = 'receipt_footer' AND setting_value IN (
    'Thank you for visiting Kathmandu Momo!',
    'Thank you for visiting Dim Sum Puri!'
  ));

-- CMS values are JSON stored as text; swap only the old name inside them.
UPDATE system_settings
SET setting_value = replace(
  replace(setting_value, 'Dim Sum Puri Fastfood Restaurant', '99 Shop by Shahana'),
  'Dim Sum Puri',
  '99 Shop'
)
WHERE setting_key LIKE 'cms\_%' ESCAPE '\'
  AND setting_value LIKE '%Dim Sum Puri%';
