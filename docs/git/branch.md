# Branch

A branch is a movable name for a commit.

`main` is not a special kind of folder. It is a label that points at whichever commit you last made on that line of history. When you commit, the label moves forward.

Creating a branch (`git branch topic` or `git switch -c topic`) makes a second label pointing at the same commit. Future commits move only the label you have checked out.

Nothing is copied on disk except that small pointer.
