# MoshPin — setup

Everything runs from static files. No build step, no npm, no server.

```
index.html            landing: create or join a crew
css/app.css           shared styles
js/core.js            firebase, auth, time, cache, utils
js/landing.js         landing page logic
js/qr.js              invite QR codes
js/vendor-qrcode.mjs  QR encoder (Kazuhiko Arase, MIT)
rules.json            Firebase security rules
```

## 1. Firebase console (one time, ~5 minutes)

**Enable anonymous sign-in**
Build → Authentication → Sign-in method → Anonymous → Enable.
Free up to 50,000 monthly users, and Google clears out stale anonymous
accounts by itself.

**Publish the security rules**
Build → Realtime Database → Rules → paste the contents of `rules.json` → Publish.

These rules are what make the passcode mean something. Without them anyone
who knows a crew's id could read or overwrite it.

**Upgrade to Blaze before you invite strangers**
The free Spark plan caps the database at **100 simultaneous connections**, with
no way to raise it. Two or three active crews will hit that and the app simply
stops responding for whoever connects next. Blaze raises the cap to 200,000.

Blaze is pay-as-you-go and you will almost certainly stay inside the free
allowance (1 GB stored, 10 GB downloaded a month) — but it needs a card on file.
**Set a budget alert immediately**: Google Cloud console → Billing → Budgets &
alerts. That removes the only real financial downside.

## 2. Hosting

Any static host works. GitHub Pages is free and needs no account beyond GitHub:
push these files, then Settings → Pages → deploy from `main`, folder `/`.

When you have a real domain, that's the only change: invite links are built
from wherever the page is served, so nothing in the code needs editing.

## 3. Try it

1. Open the site, create a crew, note the passcode.
2. Open the invite link in a private window — you should land on the join
   screen with the crew's name already showing.
3. Enter the wrong passcode. It must refuse. If it lets you in, the rules
   aren't published.

## How joining is protected

The passcode is never stored or transmitted in readable form. On create we save
`sha256(root|crewId|passcode)` under a node nobody can read. A joiner sends the
same hash with their membership record, and the rules only accept the write if
that hash already exists.

So a wrong passcode fails at the database, not in the browser — you can't get
past it with developer tools. Brute-forcing a 4-character code means ~1.6
million write attempts against a rate-limited API.

**What this is not:** a crew member can read everything in their own crew. It
protects crews from outsiders, not members from each other. That's the right
trade for a group of friends; don't put anything genuinely private in it.
