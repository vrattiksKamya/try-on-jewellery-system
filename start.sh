#!/bin/sh
# Landmark detection needs real HTTP — opening index.html directly (file://)
# will fail with "Failed to fetch". This serves the folder locally.
echo "LUSTRE running at http://localhost:8899"
python3 -m http.server 8899
