# QR Drop

**Send a file from one device to another through a stream of QR codes.** One screen plays an endless sequence of codes, the other device films it and reassembles the file. No server, no network, no pairing: just a screen and a lens.

**Live:** https://universe-coder.github.io/qr-drop/

[MIT License](LICENSE)

<table>
  <tr>
    <td align="center"><img src="docs/screenshots/home.png" width="200" alt="Home screen"><br><sub>Home</sub></td>
    <td align="center"><img src="docs/screenshots/transmit.png" width="200" alt="Sender showing a stream of QR codes"><br><sub>Sending</sub></td>
    <td align="center"><img src="docs/screenshots/receive.png" width="200" alt="Receiver assembling the file from the camera"><br><sub>Receiving</sub></td>
    <td align="center"><img src="docs/screenshots/received.png" width="200" alt="File received and verified"><br><sub>Done</sub></td>
  </tr>
</table>

```
file ──► blocks ──► fountain frames ──► QR ──► screen
                                                 │
                                              camera
                                                 ▼
file ◄── SHA-256 ◄── assembly ◄── frames ◄── jsQR
```

- Works offline after the first visit (service worker), nothing is ever uploaded.
- Sending works in any modern browser. Receiving needs a camera and HTTPS.
- UI in English, Russian, Chinese, Arabic (right-to-left) and French; light and dark themes.
- Built-in self-test (`#/selftest`) runs the whole pipeline in the browser, except the camera.

## Why it works without a back channel

The receiver cannot ask for a frame to be repeated: there is nothing to say it with. Meanwhile the camera misses half of what is shown, or more. Numbered blocks played in a loop do not work here: with a steady mismatch between screen and camera rates, the same numbers can be missed forever.

So QR Drop uses **fountain coding (LT)**: every frame is the XOR of a random set of source blocks, and the receiver only needs any `K·(1+ε)` frames, no matter which. Both sides derive the set of blocks in a frame from the frame number alone, so not a single byte of block descriptors travels over the channel.

| phase | frames | content |
|---|---|---|
| systematic | `seq mod 5K < K` | exactly one source block |
| fountain | the rest | XOR over a robust soliton distribution with a residual ladder |

The systematic prologue gives the ideal case: **with clean reception the file is assembled in exactly K frames**, zero overhead. The prologue repeats every `5K` frames for anyone who pointed the camera late.

### Measured overhead

Data frames per source block, BP decoder simulation, 60 runs per point:

| K | 0% loss | 30% | 50% | 60% | 75% |
|---|---|---|---|---|---|
| 137 | 1.00 | 1.23 | 1.28 | 1.33 | 1.39 |
| 1024 | 1.00 | 1.21 | 1.19 | 1.21 | 1.30 |

## Frame format

Little-endian. Common 5 bytes: magic `QD`, version+type, session id.

**DATA**: 13 bytes of overhead plus payload.

```
0  'Q' 'D'                    2
2  (version << 4) | type      1
3  session                    2
5  frame number               4
9  payload                    blockSize
.. CRC-32C                    4
```

**META**: 59 bytes plus name and MIME: file size, block size, block count, SHA-256 of the file, schedule fingerprint, name, MIME.

Meta slots are `0, 4, 8 … 28`, then every 16th. Someone who aims right away gets the file description with ~98% probability within the first 32 slots even at 60% loss; in steady state meta frames take 1/16 of the stream.

- **CRC-32C, not CRC-16.** The fountain decoder mixes a frame into several blocks at once, so one undetected corrupt frame silently ruins the whole file, and you would only find out from the SHA-256 minutes later.
- **Schedule fingerprint in META.** Both sides run the same code, but one tab may be on a stale cached build. The fingerprint turns "garbage after three minutes" into an honest error right away.
- **Raw byte-mode QR, no base45/base64.** jsQR returns exact `binaryData`; verified on 700 bytes with zeros and bytes above `0x7F`.

## Profiles

| Profile | QR version | ECC | modules | bytes/frame | fps | 100 KB, realistic |
|---|---|---|---|---|---|---|
| Reliable | 13 | M | 69×69 | 316 | 8 | ~95 s (1.1 KB/s) |
| Normal | 19 | L | 93×93 | 776 | 10 | ~38 s (2.7 KB/s) |
| Fast | 25 | L | 117×117 | 1260 | 12 | ~25 s (4.0 KB/s) |

More data per frame means smaller modules and higher demands on the camera, light and steady hands. The "realistic" estimate assumes the camera decodes 35–55% of displayed frames, plus fountain overhead. The file size cap is 2 MB: that is already about an hour and a half of filming.

## Architecture

```
src/
  protocol/     pure core without DOM, fully testable
    crc32.ts        CRC-32C
    prng.ts         splitmix32 + distinct index sampling
    soliton.ts      robust soliton distribution
    schedule.ts     ★ the one place where encoder and decoder must agree
    frames.ts       frame serialization
    encoder.ts      file → endless frame stream
    decoder.ts      incremental LT peeling decoder
    receiver.ts     receive session: META, foreign sessions, integrity
  qr/
    capacity.ts     capacity table, block size selection
    encode.ts       bytes → module matrix
    paint.ts        matrix → canvas
    broadcast.worker.ts  frame generation off the main thread
    scan.worker.ts       recognition and parsing off the main thread
  platform/       camera, wake lock, saving, vibration
  app/            hooks and state
  ui/             screens, i18n, small component kit
    locales/        one dictionary per language, all typed against ru.ts
```

- **Sending.** Frames are generated in a worker, 12 ahead. Display follows a `requestAnimationFrame` tick counter, not the clock: a frame must live a whole number of screen refreshes, otherwise a swap eventually lands mid-refresh and the camera captures half of the old frame and half of the new one.
- **Receiving.** Only the central square under the reticle is decoded, downscaled to 512×512: three times cheaper, and it ignores foreign QR codes at the edges. The next snapshot is not requested until the previous one is parsed.

## Development

```bash
npm install
npm run dev       # http://localhost:5173
npm run check     # types + lint + tests
npm run build     # static site in dist/
```

The camera only works over HTTPS or on `localhost`. To test receiving on a phone, serve the dev build over HTTPS (for example via a tunnel) or use the deployed site.

`npm run check` runs 70 tests, including loopback transfers with 20/50/70% frame loss, reception starting mid-stream, a binary round-trip through real QR codes rasterized to pixels and read back by jsQR, and corruption of every single frame byte being caught by the CRC.

## Deployment

The site is fully static and uses relative paths, so `dist/` can be served from any host and any subpath.

GitHub Pages is set up in [`.github/workflows/pages.yml`](.github/workflows/pages.yml): every push to `main` runs the checks, builds and publishes. One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Known trade-offs

- **jsQR rather than zxing-wasm.** zxing-wasm is about twice as fast, but pulls a WASM file that loads from a CDN by default. For an app whose whole point is working offline, that is a bad deal.
- **The sender cannot see the receiver's progress.** The channel is one-way, and pretending otherwise would be dishonest. The send screen shows its own time and pass number and says to watch progress on the other device.
- **Native `BarcodeDetector` is not used.** It only returns `rawValue`, a string, not bytes.
