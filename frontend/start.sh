#!/bin/sh
exec npx next start -H 0.0.0.0 -p "${PORT:-3000}"
