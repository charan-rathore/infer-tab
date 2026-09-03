# Commit

A commit is a frozen snapshot stored in your local Git object database (inside `.git`).

`git commit` writes:

- the tree of files that were staged
- a pointer to the previous commit (the parent)
- your message

After a commit, HEAD (your current position) points at that snapshot. The remote copy on GitHub is unchanged until you push.

A commit is local history, not a publish action.
