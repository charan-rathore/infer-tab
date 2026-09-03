# Working tree

The working tree is the files you see in the project folder.

You edit here. Git does not record a change just because you saved the file. Until you `git add`, the new bytes exist only in the working tree.

`git status` calls these "unstaged" or "untracked." That means: Git can see the file, but the staging area still holds an older version (or no version).
