-- Rebrand only known Kathmandu Momo defaults while preserving any unrelated
-- restaurant values already managed in production.

UPDATE system_settings
SET setting_value = CASE setting_key
  WHEN 'restaurant_name' THEN 'Dim Sum Puri Fastfood Restaurant'
  WHEN 'restaurant_address' THEN 'Birendranagar-6, New Road, Surkhet 21700, Nepal'
  WHEN 'restaurant_phone' THEN '+977 980-8174841'
  WHEN 'restaurant_email' THEN 'dimsumpurifastfood@gmail.com'
  WHEN 'receipt_footer' THEN 'Thank you for visiting Dim Sum Puri!'
  WHEN 'website' THEN 'https://pos.example.com'
  ELSE setting_value
END
WHERE
  (setting_key = 'restaurant_name' AND setting_value = 'Kathmandu Momo')
  OR (setting_key = 'restaurant_address' AND setting_value IN (
    'Birendranagar, Surkhet',
    'Birendranagar, Surkhet, Karnali Province, Nepal'
  ))
  OR (setting_key = 'restaurant_phone' AND setting_value = '+977 984-9216081')
  OR (setting_key = 'restaurant_email' AND COALESCE(setting_value, '') = '')
  OR (setting_key = 'receipt_footer' AND setting_value = 'Thank you for visiting Kathmandu Momo!')
  OR (setting_key = 'website' AND setting_value = 'https://kathmandumomo.com.np');

INSERT INTO system_settings (setting_key, setting_value) VALUES
  ('restaurant_name', 'Dim Sum Puri Fastfood Restaurant'),
  ('restaurant_address', 'Birendranagar-6, New Road, Surkhet 21700, Nepal'),
  ('restaurant_phone', '+977 980-8174841'),
  ('restaurant_email', 'dimsumpurifastfood@gmail.com'),
  ('receipt_footer', 'Thank you for visiting Dim Sum Puri!')
ON CONFLICT (setting_key) DO NOTHING;

-- CMS values are JSON stored as text. Replace only the former restaurant name
-- and domain; all other administrator-authored content remains untouched.
UPDATE system_settings
SET setting_value = replace(
  replace(setting_value, 'Kathmandu Momo', 'Dim Sum Puri'),
  'kathmandumomo.com.np',
  'pos.example.com'
)
WHERE setting_key LIKE 'cms\_%' ESCAPE '\'
  AND (
    setting_value LIKE '%Kathmandu Momo%'
    OR setting_value LIKE '%kathmandumomo.com.np%'
  );
