#!/usr/bin/env python3
"""Forward an image archive unchanged; report only byte counts to stderr."""
import sys
import time

started = last_report = time.monotonic()
sent = 0
try:
    while chunk := sys.stdin.buffer.read(1024 * 1024):
        sys.stdout.buffer.write(chunk)
        sys.stdout.buffer.flush()
        sent += len(chunk)
        now = time.monotonic()
        if now - last_report >= 30:
            print(f'Image stream: {sent / 1024**2:.1f} MiB forwarded; '
                  f'elapsed {int(now - started)}s; '
                  f'average {sent / max(now - started, 0.001) / 1024:.1f} KiB/s',
                  file=sys.stderr, flush=True)
            last_report = now
    print(f'Image stream completed: {sent / 1024**2:.1f} MiB compressed. '
          'Waiting for the VPS receiver to finish loading and health checks.',
          file=sys.stderr, flush=True)
except BrokenPipeError:
    print('Image stream interrupted before completion.', file=sys.stderr, flush=True)
    # Avoid a second error while Python flushes stdout on exit.
    import os
    os._exit(1)
