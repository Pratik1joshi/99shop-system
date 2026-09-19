SELECT
    granted.rolname AS role_name,
    member.rolname AS member_name,
    am.admin_option
FROM pg_auth_members am
JOIN pg_roles granted ON granted.oid = am.roleid
JOIN pg_roles member ON member.oid = am.member
WHERE granted.rolname = 'thehairc_dimsum';