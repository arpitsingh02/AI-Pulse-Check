# Setting up your machine

A one-time setup, then a workflow you can reuse for any project like this.
Budget about an hour, most of it waiting on downloads.

---

## What each piece actually does

Worth understanding before installing, so the errors make sense later.

| Tool | What it is | Why you need it |
|---|---|---|
| **Node.js** | Runs JavaScript outside a browser | Vite, the build step, and most tooling are JS programs |
| **npm** | Package installer, ships with Node | Downloads React, Vite, Capacitor into your project |
| **Terminal** | Text interface to your computer | Where you run every command below |
| **VS Code** | Text editor built for code | Where you read and edit files |
| **Git** | Tracks versions of your files | Undo button that works across your whole project |
| **Android Studio** | Android's official toolchain | Only needed to produce the APK |

There's no "compiler" to install separately. Vite handles the build, and it
arrives via npm when you run `npm install`.

---

## Step 1 — Node.js

Check whether you already have it. Open a terminal and run:

```bash
node --version
```

If it prints `v22.x.x` or higher, skip to Step 2. If it says "command not
found" or prints something lower, install it.

### macOS

The clean way is a version manager, so different projects can use different Node
versions without fighting:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
```

Close the terminal, open a new one, then:

```bash
nvm install --lts
nvm use --lts
```

Simpler alternative: download the LTS installer from [nodejs.org](https://nodejs.org)
and double-click it. Fine for one project, more annoying later.

### Windows

Download the LTS installer from [nodejs.org](https://nodejs.org) and run it.
Accept the defaults. Then **close and reopen** your terminal — PowerShell won't
see the new command until you do.

### Linux

Use the nvm command from the macOS section. Avoid `apt install nodejs`; distro
packages are often years behind.

### Confirm

```bash
node --version
npm --version
```

Two version numbers means you're set.

---

## Step 2 — VS Code

Download from [code.visualstudio.com](https://code.visualstudio.com) and install.

Add three extensions (click the squares icon in the left sidebar, search, install):

- **ESLint** — flags mistakes as you type
- **Prettier** — auto-formats on save, ends all formatting debates
- **ES7+ React snippets** — shortcuts for common React patterns

Then turn on format-on-save: `Ctrl/Cmd + Shift + P` → type "Format On Save" →
enable it. Small thing, saves constant friction.

VS Code has a built-in terminal at ``Ctrl + ` `` (backtick). Use it — being in
the right folder is automatic.

---

## Step 3 — Terminal basics

Five commands cover almost everything:

```bash
pwd                  # where am I?
ls                   # what's here?          (Windows CMD: dir)
cd foldername        # go into a folder
cd ..                # go up one level
clear                # tidy the screen
```

Two shortcuts that matter more than they sound:

- **Tab** autocompletes file and folder names. Type `cd pul` then Tab.
- **Up arrow** recalls your last command.

Drag-and-drop trick: type `cd ` (with the space), then drag a folder from your
file manager onto the terminal window. It pastes the full path.

---

## Step 4 — Run Pulse

Unzip `pulse.zip` somewhere you'll find again — `Documents/projects/pulse` is
fine. Then:

```bash
cd path/to/pulse
npm install
```

`npm install` reads `package.json`, downloads every dependency into a
`node_modules` folder, and takes 30–90 seconds the first time. That folder will
be large and contain thousands of files. This is normal and you never open it.

Then:

```bash
npm run dev
```

You'll see something like:

```
  VITE v5.4.8  ready in 412 ms
  ➜  Local:   http://localhost:5173/
```

Open that URL in your browser. Pulse should load and start fetching feeds.

**Leave this terminal running.** It's the dev server. Closing it stops the site.
Open a second terminal tab if you need to run other commands. `Ctrl + C` stops it.

---

## Step 5 — The loop

This is the part that makes it feel worth it.

1. Open the `pulse` folder in VS Code (File → Open Folder)
2. Open `src/lib/topics.js`
3. Add a keyword to one of the lists — say `'tokenization'` under fintech
4. Save

Look at the browser. It updated without you refreshing. That's hot module
reload, and it's why the dev server stays running.

Good first edits to build confidence:

- `src/lib/topics.js` — keyword lists, `HALF_LIFE_HOURS`
- `src/lib/storage.js` — the feed list
- `src/styles.css` — the `:root` block at the top holds every color

---

## Step 6 — Git

Skip this and you will eventually break something with no way back.

```bash
git --version
```

If missing: macOS installs it when you run `git`; Windows users get it from
[git-scm.com](https://git-scm.com/downloads/win).

One-time identity setup:

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

In your project folder:

```bash
git init
git add .
git commit -m "Starting point"
```

Now, any time something works, save that state:

```bash
git add .
git commit -m "Added fintech keywords"
```

And when you've broken things beyond repair:

```bash
git restore .
```

That returns every file to your last commit. Commit often — before trying
anything ambitious, not after.

---

## Step 7 — Claude Code

For "vibe coding" specifically, this is the tool. It runs in your terminal,
reads your whole project, and edits files directly — rather than you copying
snippets back and forth from a chat window.

The native installer is the recommended method and needs no Node.js at all.

**macOS, Linux, WSL:**
```bash
curl -fsSL https://claude.ai/install.sh | bash
```

**Windows PowerShell:**
```powershell
irm https://claude.ai/install.ps1 | iex
```

Verify with `claude --version`. Then `cd` into your project and run `claude`.

Two things to know: Claude Code requires a Pro, Max, Team, Enterprise, or Console account — the free Claude.ai plan doesn't include access. And on native Windows, installing Git for Windows is recommended so Claude Code can use the Bash tool; without it, it falls back to PowerShell.

There's also a desktop app if you'd rather not work in the terminal, and a VS
Code extension. Full docs: https://code.claude.com/docs/en/setup

### Using it well

- **Commit before you prompt.** Then `git restore .` undoes anything you dislike.
- **Small, specific asks.** "Add a topic for climate tech to topics.js" beats
  "make the app better."
- **Always look at the browser after.** Working code and correct code differ.
- **Ask it to explain.** "Why did you use useMemo here?" is a fast way to learn.
- **Write a `CLAUDE.md`** in your project root describing conventions. It gets
  read automatically at the start of each session.

---

## Step 8 — Android Studio (only for the APK)

Skip until the web version is how you want it. This is the heaviest install
here — several GB.

1. Download from [developer.android.com/studio](https://developer.android.com/studio)
2. Run it and accept the setup wizard's defaults. It installs the SDK and a JDK.
3. Open it once and let it finish downloading components.

Then from your project folder:

```bash
npx cap add android    # one time only
npm run apk
```

Your file lands at `android/app/build/outputs/apk/debug/app-debug.apk`.

Get it onto your phone by emailing it to yourself, using Google Drive, or a USB
cable. Android will warn about installing from unknown sources — expected for an
app you built rather than downloaded.

Re-run `npm run apk` after any code change; the build copies fresh files into
the Android project.

---

## When something breaks

| Message | Cause | Fix |
|---|---|---|
| `command not found: node` | Node not installed, or terminal not restarted | Reopen the terminal; reinstall if still missing |
| `ENOENT: no such file or directory, open 'package.json'` | Wrong folder | `pwd` and `ls` to check, then `cd` |
| `Cannot find module` | Dependencies not installed | `npm install` |
| `EADDRINUSE: port 5173` | Dev server already running elsewhere | Close the other terminal, or `npm run dev -- --port 5174` |
| `EACCES` / permission denied on npm | npm installing to a system folder | Use nvm. **Never** `sudo npm install` |
| Blank white page | JavaScript error | Browser DevTools (`F12`) → Console tab |
| A feed shows an error in Pulse | Feed URL wrong or site blocking | Open the URL in a browser; if it's not XML, it's not a feed |

**The single most useful habit:** when something fails, read the *first* error
line, not the last. Errors cascade, and the first one is the real cause.

---

## Starting your next project

The same skeleton works for most things:

```bash
npm create vite@latest my-project
cd my-project
npm install
git init && git add . && git commit -m "Init"
npm run dev
```

Pick "React" and "JavaScript" at the prompts. That's a working project in about
a minute — then open Claude Code inside it and describe what you want.
