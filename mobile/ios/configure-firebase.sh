#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
    printf 'Usage: %s /path/to/GoogleService-Info.plist\n' "$0" >&2
    exit 1
fi

ios_dir=$(cd "$(dirname "$0")" && pwd)
config="$ios_dir/Config"
scheme=$(/usr/bin/plutil -extract REVERSED_CLIENT_ID raw -o - "$1")
if ! printf '%s\n' "$scheme" | /usr/bin/grep -Eq '^com\.googleusercontent\.apps\.[a-zA-Z0-9-]+$'; then
    printf 'The Firebase config must have a valid Google callback scheme.\n' >&2
    exit 1
fi
/usr/bin/plutil -extract CLIENT_ID raw -o /dev/null "$1"
/usr/bin/plutil -extract BUNDLE_ID raw -o /dev/null "$1"
/usr/bin/install -m 600 "$1" "$config/GoogleService-Info.plist"
printf 'GOOGLE_REVERSED_CLIENT_ID = %s\n' "$scheme" > "$config/Firebase.local.xcconfig"
printf 'Firebase configuration installed locally.\n'
