# Run this: python fix-compare.py
# from C:\Users\sgyim\OneDrive\Desktop\C3 Website\c3-eleventy\c3-eleventy
import os

path = os.path.join('netlify', 'functions', 'card-compare.mjs')

with open(path, 'rb') as f:
    content = f.read()

bad  = b"join(' vs ') + '\n'"
good = b"join(' vs ') + '\\n'"

if bad in content:
    content = content.replace(bad, good)
    with open(path, 'wb') as f:
        f.write(content)
    print("FIXED - literal newline replaced")
else:
    print("Bad pattern not found - checking alternate...")
    # Try CRLF variant
    bad2 = b"join(' vs ') + '\r\n'"
    if bad2 in content:
        content = content.replace(bad2, good)
        with open(path, 'wb') as f:
            f.write(content)
        print("FIXED - CRLF newline replaced")
    else:
        print("Pattern not found - file may already be correct")
        # Show what's actually there
        idx = content.find(b"parts.join")
        if idx > -1:
            print(f"Actual bytes: {repr(content[idx:idx+50])}")
