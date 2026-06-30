#!/usr/bin/env bash
set -euo pipefail

FILE="index.html"

cp "$FILE" "$FILE.bak"

perl -0pi -e '
s{
\.hero-portrait-wrap\s*\{
\s*width:\s*100%;
\s*aspect-ratio:\s*1;
\s*border:\s*1px\s+solid\s+var\(--border2\);
\s*background:\s*var\(--bg2\);
\s*\}
}{
.hero-portrait-wrap {
    width: 100%;
    aspect-ratio: 1123 / 1400;
    border: 1px solid var(--border2);
    background: var(--bg2);
    max-width: 380px;
    justify-self: end;
}
}xs;

s{
\.hero-portrait\s*\{
\s*width:\s*100%;
\s*height:\s*100%;
\s*object-fit:\s*cover;
\s*display:\s*block;
\s*filter:\s*brightness\(0\.15\)\s*saturate\(0\.6\)\s*contrast\(1\.05\);
\s*\}
}{
.hero-portrait {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center 15%;
    display: block;
    filter: brightness(0.9) contrast(1.05);
}
}xs;

s/max-width:\s*200px;/width: min(240px, 70vw);/g;
' "$FILE"

echo "✅ Patch applied."
echo "Original backed up as ${FILE}.bak"