# Pull

`git pull` fetches new commits from the remote and then tries to update your current branch to match.

It is two state changes:

1. Download objects into your local Git database (`fetch`).
2. Move your branch label — and usually your working tree — to include those commits (`merge` or `rebase`).

If you have local commits the remote does not have, Git has to combine two histories. That is a later lesson. The important part: pull updates **your** repo from theirs; it is the reverse direction of push.
