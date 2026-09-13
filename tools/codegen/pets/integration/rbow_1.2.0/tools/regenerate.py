#!/usr/bin/env python3
"""Regenerate the current runtime only. Archived laboratories are never built."""
from pathlib import Path
import subprocess, sys
ROOT=Path(__file__).resolve().parents[1]
for script in ['build_assets.py','build_data.py','build_player.py','build_native_spear.py']:
    subprocess.run([sys.executable,str(ROOT/'tools'/script)],cwd=ROOT,check=True)
print('Regenerated the current Rbow release. Run python tools/build.py.')
