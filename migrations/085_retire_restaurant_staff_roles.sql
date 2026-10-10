-- Retail deployments no longer offer waiter or kitchen login surfaces.
-- Preserve the employee/payroll record, revoke the obsolete login, and move
-- the access role to the supported non-admin role. The employee's real job
-- title remains in position/designation.
UPDATE users
   SET role = 'cashier', is_active = 0
 WHERE role IN ('waiter', 'kitchen');
