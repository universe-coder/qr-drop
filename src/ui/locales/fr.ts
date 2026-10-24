import type { Dictionary } from './ru';

export const fr: Dictionary = {
  app: {
    title: 'QR Drop',
    tagline: 'Un fichier de l’écran à la caméra. Sans internet, sans câble, sans serveur.',
  },

  home: {
    eyebrow: 'Open source · fonctionne hors ligne',
    headline: ['Envoyez un fichier', 'par l’écran'],
    lead:
      'Un appareil affiche un flux de QR codes, l’autre le filme avec sa caméra. ' +
      'Rien n’est envoyé nulle part : tout se passe entre deux écrans.',
    send: 'Envoyer',
    sendHint: 'Choisir un fichier et afficher les codes',
    receive: 'Recevoir',
    receiveHint: 'Allumer la caméra et reconstituer le fichier',
    howTitle: 'Comment ça marche',
    how: [
      ['Découpage', 'Le fichier est découpé en blocs qui alimentent une fontaine infinie de trames.'],
      ['Affichage', 'Les trames défilent à l’écran, de 8 à 12 QR codes par seconde.'],
      [
        'Reconstitution',
        'La caméra capte ce qu’elle peut. Les trous ne posent pas problème : n’importe quelles trames font l’affaire, pas toutes.',
      ],
    ],
    limitsTitle: 'À savoir avant de commencer',
    limits: [
      'Le débit est de quelques kilo-octets par seconde. Idéal pour un document, une clé ou une photo, pas pour une vidéo.',
      'Les deux écrans doivent rester allumés et immobiles pendant tout le transfert.',
      'La réception nécessite une caméra et HTTPS. L’envoi fonctionne dans tout navigateur récent.',
    ],
    selftest: 'Autotest',
    source: 'Code source',
    license: 'Licence MIT',
  },

  send: {
    title: 'Envoi',
    drop: 'Déposez un fichier ici',
    dropOr: 'ou',
    pick: 'Choisir un fichier',
    pickAgain: 'Autre fichier',
    reading: 'Lecture du fichier…',
    tooBig: (limit: string) =>
      `Le fichier dépasse ${limit}. Le transfert prendrait des heures, choisissez quelque chose de plus léger.`,
    profile: 'Profil de transfert',
    profileNames: {
      reliable: 'Fiable',
      balanced: 'Normal',
      fast: 'Rapide',
    },
    profileHints: {
      reliable: 'Gros codes. Plus lent, mais lisible même par une caméra modeste et sous un mauvais éclairage.',
      balanced: 'Un juste milieu. Commencez par celui-ci.',
      fast: 'Codes petits et denses. Il faut une bonne caméra, un écran lumineux et des mains stables.',
    },
    blocksLabel: 'Blocs',
    frameLabel: 'Par trame',
    qrLabel: 'QR',
    bestCase: 'Si chaque trame est captée',
    likelyCase: 'Le plus probable',
    start: 'Afficher les codes',
    stop: 'Arrêter',
    running: 'Transfert en cours',
    elapsed: 'Écoulé',
    pass: 'Passage',
    framesShown: 'Trames',
    passHint: 'Le flux est infini : dès qu’un passage se termine, le suivant commence.',
    blindNotice:
      'L’expéditeur ne voit pas ce qui a déjà été reçu : le canal est à sens unique. ' +
      'Suivez la progression sur l’autre appareil.',
    holdStill: 'Gardez l’écran immobile, à environ 15–25 cm de la caméra de l’autre appareil.',
    brightness: 'Poussez la luminosité au maximum : la vitesse en dépend.',
    wakeLockMissing:
      'Ce navigateur ne peut pas garder l’écran allumé. Allongez le délai de verrouillage, sinon le transfert sera interrompu.',
    doneHint: 'Dès que le fichier apparaît sur l’autre appareil, vous pouvez arrêter.',
    failed: 'L’affichage des codes s’est arrêté',
    failedHint:
      'Impossible de préparer les trames. Rechargez la page et réessayez. Si cela se reproduit, choisissez un profil plus léger.',
  },

  receive: {
    title: 'Réception',
    start: 'Allumer la caméra',
    aim: 'Visez l’écran de l’expéditeur',
    aimHint: 'Le code doit tenir entièrement dans le cadre. La caméra ne s’allume qu’après votre appui.',
    starting: 'Démarrage de la caméra…',
    searching: 'Recherche de codes…',
    searchingHint: 'Si rien n’est trouvé, rapprochez-vous ou ajoutez de la lumière.',
    stalled: 'Les trames n’arrivent plus. Réajustez la visée ou éliminez les reflets sur l’écran.',
    torch: 'Lampe',
    stop: 'Arrêter',
    received: 'Reçu',
    remaining: 'Reste environ',
    framesPerSecond: (value: number) => `${value} trames/s`,
    blocks: (recovered: number, total: number) => `${recovered} blocs sur ${total}`,
    integrityRetry:
      'Somme de contrôle incorrecte : une trame corrompue est passée. Reconstitution réinitialisée, la réception continue.',
    integrityFailed:
      'Somme de contrôle incorrecte pour la deuxième fois. Les appareils ne semblent pas d’accord. Relancez le transfert.',
    integrityTitle: 'Le fichier n’a pas pu être reconstitué',
    incompatible:
      'L’expéditeur utilise une autre version de l’application. Rechargez la page sur les deux appareils.',
  },

  camera: {
    unsupported: 'Ce navigateur ne donne pas accès à la caméra',
    unsupportedHint:
      'La réception est impossible ici. Ouvrez la page dans le navigateur habituel de votre téléphone. L’envoi fonctionne partout.',
    denied: 'Accès à la caméra refusé',
    deniedHint: 'Autorisez la caméra pour ce site dans les réglages du navigateur, puis réessayez.',
    notFound: 'Aucune caméra trouvée',
    notFoundHint: 'Cet appareil ne semble pas avoir de caméra adaptée.',
    busy: 'Caméra occupée',
    busyHint: 'Une autre application utilise la caméra. Fermez-la et réessayez.',
    unknown: 'Impossible de démarrer la caméra',
    unknownHint: 'Réessayez ou rechargez la page.',
    insecure: 'Une connexion sécurisée est nécessaire',
    insecureHint: 'La caméra n’est disponible qu’en HTTPS ou sur localhost.',
    retry: 'Réessayer',
  },

  result: {
    title: 'Fichier reçu',
    subtitle: 'Intégrité vérifiée par SHA-256',
    save: 'Enregistrer',
    receiveMore: 'Recevoir un autre',
    savedShare: 'Fichier transmis au menu de partage du système.',
    savedDownload: 'Fichier enregistré dans les téléchargements.',
    savedTab: 'Fichier ouvert dans un nouvel onglet, enregistrez-le depuis là.',
    saveFailed: 'Impossible d’enregistrer le fichier. Essayez un autre navigateur.',
  },

  selftest: {
    title: 'Autotest',
    lead:
      'Encode un fichier, dessine de vrais QR codes sur un canvas, les relit avec jsQR et reconstitue le fichier. ' +
      'Tout est vérifié, sauf la caméra elle-même.',
    run: 'Lancer',
    running: 'Test en cours…',
    failed: (reason: string) => `L’autotest a échoué : ${reason}`,
    progress: (shown: number, decoded: number, blocks: number, total: number) =>
      `trames ${shown}, décodées ${decoded}, blocs ${blocks}/${total}`,
    results: 'Résultats',
    cases: [
      'canal propre',
      'perte de 40 %',
      'perte de 60 %',
      'profil dense',
      'profil à gros codes',
      'fichier plus petit qu’un bloc',
    ],
    summary: (shown: number, meta: number, decoded: number, unreadable: number, overhead: string) =>
      `${shown} trames affichées (dont ${meta} de service), ${decoded} décodées, ${unreadable} illisibles, ×${overhead} trames de données par bloc`,
    time: 'Durée',
    speed: 'Débit',
    blocks: 'Blocs',
    seconds: 's',
    note:
      'Le débit est calculé à partir de la fréquence du profil, pas de la durée du test : ici le dessin et le décodage ' +
      'partagent un seul thread et sont bien plus lents qu’une vraie caméra.',
  },

  common: {
    back: 'Retour',
    languageLabel: 'Langue',
  },
};
