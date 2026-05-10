#!/usr/bin/env python3
"""
Build a transactionally-wrapped replay of hillco-data.sql against hillco2's
schema. Three quirks the script handles:

1. Strips the `SELECT pg_catalog.set_config('search_path', '', false)` line
   that pg_dump inserts for safety. Our audit_trigger calls unqualified
   current_app_user_id(); with search_path=''  it fails. We override with
   `SET LOCAL search_path = public, pg_catalog;` at the top.

2. Replaces each `INSERT INTO public.students` line *in place* with the
   transformed version from students-transformed.sql. Doing this in place
   (rather than strip+append) preserves pg_dump's dependency ordering, so
   engagement_students still sees students before its own INSERTs run.

3. Wraps the whole thing in BEGIN/COMMIT so a partial replay can't leave
   the DB half-populated.

Usage:
    python3 build_replay.py > /tmp/hillco2-replay.sql
    cat /tmp/hillco2-replay.sql | kubectl exec -n hillco2 -i hillco2-pg-1 \\
        -c postgres -- psql -U postgres -d hillco2 -v ON_ERROR_STOP=1
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).parent
DUMP = (HERE / "hillco-data.sql").read_text()
TRANSFORMED = (HERE / "students-transformed.sql").read_text()

by_id = {}
for line in TRANSFORMED.splitlines():
    if line.startswith("INSERT INTO public.students"):
        m = re.search(r"VALUES \('([0-9a-f-]+)'", line)
        if m:
            by_id[m.group(1)] = line

print("BEGIN;")
print("-- audit_trigger calls unqualified current_app_user_id(); ensure search_path can find public")
print("SET LOCAL search_path = public, pg_catalog;")

swapped = 0
for line in DUMP.splitlines():
    if "set_config('search_path'" in line:
        continue
    if line.startswith("INSERT INTO public.students "):
        m = re.search(r"VALUES \('([0-9a-f-]+)'", line)
        if m and m.group(1) in by_id:
            print(by_id[m.group(1)])
            swapped += 1
            continue
    print(line)

print("COMMIT;")
sys.stderr.write(f"swapped {swapped} student INSERTs in place\n")
