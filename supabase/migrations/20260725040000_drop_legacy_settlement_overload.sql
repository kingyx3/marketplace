-- deployment-safety: destructive-approved
-- The four-argument overload existed only for the migration-first rollout of
-- 20260722181411_commerce_reliability.sql. Current application code supplies
-- the provider charge ID and uses the five-argument settlement contract.

begin;

drop function if exists public.settle_order_payment(uuid, text, integer, text);

commit;
