-- Update RLS policies to allow users to see all companies they are assigned to
-- NOT just the one currently active in their profile

-- 1. Drop restrictive policies if they exist
DROP POLICY IF EXISTS "Users can view their own company" ON companies;
DROP POLICY IF EXISTS "Enable read access for users to their own company" ON companies;
DROP POLICY IF EXISTS "Users can view companies they belong to" ON companies;

-- 2. Create inclusive policy based on user_roles
CREATE POLICY "Users can view companies they belong to"
ON companies FOR SELECT
USING (
  id IN (
    SELECT company_id 
    FROM user_roles 
    WHERE user_id = auth.uid()
  )
);

-- 3. Ensure user_roles is viewable by the user (self-reflection)
DROP POLICY IF EXISTS "Users can view their own roles" ON user_roles;
CREATE POLICY "Users can view their own roles"
ON user_roles FOR SELECT
USING (
  user_id = auth.uid()
);
