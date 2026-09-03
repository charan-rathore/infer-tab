# Remote

A remote is an address of another Git object database — usually GitHub.

`origin` is just the conventional name for "the copy on the server." Adding a remote records a URL. It does not upload your commits.

```
local object database  --(push/pull)-->  remote object database
```

Until `origin` exists, every commit you make is only on this machine.
