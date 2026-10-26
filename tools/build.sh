#!/bin/sh
# Rebuild app/index.html from app/page.html. Run from the repository root: sh tools/build.sh
{ echo '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">'; sed -n '1,/<\/style>/p' app/page.html; echo '</head><body>'; sed -n '/<\/style>/,$p' app/page.html | tail -n +2; echo '</body></html>'; } > app/index.html
