# !! WARNING !!

Git sadly does not include empty folders (I still wonder why and who came up with that).
The `/images/source/*` contains many important empty folders (eg. /proc), so this may become an issue.

There is sadly nothing I can do to fix this.
The startup batch file of base_os tries to fix this by manually creating the folders, but this will not help with 3rd party packages and such.
So please keep this in mind - when writing patches etc., always make sure your program expects a folder to not exist and create it first.

I apologize for any issues this can cause.