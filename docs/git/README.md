# Git as state, not as a command list

Git is four places a file version can live. Commands only move versions between those places.

```
 working directory          staging area               local Git                  GitHub
 (files you edit)           (the next commit)          (object database)          (someone else's copy)
        │                          │                          │                         │
        │   git add                │   git commit             │   git push              │
        │  ─────────────────────►  │  ─────────────────────►  │  ─────────────────────► │
        │                          │                          │                         │
        │                          │                          │  ◄── git pull ──────────│
        │  ◄──── checkout / restore from a commit ────────────│                         │
```

`git add` does **not** upload anything to GitHub. It copies the current contents of a file into the staging area (also called the index) and says "this version is what I want in the next commit."

`git commit` does **not** upload anything either. It freezes the staging area into a snapshot in **your** `.git` object database.

`git push` is the first command in everyday use that talks to a remote computer.

Read the short notes in this folder, then stop. This is not a Git course.
