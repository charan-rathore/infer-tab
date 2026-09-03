# Staging area (the index)

The staging area is a holding snapshot of "what the next commit should contain."

`git add README.md` means: take the **current** bytes of `README.md` from the working tree and make those the staged version.

It does not send the file to GitHub. It does not create a commit. If you edit the file again after `git add`, the working tree and the index now differ — you must `git add` again to update the staged version.

Think of it as selecting takes before you press record, not as publishing.
