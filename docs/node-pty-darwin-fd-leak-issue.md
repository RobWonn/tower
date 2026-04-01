# Title: macOS: darwin posix_spawn path leaks file descriptors across repeated spawn/exit, eventually causing `posix_spawnp failed`

Hi, we found a reproducible file descriptor leak on macOS in the darwin `posix_spawn` path.

After a long-running process repeatedly creates and exits PTYs, file descriptors keep increasing and never return to baseline. Eventually new PTY launches fail with:

`A native exception occurred during launch (posix_spawnp failed.)`

## Environment

- macOS 15.x arm64
- Node.js 22.12.0
- node-pty 1.1.0

## Minimal reproduction

```js
import fs from 'node:fs';
import * as pty from 'node-pty';

function fdCount() {
  try {
    return fs.readdirSync('/dev/fd').length;
  } catch {
    return -1;
  }
}

const shell = process.env.SHELL || '/bin/zsh';
console.log('start fd', fdCount());

for (let i = 0; i < 100; i++) {
  const term = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: process.cwd(),
    env: process.env,
  });

  await new Promise((resolve) => {
    term.onExit(() => resolve());
    setTimeout(() => term.write('exit\r'), 10);
  });

  if (i % 20 === 0) {
    console.log('iter', i, 'fd', fdCount());
  }
}

console.log('end fd', fdCount());
```

## Observed result

On our side, the fd count grows roughly linearly:

- start: `12`
- after repeated spawn/exit: `313`

In production this eventually causes PTY launch failures with `posix_spawnp failed`.

## Expected result

FD count should return to roughly the baseline after each PTY exits.

## Root cause we found locally

We patched the darwin native code locally and the leak disappeared in the reproduction above.

These appear to be three separate leaks in `src/unix/pty.cc`:

1. In `SetupExitCallback`, the `kqueue()` fd (`kq`) is never closed.
2. In `pty_posix_spawn`, the parent-side `slave` fd is never closed.
3. The `low_fds` cleanup loop appears to have an off-by-one bug:
   `low_fds[0]` is never closed.

After fixing those three points locally, the same reproduction stayed stable:

- start: `12`
- end: `13`

So this seems to be a real darwin resource leak rather than only an app-level issue.

If useful, I can also open a PR with the exact patch we tested locally.
