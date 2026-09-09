# Fact Pop free database setup

Status: both migrations applied to the dedicated Free project. Sole teacher assigned;
live transactional access tests passed; teacher sign-in verified in local preview.
The game supports optional online mode alongside existing local profiles.

1. Sign in to Supabase and create a dedicated **Free** project for Fact Pop.
   Keep the database password private; it is not used by the website.
2. Apply `migrations/202609080001_classroom.sql` in the project's SQL Editor.
3. Create and confirm the teacher's Supabase Auth account. Supabase dashboard
   membership and the game's Auth accounts are separate.
4. Assign that confirmed Auth user's ID to `fact_pop_private.teacher` using the
   SQL Editor. This private singleton table permits exactly one teacher. Never
   derive teacher access from a client setting, account nickname, or signup data.
5. Configure the production Site URL as
   `https://nickilis613.github.io/fact-pop-game/` and allow only the required
   production/local authentication redirect URLs. Choose the intended parent
   account onboarding method before enabling signups or sending invitations.
6. The website uses the project URL and **publishable** key. Never put a secret
   key, service-role key, database password, or management token in browser code.
7. Verify with disposable test accounts that: signed-out users see no records;
   an unrelated parent sees no records; a linked parent can read/save only the
   linked student; only the teacher can create profiles or change parent access;
   parents cannot change their role or direct-write protected tables; a revoked
   parent loses access; stale revisions cannot overwrite newer progress.
8. Integrate and test account login/logout, local-to-cloud migration, serialized
   autosave, network recovery, and conflicting-device recovery before publishing.

Student names should be nicknames or classroom labels. Local profiles and CSV
files must not be uploaded automatically on sign-in. The teacher explicitly
selects profiles to move online. Parent accounts must not inherit a teacher's
cached roster when signing in on the same device. Keep CSV backups available.

The Free plan currently pauses inactive projects and does not include automatic
database backups. Preserve regular exports; do not enable paid upgrades as part
of this setup.

## Operating this classroom

Only the configured teacher can link parent access. Create a confirmed parent game
account under Authentication > Users before linking their email in Fact Pop.
Account invitations or password recovery messages must be deliberately sent by the
teacher; the game currently does not send those messages or offer public signup.
Parents use their grown-up account to select their linked child and practice.
No student emails or logins are required.

Local data is never uploaded just by signing in. Use Copy selected profile online
or import its CSV as the teacher. There is no automatic name-based merging.

## Username accounts

Parents can sign in with a username; teacher email sign-in still works. Usernames
are lowercase, 3–32 characters, using letters, numbers, underscores or hyphens.
For administrator-created username accounts, use `<username>@parents.fact-pop.invalid`
as the internal Supabase Auth email and confirm the account in the dashboard.
The reserved `.invalid` address is not a mailbox and receives no recovery emails.
The teacher must manage password resets through Authentication administration.
Link/remove access in the game using the plain username. Never save passwords in
source files or browser configuration.
