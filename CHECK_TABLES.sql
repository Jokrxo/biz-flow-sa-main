-- CHECK_TABLES.sql
-- Run this FIRST to see what tables exist in your database

SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;
