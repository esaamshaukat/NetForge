# ENCOR 350-401 study app (split, encrypted version)

A private web app for your question bank. Visitors only ever see a sign-in box.
The questions, explanations, pictures and flashcards are stored as **encrypted files**;
the key lives in Firebase and only your allowed users can read it.

```
encor-app/
├── index.html            tiny shell: sign-in screen + app container
├── manifest.json         lets you install the app on a phone home screen
├── service-worker.js     offline cache + "Update available" bar
├── css/app.css           look and feel
├── js/                   the app, in small parts (auth, sync, study, practice, exam,
│                         flashcards, dashboard, crypto + data loader, ...)
├── icons/                app icons
├── data/                 ENCRYPTED questions, flashcards, pictures (safe to upload)
├── tools/                extract_from_index.py, build.py, stamp_version.py, make_icons.py
├── firestore.rules       the Firestore rules, ready to paste
└── .gitignore            keeps secret.key and source/ out of GitHub
```

**Never upload:** `secret.key` and the `source/` folder (it holds the questions in plain text).
The `.gitignore` already blocks both if you use Git. If you upload with the GitHub web page, just don't drag those two in.

---

## 0. What you need on your computer (once)

1. Python 3.9 or newer.
2. In a terminal inside the `encor-app` folder: `pip install cryptography`

## 1. Check the data (a) - the two tools

The zip you received already contains a finished `data/` folder, built with the key you were given.
You only need the tools when you change the question bank.

**Step 1 - pull the bank out of the old file** (only if you want fresh plain files):

```
python tools/extract_from_index.py path/to/your/old/index.html
```

This creates `source/` with plain JSON (questions, images, flashcards). Nothing is edited or fixed.

**Step 2 - the key.** The key you were given is in the file `secret.key`. Put that file in the
`encor-app` folder (next to `README.md`). If you want a brand-new key instead:

```
python tools/build.py --init-key --force
```

It prints the key. A new key means you must rebuild (step 3) **and** replace the key in Firestore (section 3).

**Step 3 - encrypt:**

```
python tools/build.py
```

It writes the `data/` folder. Files that did not change stay byte-identical, so Git only uploads what changed.

## 2. Upload to GitHub (b)

1. Make a repository (for example `encor`) and turn on **Settings > Pages > Deploy from a branch > main / (root)**.
2. Upload everything in the `encor-app` folder **except** `secret.key` and `source/`.
   The GitHub web page accepts about 100 files per upload, so upload `data/` in a separate batch
   (or use GitHub Desktop / `git`, which has no such limit).
3. Your app is at `https://USERNAME.github.io/REPO/`. All paths in the app are relative, so the sub-folder is fine.
4. **Important:** in the Firebase console go to **Authentication > Settings > Authorized domains** and add
   `USERNAME.github.io`. Without this, sign-in is refused on your site.

## 3. Firebase set-up (c)

In the console for project **encor-study**:

1. **Authentication > Sign-in method:** turn **Email/Password** ON, **Google** OFF.
2. **Authentication > Settings > User actions:** turn off creating accounts (sign-up), if you see that option.
3. **Authentication > Users:** add your 2-3 users with real emails. Copy each person's **User UID**.
4. **Firestore > Rules:** paste the contents of `firestore.rules`, put every UID in the list, press **Publish**.
   Use plain straight quotes (`'`), not curly ones, or Firestore will show an error.
5. **Firestore > Data:** create collection `config`, document ID `bank`, one field:
   - field name `key`, type **string**, value = the text from `secret.key` (one line, ends with `=`).

Only Authentication and Firestore are used. No Storage, no Hosting, nothing paid.

## 4. Updating the app later (d) - the small files

1. Change what you need (`css/app.css`, a file in `js/`, `index.html`, ...).
2. Run `python tools/stamp_version.py`. It gives the app a new version number.
3. Upload the changed files **plus** `service-worker.js` and `js/version.js`.
4. Next time someone opens the app they see **"A new version of the app is ready - Update now"**.
   Nothing reloads by surprise in the middle of a test.

## 5. Updating the question bank later (e)

1. Change the plain files in `source/` (or re-run `extract_from_index.py` on a new old-style file).
2. Run `python tools/build.py`.
3. Upload the `data/` folder (it replaces the old one). No need to touch the app files.
4. The app notices the new `data-manifest.json` on its next start and downloads only the files that changed.

The `flags` and `sourcePage` fields are kept exactly as they are. In the app each question has a small
"Source and review notes" line at the bottom that shows the PDF page and any review notes, so you can do
your pending review later.

---

## First-load size (before and after)

| | Before (one file) | After (split) |
|---|---|---|
| Download to see the first screen | 21.4 MB (14.5 MB compressed) | about 0.4 MB: app files 54 KB compressed, data list + topic list 32 KB, Firebase library roughly 0.3 MB (estimate) |
| Opening Study / Practice / Exam | already included | + 0.24 MB (all question text, in 22 topic files) |
| Flashcards | already included | + about 10-25 KB per topic |
| Pictures | already included | about 1 MB per pack, only when a question needs one, then cached |
| Next visit | whole file again unless the browser kept it | nothing, unless the data changed |

Changing the look of the app now means replacing a few small files, not a 21 MB file.

## How your progress is saved

* Every answer is saved **first on the device** (works offline) and then synced to your account in the background.
* Syncing keeps the **newest result for each question**, so progress from phone and laptop merges and nothing is lost.
* It writes in small batches (a few seconds apart, and when you leave the tab), far below the free plan limits.
* **Export / Import progress** (Progress tab) is a backup. Import *adds* to what you have; it never replaces.
* **Old app progress:** the first time you sign in, the app looks for progress the old single-file app saved in this browser
  (it keeps it in the browser database called `encor-bank`, not in localStorage) and moves it into your account.
  This works if the old app was opened from the **same web address** (for example the same `USERNAME.github.io`).
  If it was somewhere else, open the old app, press **Export my progress**, then use **Import progress** here. Old export files are understood.
* Paused practice tests and exams are saved to your account too, so you can resume on another device.

## Things that changed on purpose

* Importing extra question files inside the app is gone; the bank is now built with `build.py`.
* "Flag" in a test now also remembers the question as **My flagged** (a filter in Study, and "My flagged questions only" in Practice/Exam).
  This is separate from the review `flags` that come with the data.
* Phones: the app pauses a running test when you switch to another app, and lets you resume.
* Needs a reasonably recent browser (Chrome/Edge 80+, Firefox 113+, Safari 16.4+).

## Security, honestly

The data files are public but encrypted (AES-256-GCM). Without the key they are unreadable.
Only users on your allowed list can read the key from Firestore. After signing in, the key is kept in the browser
as a non-readable crypto key so the app also opens offline; signing out removes it.
This stops casual access. Someone who is on your allowed list could still copy the decrypted content,
which is fine for a beta. To remove a person: delete them in Authentication **and** take their UID out of the rules.
To lock everyone out of old data: make a new key (`--init-key --force`), rebuild, and replace the Firestore key.

## Test checklist

1. **Incognito window:** open the link. You see only the sign-in box. (Browser dev tools > Network shows no `.enc` file loaded.)
2. **Wrong password:** typing a wrong password shows "That email or password is not right."
3. **Correct login:** the home screen appears; Study shows real questions.
4. **Not on the list:** a user that exists in Authentication but is not in the rules sees "not on the allowed list".
5. **Sync:** answer 3 questions on the laptop, wait for "Synced", open the phone: the same questions show as attempted. Then do it the other way round.
6. **Forgot password:** type your email, press "Forgot password?", the email arrives (check spam).
7. **Offline:** after one normal visit, switch on airplane mode and reopen the app. It opens and questions you already opened still work. The top badge says "Offline" and changes to "Synced" when you are back online.
8. **Update bar:** change a small file, run `stamp_version.py`, upload. Reopen the app (or wait): "A new version of the app is ready" appears. Tap Update now.
9. **Data update:** rebuild with `build.py`, upload `data/`, reopen: new questions appear.
10. **Install:** on the phone, "Add to Home Screen" (iPhone: Share menu) and open from the icon.
