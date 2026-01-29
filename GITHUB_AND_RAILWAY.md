# GitHub and Railway: What Pushes Where

## Does editing code here push to GitHub?

**No.** Changing code in your editor (Cursor, etc.) does **not** push to GitHub. You have to:

1. `git add` the files
2. `git commit -m "message"`
3. `git push origin main` (or your branch)

Until you run those commands, your changes stay local only.

---

## When I push, who gets the update?

**Every Railway project that is deployed from this repo and branch.**

- If **Uncle Sal's** Railway is connected to this repo (e.g. `main`)
- And **Tazza Pizza** (or any other "web") is also connected to the **same** repo and branch

then a single `git push` will trigger a new deploy on **all** of them. They all run the same code from the same branch.

So: **one push = all connected Railways redeploy.** If you want one client to get updates and another not to, you need either:

- **Different branches:** e.g. `main` for Uncle Sal's, `tazza` for Tazza Pizza, and connect each Railway to its own branch, or
- **Different repos:** one repo per client, each with its own Railway.

---

## Quick reference

| Action                    | Pushes to GitHub? | Redeploys Railways?     |
|---------------------------|-------------------|--------------------------|
| Edit and save in Cursor   | No                | No                       |
| git add + commit + push  | Yes               | Yes (all linked projects)|
