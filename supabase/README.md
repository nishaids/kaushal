# Supabase setup

KAUSHAL runs without Supabase. Leave the environment variables empty and the
app uses its local driver, which implements the same data contract in memory.
Follow these steps only when you want the data to persist in Postgres.

Everything below is done in a browser. You do not need the Supabase CLI, Docker,
or psql.

## 1. Create a project

1. Go to <https://supabase.com> and sign in.
2. Click **New project**.
3. Pick an organisation, name the project (`kaushal` is fine), and choose a
   region close to your users.
4. Set a database password. Save it in your password manager. You will not need
   it for this setup, but you cannot see it again later.
5. Click **Create new project** and wait. Provisioning takes a minute or two.

## 2. Run the three SQL files, in order

Open **SQL Editor** in the left sidebar, then for each file below: click
**New query**, paste the entire contents of the file, and click **Run**.

| Order | File | What it does |
| --- | --- | --- |
| 1 | `supabase/schema.sql` | Creates the nine tables, the dimension type and the indexes. |
| 2 | `supabase/policies.sql` | Turns on row level security and writes the access rules. |
| 3 | `supabase/seed.sql` | Fills in the demo academy so there is something to look at. |

The order matters: policies reference tables, and the seed references both.

All three are safe to run again. `schema.sql` and `policies.sql` skip what
already exists, and `seed.sql` deletes the demo academy before re-inserting it,
so re-running it resets the demo rather than duplicating it.

If `policies.sql` fails on the four `storage.objects` policies with a
permissions error, run the rest of the file first and then create those four in
the SQL Editor as the project owner. The SQL Editor normally has the rights
already; a database connection made with a restricted role does not.

`seed.sql` must be run from the SQL Editor, not from the application. It writes
rows for an academy that has no login behind it, so the row level security
policies would refuse it.

## 3. Create the storage bucket

1. Open **Storage** in the left sidebar.
2. Click **New bucket**.
3. Name it exactly `works`. The name is used by the code and by the policies.
4. Turn **Public bucket** on.
5. Click **Save**.

Public means the image bytes can be fetched by URL, which is what lets an
`<img>` tag render a drawing without a session. Who may upload, replace and
delete objects is still controlled by the policies in `policies.sql`, and those
allow an instructor to touch only the objects under their own academy's folder.

If you would rather the images not be readable by URL, make the bucket private
instead. You will then need to serve images through signed URLs, which the
current code does not do.

## 4. Copy the three environment variables

1. Open **Project Settings**, then **API**.
2. Copy the three values into a `.env.local` file in the repository root:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

- **Project URL** goes in `NEXT_PUBLIC_SUPABASE_URL`.
- **anon public** goes in `NEXT_PUBLIC_SUPABASE_ANON_KEY`. This key is meant to
  be in the browser. Row level security is what protects the data, not the key.
- **service_role** goes in `SUPABASE_SERVICE_ROLE_KEY`. This key bypasses row
  level security completely. It is read only on the server, only by the demo
  reset. Never put it in a `NEXT_PUBLIC_` variable and never commit it.

`.env.local` is already in `.gitignore`.

Restart `npm run dev` after editing the file. Next reads environment variables
at startup.

## 5. Check that it worked

Start the app and open the settings screen. It names the driver that is running.
`supabase` means the keys were found and the app is talking to Postgres;
`local` means at least one of the two public variables is missing or empty.

## How the access rules work

Every table is filtered by one function, `public.current_academy_id()`. It looks
up the signed-in user in the `instructors` table and returns their `academy_id`.
Every policy is written in terms of it, so the rule is the same everywhere: you
reach your own academy's rows and nothing else.

For that lookup to work, an instructor's row id must equal their Supabase auth
user id. When you add a real instructor, create the auth user first, then insert
the `instructors` row using that user's id.

A user with no `instructors` row gets `null` from the function, and `null`
matches nothing, so a stranger reaches an empty database rather than an error.

## Resetting the demo

Two ways, and they do the same thing:

- Run `supabase/seed.sql` again in the SQL Editor.
- Call the app's demo reset route, which rebuilds the academy from
  `src/lib/dal/seed-data.ts` using the service role key.

The second one is the fuller data set: the SQL seed carries twelve students
where the application seed carries sixty-two. Both use the same fixed ids, so
either one leaves the demo pointing at the same academy and the same featured
student.
