-- 0004: Stop strangers on the internet from reading delegate names and phone numbers.
-- Run this AFTER real logins are working (the website now requires sign-in anyway).
-- Before this, anyone could download the whole delegate list without logging in,
-- because the website's public key is visible in the browser.

drop policy if exists "Public dashboard can read administrative records" on public.administrative_records;
revoke select on public.administrative_records from anon;

-- Constituency names (no personal data) stay readable; the login screen does not need them,
-- but they are harmless.
