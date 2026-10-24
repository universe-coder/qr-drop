import type { Dictionary } from './ru';

export const en: Dictionary = {
  app: {
    title: 'QR Drop',
    tagline: 'Send a file from screen to camera. No internet, no cables, no servers.',
  },

  home: {
    eyebrow: 'Open source · works offline',
    headline: ['Send a file', 'by screen light'],
    lead:
      'One device shows a stream of QR codes, the other films it with its camera. ' +
      'Nothing is uploaded anywhere: it all happens between two screens.',
    send: 'Send',
    sendHint: 'Pick a file and show the codes',
    receive: 'Receive',
    receiveHint: 'Turn on the camera and assemble the file',
    howTitle: 'How it works',
    how: [
      ['Slice', 'The file is cut into blocks that feed an endless fountain of frames.'],
      ['Show', 'Frames play back on screen, 8 to 12 QR codes per second.'],
      ['Assemble', 'The camera catches what it can. Gaps are fine: any frames will do, not all of them.'],
    ],
    limitsTitle: 'Good to know',
    limits: [
      'Throughput is a few kilobytes per second. Great for a document, a key or a photo, not for video.',
      'Both screens must stay on and still for the whole transfer.',
      'Receiving needs a camera and HTTPS. Sending works in any modern browser.',
    ],
    selftest: 'Self-test',
    source: 'Source code',
    license: 'MIT License',
  },

  send: {
    title: 'Send',
    drop: 'Drop a file here',
    dropOr: 'or',
    pick: 'Choose file',
    pickAgain: 'Another file',
    reading: 'Reading file…',
    tooBig: (limit: string) => `The file is larger than ${limit}. That would take hours, pick something smaller.`,
    profile: 'Transfer profile',
    profileNames: {
      reliable: 'Reliable',
      balanced: 'Normal',
      fast: 'Fast',
    },
    profileHints: {
      reliable: 'Large codes. Slower, but readable even by a weak camera in poor light.',
      balanced: 'A sensible middle ground. Start here.',
      fast: 'Small dense codes. Needs a good camera, a bright screen and steady hands.',
    },
    blocksLabel: 'Blocks',
    frameLabel: 'Per frame',
    qrLabel: 'QR',
    bestCase: 'If every frame is caught',
    likelyCase: 'Most likely',
    start: 'Show codes',
    stop: 'Stop',
    running: 'Transmitting',
    elapsed: 'Elapsed',
    pass: 'Pass',
    framesShown: 'Frames',
    passHint: 'The stream is endless: once a pass completes, the next one begins.',
    blindNotice:
      'The sender cannot see how much has been received: the channel is one-way. ' +
      'Watch progress on the other device.',
    holdStill: 'Hold the screen still, about 15–25 cm from the other device’s camera.',
    brightness: 'Turn brightness all the way up: speed depends on it.',
    wakeLockMissing:
      'This browser cannot keep the screen awake. Extend auto-lock, or the transfer will break off.',
    doneHint: 'Once the file appears on the other device, you can stop.',
    failed: 'Code playback stopped',
    failedHint:
      'Could not prepare frames. Reload the page and try again. If it happens again, pick a lighter profile.',
  },

  receive: {
    title: 'Receive',
    start: 'Turn on camera',
    aim: 'Point at the sender’s screen',
    aimHint: 'The code must fit entirely inside the frame. The camera turns on only when you tap.',
    starting: 'Starting camera…',
    searching: 'Looking for codes…',
    searchingHint: 'If nothing shows up, move closer or add light.',
    stalled: 'Frames stopped arriving. Re-aim or get rid of glare on the screen.',
    torch: 'Torch',
    stop: 'Stop',
    received: 'Received',
    remaining: 'About',
    framesPerSecond: (value: number) => `${value} fps`,
    blocks: (recovered: number, total: number) => `${recovered} of ${total} blocks`,
    integrityRetry:
      'Checksum mismatch: a corrupt frame slipped through. Assembly reset, still receiving.',
    integrityFailed:
      'Checksum mismatched a second time. The devices seem to disagree. Restart the transfer.',
    integrityTitle: 'The file did not assemble',
    incompatible: 'The sender runs a different version of the app. Reload the page on both devices.',
  },

  camera: {
    unsupported: 'This browser gives no camera access',
    unsupportedHint:
      'Receiving is impossible here. Open the page in your phone’s regular browser. Sending still works anywhere.',
    denied: 'Camera access denied',
    deniedHint: 'Allow the camera for this site in browser settings and try again.',
    notFound: 'No camera found',
    notFoundHint: 'This device does not seem to have a suitable camera.',
    busy: 'Camera is busy',
    busyHint: 'Another app is using the camera. Close it and try again.',
    unknown: 'Could not start the camera',
    unknownHint: 'Try again or reload the page.',
    insecure: 'A secure connection is required',
    insecureHint: 'The camera is only available over HTTPS or on localhost.',
    retry: 'Try again',
  },

  result: {
    title: 'File received',
    subtitle: 'Integrity verified with SHA-256',
    save: 'Save',
    receiveMore: 'Receive another',
    savedShare: 'File handed to the system share sheet.',
    savedDownload: 'File saved to downloads.',
    savedTab: 'File opened in a new tab, save it from there.',
    saveFailed: 'Could not save the file. Try another browser.',
  },

  selftest: {
    title: 'Self-test',
    lead:
      'Encodes a file, draws real QR codes on a canvas, reads them back with jsQR and reassembles the file. ' +
      'Everything is tested except the camera itself.',
    run: 'Run',
    running: 'Running…',
    failed: (reason: string) => `Self-test crashed: ${reason}`,
    progress: (shown: number, decoded: number, blocks: number, total: number) =>
      `frames ${shown}, decoded ${decoded}, blocks ${blocks}/${total}`,
    results: 'Results',
    cases: ['clean channel', '40% loss', '60% loss', 'dense profile', 'large profile', 'file smaller than a block'],
    summary: (shown: number, meta: number, decoded: number, unreadable: number, overhead: string) =>
      `${shown} frames shown (${meta} meta), ${decoded} decoded, ${unreadable} unreadable, ×${overhead} data frames per block`,
    time: 'Time',
    speed: 'Speed',
    blocks: 'Blocks',
    seconds: 's',
    note:
      'Speed is computed from the profile frame rate, not the run time: drawing and decoding share one thread ' +
      'here and are much slower than a real camera.',
  },

  common: {
    back: 'Back',
    languageLabel: 'Language',
  },
};