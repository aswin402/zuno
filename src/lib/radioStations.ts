export type RadioCategory =
  | 'Chill & Lofi'
  | 'Jazz & Soul'
  | 'Indie & Rock'
  | 'Electronic & Synth'
  | 'Classical'
  | 'Ambient & Focus'
  | 'World & Indian'
  | 'Pop & Hits'
  | 'News & Public'
  | 'Game & Retro'

export const RADIO_CATEGORIES: RadioCategory[] = [
  'Chill & Lofi',
  'Jazz & Soul',
  'Indie & Rock',
  'Electronic & Synth',
  'Classical',
  'Ambient & Focus',
  'World & Indian',
  'Pop & Hits',
  'News & Public',
  'Game & Retro',
]

export interface OnlineStation {
  id: string
  name: string
  url: string
  category: RadioCategory | 'Custom'
  country: string
  language: string
  tags: string[]
  bitrate: number
  codec: string
  homepage?: string
  isCustom?: boolean
  addedAt?: number
}

export type FmBandId = 'global' | 'americas' | 'japan'

export interface FmBandSpec {
  id: FmBandId
  label: string
  shortLabel: string
  minMhz: number
  maxMhz: number
  stepMhz: number
  majorStepMhz: number
}

export const FM_BANDS: Record<FmBandId, FmBandSpec> = {
  global: {
    id: 'global',
    label: 'Global / India / Europe (87.5–108.0 MHz)',
    shortLabel: '87.5–108.0',
    minMhz: 87.5,
    maxMhz: 108.0,
    stepMhz: 0.1,
    majorStepMhz: 2.0,
  },
  americas: {
    id: 'americas',
    label: 'Americas FM (87.9–107.9 MHz)',
    shortLabel: '87.9–107.9',
    minMhz: 87.9,
    maxMhz: 107.9,
    stepMhz: 0.2,
    majorStepMhz: 2.0,
  },
  japan: {
    id: 'japan',
    label: 'Japan Wide FM (76.0–95.0 MHz)',
    shortLabel: '76.0–95.0',
    minMhz: 76.0,
    maxMhz: 95.0,
    stepMhz: 0.1,
    majorStepMhz: 2.0,
  },
}

export interface DiscoverPreset {
  id: string
  label: string
  query?: string
  tag?: string
  country?: string
  language?: string
}

export const DISCOVER_PRESETS: DiscoverPreset[] = [
  { id: 'india', label: 'India FM', country: 'India' },
  { id: 'malayalam', label: 'Malayalam', language: 'malayalam' },
  { id: 'tamil', label: 'Tamil', language: 'tamil' },
  { id: 'hindi', label: 'Hindi', language: 'hindi' },
  { id: 'lofi', label: 'Lo-Fi', tag: 'lofi' },
  { id: 'jazz', label: 'Jazz', tag: 'jazz' },
  { id: 'synthwave', label: 'Synthwave', tag: 'synthwave' },
  { id: 'classical', label: 'Classical', tag: 'classical' },
  { id: 'ambient', label: 'Ambient', tag: 'ambient' },
  { id: 'indie', label: 'Indie', tag: 'indie' },
  { id: 'news', label: 'News', tag: 'news' },
  { id: 'uk', label: 'UK', country: 'United Kingdom' },
  { id: 'usa', label: 'USA', country: 'United States' },
  { id: 'japan', label: 'Japan', country: 'Japan' },
]

type RawStationTuple = [
  id: string,
  name: string,
  url: string,
  category: RadioCategory,
  country: string,
  language: string,
  tags: string[],
  bitrate: number,
  codec?: string,
]

const RAW_CURATED_STATIONS: RawStationTuple[] = [
  // ── SomaFM (35 commercial-free, listener-supported permanent Icecast channels) ──
  ['somafm-groovesalad', 'SomaFM Groove Salad', 'https://ice1.somafm.com/groovesalad-128-mp3', 'Chill & Lofi', 'USA', 'English', ['chill', 'downtempo', 'ambient'], 128],
  ['somafm-gsclassic', 'SomaFM Groove Salad Classic', 'https://ice1.somafm.com/gsclassic-128-mp3', 'Chill & Lofi', 'USA', 'English', ['chillout', 'classic', 'downtempo'], 128],
  ['somafm-lush', 'SomaFM Lush', 'https://ice1.somafm.com/lush-128-mp3', 'Chill & Lofi', 'USA', 'English', ['vocals', 'mellow', 'electronic'], 128],
  ['somafm-secretagent', 'SomaFM Secret Agent', 'https://ice1.somafm.com/secretagent-128-mp3', 'Chill & Lofi', 'USA', 'English', ['lounge', 'spy', 'downtempo'], 128],
  ['somafm-beatblender', 'SomaFM Beat Blender', 'https://ice1.somafm.com/beatblender-128-mp3', 'Chill & Lofi', 'USA', 'English', ['deep house', 'downtempo', 'chill'], 128],
  ['somafm-fluid', 'SomaFM Fluid', 'https://ice1.somafm.com/fluid-128-mp3', 'Chill & Lofi', 'USA', 'English', ['instrumental', 'hiphop', 'future soul'], 128],
  ['somafm-bossa', 'SomaFM Bossa Beyond', 'https://ice1.somafm.com/bossa-128-mp3', 'Chill & Lofi', 'USA', 'Portuguese', ['bossa nova', 'brazil', 'lounge'], 128],
  ['somafm-dronezone', 'SomaFM Drone Zone', 'https://ice1.somafm.com/dronezone-128-mp3', 'Ambient & Focus', 'USA', 'Instrumental', ['ambient', 'space', 'focus'], 128],
  ['somafm-deepspaceone', 'SomaFM Deep Space One', 'https://ice1.somafm.com/deepspaceone-128-mp3', 'Ambient & Focus', 'USA', 'Instrumental', ['deep space', 'ambient', 'sleep'], 128],
  ['somafm-darkzone', 'SomaFM Dark Zone', 'https://ice1.somafm.com/darkzone-128-mp3', 'Ambient & Focus', 'USA', 'Instrumental', ['dark ambient', 'atmospheric'], 128],
  ['somafm-sf1033', 'SomaFM SF 10-33', 'https://ice1.somafm.com/sf1033-128-mp3', 'Ambient & Focus', 'USA', 'English', ['ambient', 'scanner', 'cinematic'], 128],
  ['somafm-missioncontrol', 'SomaFM Mission Control', 'https://ice1.somafm.com/missioncontrol-128-mp3', 'Ambient & Focus', 'USA', 'English', ['nasa', 'ambient', 'space'], 128],
  ['somafm-tikitime', 'SomaFM Tiki Time', 'https://ice1.somafm.com/tikitime-128-mp3', 'Chill & Lofi', 'USA', 'English', ['tiki', 'exotica', 'retro'], 128],
  ['somafm-sonicuniverse', 'SomaFM Sonic Universe', 'https://ice1.somafm.com/sonicuniverse-128-mp3', 'Jazz & Soul', 'USA', 'English', ['nu jazz', 'avant-garde', 'fusion'], 128],
  ['somafm-7soul', 'SomaFM Seven Inch Soul', 'https://ice1.somafm.com/7soul-128-mp3', 'Jazz & Soul', 'USA', 'English', ['soul', 'vintage', 'funk'], 128],
  ['somafm-illstreet', 'SomaFM Illinois Street Lounge', 'https://ice1.somafm.com/illstreet-128-mp3', 'Jazz & Soul', 'USA', 'English', ['lounge', 'exotica', 'vintage'], 128],
  ['somafm-indiepop', 'SomaFM Indie Pop Rocks!', 'https://ice1.somafm.com/indiepop-128-mp3', 'Indie & Rock', 'USA', 'English', ['indie', 'rock', 'alternative'], 128],
  ['somafm-bagel', 'SomaFM BAGeL Radio', 'https://ice1.somafm.com/bagel-128-mp3', 'Indie & Rock', 'USA', 'English', ['indie', 'alternative', 'rock'], 128],
  ['somafm-folkfwd', 'SomaFM Folk Forward', 'https://ice1.somafm.com/folkfwd-128-mp3', 'Indie & Rock', 'USA', 'English', ['indie folk', 'acoustic', 'singer'], 128],
  ['somafm-bootliquor', 'SomaFM Boot Liquor', 'https://ice1.somafm.com/bootliquor-128-mp3', 'Indie & Rock', 'USA', 'English', ['americana', 'roots', 'country'], 128],
  ['somafm-seventies', 'SomaFM Left Coast 70s', 'https://ice1.somafm.com/seventies-128-mp3', 'Indie & Rock', 'USA', 'English', ['70s', 'classic rock', 'mellow'], 128],
  ['somafm-u80s', 'SomaFM Underground 80s', 'https://ice1.somafm.com/u80s-128-mp3', 'Indie & Rock', 'USA', 'English', ['80s', 'synthpop', 'new wave'], 128],
  ['somafm-metal', 'SomaFM Metal Detector', 'https://ice1.somafm.com/metal-128-mp3', 'Indie & Rock', 'USA', 'English', ['metal', 'doom', 'prog'], 128],
  ['somafm-defcon', 'SomaFM DEF CON Radio', 'https://ice1.somafm.com/defcon-128-mp3', 'Electronic & Synth', 'USA', 'English', ['electronic', 'hacker', 'coding'], 128],
  ['somafm-vaporwaves', 'SomaFM Vaporwaves', 'https://ice1.somafm.com/vaporwaves-128-mp3', 'Electronic & Synth', 'USA', 'English', ['vaporwave', 'retro', 'synth'], 128],
  ['somafm-synphaera', 'SomaFM Synphaera', 'https://ice1.somafm.com/synphaera-128-mp3', 'Electronic & Synth', 'USA', 'Instrumental', ['space synth', 'berlin school', 'ambient'], 128],
  ['somafm-spacestation', 'SomaFM Space Station Soma', 'https://ice1.somafm.com/spacestation-128-mp3', 'Electronic & Synth', 'USA', 'English', ['electronica', 'ambient', 'beats'], 128],
  ['somafm-cliqhop', 'SomaFM Cliqhop IDM', 'https://ice1.somafm.com/cliqhop-128-mp3', 'Electronic & Synth', 'USA', 'Instrumental', ['idm', 'glitch', 'beats'], 128],
  ['somafm-dubstep', 'SomaFM Dub Step Beyond', 'https://ice1.somafm.com/dubstep-128-mp3', 'Electronic & Synth', 'USA', 'English', ['dubstep', 'bass', 'electronic'], 128],
  ['somafm-thetrip', 'SomaFM The Trip', 'https://ice1.somafm.com/thetrip-128-mp3', 'Electronic & Synth', 'USA', 'English', ['progressive house', 'trance'], 128],
  ['somafm-poptron', 'SomaFM PopTron', 'https://ice1.somafm.com/poptron-128-mp3', 'Electronic & Synth', 'USA', 'English', ['electropop', 'indie dance'], 128],
  ['somafm-suburbsofgoa', 'SomaFM Suburbs of Goa', 'https://ice1.somafm.com/suburbsofgoa-128-mp3', 'World & Indian', 'India / USA', 'Hindi / English', ['desi', 'indian', 'asian beats'], 128],
  ['somafm-reggae', 'SomaFM Heavyweight Reggae', 'https://ice1.somafm.com/reggae-128-mp3', 'World & Indian', 'USA', 'English', ['reggae', 'dub', 'roots'], 128],
  ['somafm-thistle', 'SomaFM ThistleRadio', 'https://ice1.somafm.com/thistle-128-mp3', 'World & Indian', 'Scotland / USA', 'English', ['celtic', 'folk', 'roots'], 128],
  ['somafm-covers', 'SomaFM Covers', 'https://ice1.somafm.com/covers-128-mp3', 'Pop & Hits', 'USA', 'English', ['covers', 'eclectic', 'pop'], 128],

  // ── Radio Paradise (4 legendary ad-free curated mixes) ──
  ['rp-main', 'Radio Paradise — Main Mix', 'https://stream.radioparadise.com/mp3-128', 'Pop & Hits', 'USA', 'English', ['eclectic', 'ad-free', 'hi-fi'], 128],
  ['rp-mellow', 'Radio Paradise — Mellow Mix', 'https://stream.radioparadise.com/mellow-128', 'Chill & Lofi', 'USA', 'English', ['mellow', 'acoustic', 'chill'], 128],
  ['rp-rock', 'Radio Paradise — Rock Mix', 'https://stream.radioparadise.com/rock-128', 'Indie & Rock', 'USA', 'English', ['rock', 'classic', 'indie'], 128],
  ['rp-global', 'Radio Paradise — Global Mix', 'https://stream.radioparadise.com/global-128', 'World & Indian', 'USA', 'Multilingual', ['world', 'global', 'eclectic'], 128],

  // ── Radio France / FIP / France Musique (19 ad-free public broadcast Icecast streams) ──
  ['rf-fip', 'FIP Paris FM', 'https://icecast.radiofrance.fr/fip-midfi.mp3', 'Pop & Hits', 'France', 'French', ['eclectic', 'curated', 'fm'], 128],
  ['rf-fip-rock', 'FIP Rock', 'https://icecast.radiofrance.fr/fiprock-midfi.mp3', 'Indie & Rock', 'France', 'French', ['rock', 'indie', 'garage'], 128],
  ['rf-fip-jazz', 'FIP Jazz', 'https://icecast.radiofrance.fr/fipjazz-midfi.mp3', 'Jazz & Soul', 'France', 'Instrumental', ['jazz', 'swing', 'modern jazz'], 128],
  ['rf-fip-groove', 'FIP Groove', 'https://icecast.radiofrance.fr/fipgroove-midfi.mp3', 'Jazz & Soul', 'France', 'English', ['funk', 'soul', 'rnb', 'disco'], 128],
  ['rf-fip-world', 'FIP World', 'https://icecast.radiofrance.fr/fipworld-midfi.mp3', 'World & Indian', 'France', 'Multilingual', ['world', 'afrobeat', 'latin'], 128],
  ['rf-fip-electro', 'FIP Electro', 'https://icecast.radiofrance.fr/fipelectro-midfi.mp3', 'Electronic & Synth', 'France', 'Instrumental', ['electro', 'house', 'techno'], 128],
  ['rf-fip-reggae', 'FIP Reggae', 'https://icecast.radiofrance.fr/fipreggae-midfi.mp3', 'World & Indian', 'France', 'English', ['reggae', 'dub', 'ska'], 128],
  ['rf-fip-hiphop', 'FIP Hip-Hop', 'https://icecast.radiofrance.fr/fiphiphop-midfi.mp3', 'Pop & Hits', 'France', 'English', ['hip-hop', 'rap', 'beats'], 128],
  ['rf-fip-metal', 'FIP Metal', 'https://icecast.radiofrance.fr/fipmetal-midfi.mp3', 'Indie & Rock', 'France', 'English', ['metal', 'hard rock', 'thrash'], 128],
  ['rf-fip-pop', 'FIP Pop', 'https://icecast.radiofrance.fr/fippop-midfi.mp3', 'Pop & Hits', 'France', 'French', ['pop', 'indie pop', 'french'], 128],
  ['rf-fip-nouveautes', 'FIP Nouveautés', 'https://icecast.radiofrance.fr/fipnouveautes-midfi.mp3', 'Pop & Hits', 'France', 'French', ['new music', 'discovery'], 128],
  ['rf-musique', 'France Musique FM', 'https://icecast.radiofrance.fr/francemusique-midfi.mp3', 'Classical', 'France', 'French', ['classical', 'orchestra', 'fm'], 128],
  ['rf-musique-easy', 'France Musique Classique Easy', 'https://icecast.radiofrance.fr/francemusiqueeasyclassique-midfi.mp3', 'Classical', 'France', 'Instrumental', ['classical', 'relax', 'piano'], 128],
  ['rf-musique-concerts', 'France Musique Concerts', 'https://icecast.radiofrance.fr/francemusiqueconcertsradiofrance-midfi.mp3', 'Classical', 'France', 'Instrumental', ['symphony', 'live', 'classical'], 128],
  ['rf-musique-jazz', 'France Musique La Jazz', 'https://icecast.radiofrance.fr/francemusiquelajazz-midfi.mp3', 'Jazz & Soul', 'France', 'Instrumental', ['jazz', 'acoustic', 'classic'], 128],
  ['rf-musique-baroque', 'France Musique La Baroque', 'https://icecast.radiofrance.fr/francemusiquebaroque-midfi.mp3', 'Classical', 'France', 'Instrumental', ['baroque', 'early music'], 128],
  ['rf-inter', 'France Inter FM', 'https://icecast.radiofrance.fr/franceinter-midfi.mp3', 'News & Public', 'France', 'French', ['news', 'culture', 'fm'], 128],
  ['rf-culture', 'France Culture FM', 'https://icecast.radiofrance.fr/franceculture-midfi.mp3', 'News & Public', 'France', 'French', ['culture', 'talk', 'public'], 128],
  ['rf-mouv', "Mouv' FM", 'https://icecast.radiofrance.fr/mouv-midfi.mp3', 'Pop & Hits', 'France', 'French', ['hip-hop', 'urban', 'rnb'], 128],

  // ── SRG SSR Swiss Public Radio (5 ad-free channels) ──
  ['srg-jazz', 'Radio Swiss Jazz', 'https://stream.srg-ssr.ch/m/rsj/mp3_128', 'Jazz & Soul', 'Switzerland', 'Instrumental', ['jazz', 'smooth', 'soul'], 128],
  ['srg-classic', 'Radio Swiss Classic', 'https://stream.srg-ssr.ch/m/rsc_de/mp3_128', 'Classical', 'Switzerland', 'Instrumental', ['classical', 'symphony', 'ad-free'], 128],
  ['srg-pop', 'Radio Swiss Pop', 'https://stream.srg-ssr.ch/m/rsp/mp3_128', 'Pop & Hits', 'Switzerland', 'English', ['pop', 'soft rock', 'ad-free'], 128],
  ['srg-srf3', 'SRF 3 FM', 'https://stream.srg-ssr.ch/m/srf3/mp3_128', 'Pop & Hits', 'Switzerland', 'German', ['pop', 'rock', 'fm'], 128],
  ['srg-couleur3', 'RTS Couleur 3 FM', 'https://stream.srg-ssr.ch/m/couleur3/mp3_128', 'Indie & Rock', 'Switzerland', 'French', ['alternative', 'electro', 'fm'], 128],

  // ── Iconic US & UK Public Broadcasters (20 FM stations) ──
  ['pub-kexp', 'KEXP 90.3 FM Seattle', 'https://kexp-mp3-128.streamguys1.com/kexp128.mp3', 'Indie & Rock', 'USA', 'English', ['indie', 'alternative', 'fm'], 128],
  ['pub-kcrw-e24', 'KCRW Eclectic24', 'https://streams.kcrw.com/e24_mp3', 'Indie & Rock', 'USA', 'English', ['eclectic', 'indie', 'electronic'], 128],
  ['pub-kcrw-live', 'KCRW 89.9 FM Los Angeles', 'https://streams.kcrw.com/kcrw_mp3', 'News & Public', 'USA', 'English', ['npr', 'music', 'fm'], 128],
  ['pub-wfmu', 'WFMU 91.1 FM Freeform', 'https://stream0.wfmu.org/freeform-128k', 'News & Public', 'USA', 'English', ['freeform', 'independent', 'fm'], 128],
  ['pub-wfmu-drummer', 'WFMU Give the Drummer Radio', 'https://stream0.wfmu.org/drummer-128k', 'Jazz & Soul', 'USA', 'English', ['funk', 'soul', 'breaks'], 128],
  ['pub-wfmu-ichiban', "WFMU Rock 'n' Soul Ichiban", 'https://stream0.wfmu.org/ichiban-128k', 'Indie & Rock', 'USA', 'English', ['garage', 'rock', 'soul'], 128],
  ['pub-jazz24', 'Jazz24 — KNKX 88.5 FM', 'https://live.amperwave.net/direct/ppm-jazz24mp3-ibc1', 'Jazz & Soul', 'USA', 'English', ['jazz', '24/7', 'fm'], 128],
  ['pub-wbgo', 'WBGO Jazz 88.3 FM', 'https://wbgo.streamguys1.com/wbgo128', 'Jazz & Soul', 'USA', 'English', ['jazz', 'newark', 'fm'], 128],
  ['pub-wwoz', 'WWOZ 90.7 FM New Orleans', 'https://wwoz-sc.streamguys1.com/wwoz-hi.mp3', 'Jazz & Soul', 'USA', 'English', ['new orleans', 'jazz', 'blues'], 128],
  ['pub-wqxr', 'WQXR 105.9 FM Classical', 'https://stream.wqxr.org/wqxr', 'Classical', 'USA', 'English', ['classical', 'nyc', 'fm'], 128],
  ['pub-king', 'Classical KING 98.1 FM', 'https://classicalking.streamguys1.com/king-fm-mp3-128k', 'Classical', 'USA', 'English', ['classical', 'seattle', 'fm'], 128],
  ['pub-npr', 'NPR Live Program Stream', 'https://npr-ice.streamguys1.com/live.mp3', 'News & Public', 'USA', 'English', ['news', 'public radio', 'talk'], 128],
  ['pub-thecurrent', 'The Current 89.3 FM', 'https://current.stream.publicradio.org/kcmp.mp3', 'Indie & Rock', 'USA', 'English', ['indie', 'rock', 'fm'], 128],
  ['pub-yourclassical', 'YourClassical MPR', 'https://cms.stream.publicradio.org/cms.mp3', 'Classical', 'USA', 'English', ['classical', 'orchestral'], 128],
  ['pub-yc-relax', 'YourClassical Relax', 'https://relax.stream.publicradio.org/relax.mp3', 'Classical', 'USA', 'Instrumental', ['classical', 'calm', 'focus'], 128],
  ['pub-yc-lullabies', 'YourClassical Lullabies', 'https://lullabies.stream.publicradio.org/lullabies.mp3', 'Classical', 'USA', 'Instrumental', ['sleep', 'calm', 'lullaby'], 128],
  ['pub-kutx', 'KUTX 98.9 FM Austin', 'https://kut.streamguys1.com/kutx-free', 'Indie & Rock', 'USA', 'English', ['austin', 'indie', 'fm'], 128],
  ['pub-wxpn', 'WXPN 88.5 FM Philadelphia', 'https://wxpnhi.xpn.org/xpnhi', 'Indie & Rock', 'USA', 'English', ['triple-a', 'indie', 'fm'], 128],
  ['pub-nts1', 'NTS Radio 1 London', 'https://stream-relay-geo.ntslive.net/stream', 'Electronic & Synth', 'UK', 'English', ['underground', 'electronic', 'london'], 128],
  ['pub-nts2', 'NTS Radio 2 London', 'https://stream-relay-geo.ntslive.net/stream2', 'Electronic & Synth', 'UK', 'English', ['experimental', 'club', 'london'], 128],

  // ── Nightride FM, Vaporwave, Synthwave (8 channels) ──
  ['nr-nightride', 'Nightride FM', 'https://stream.nightride.fm/nightride.mp3', 'Electronic & Synth', 'Global', 'Instrumental', ['synthwave', 'retrowave', 'outrun'], 192],
  ['nr-chillsynth', 'Chillsynth FM', 'https://stream.nightride.fm/chillsynth.mp3', 'Electronic & Synth', 'Global', 'Instrumental', ['chillsynth', 'synthwave', 'chill'], 192],
  ['nr-datawave', 'Datawave FM', 'https://stream.nightride.fm/datawave.mp3', 'Electronic & Synth', 'Global', 'Instrumental', ['cyberpunk', 'synth', 'coding'], 192],
  ['nr-spacesynth', 'SpaceSynth FM', 'https://stream.nightride.fm/spacesynth.mp3', 'Electronic & Synth', 'Global', 'Instrumental', ['spacesynth', 'italo', 'retro'], 192],
  ['nr-darksynth', 'DarkSynth FM', 'https://stream.nightride.fm/darksynth.mp3', 'Electronic & Synth', 'Global', 'Instrumental', ['darksynth', 'industrial'], 192],
  ['nr-horrorsynth', 'HorrorSynth FM', 'https://stream.nightride.fm/horrorsynth.mp3', 'Electronic & Synth', 'Global', 'Instrumental', ['horrorsynth', 'cinematic'], 192],
  ['nr-ebsm', 'Nightride EBSM', 'https://stream.nightride.fm/ebsm.mp3', 'Electronic & Synth', 'Global', 'Instrumental', ['ebm', 'electro', 'dark'], 192],
  ['plaza-one', 'Nightwave Plaza', 'https://radio.plaza.one/mp3', 'Electronic & Synth', 'Global', 'English', ['vaporwave', 'future funk', 'retro'], 128],

  // ── UK National FM Broadcasters (6 channels) ──
  ['uk-classicfm', 'Classic FM UK', 'https://media-ice.musicradio.com/ClassicFMMP3', 'Classical', 'UK', 'English', ['classical', 'uk', 'fm'], 128],
  ['uk-capital', 'Capital FM London', 'https://media-ice.musicradio.com/CapitalMP3', 'Pop & Hits', 'UK', 'English', ['pop', 'hits', 'london', 'fm'], 128],
  ['uk-heart', 'Heart UK FM', 'https://media-ice.musicradio.com/HeartUKMP3', 'Pop & Hits', 'UK', 'English', ['pop', 'feel good', 'fm'], 128],
  ['uk-radiox', 'Radio X UK', 'https://media-ice.musicradio.com/RadioXUKMP3', 'Indie & Rock', 'UK', 'English', ['indie', 'britpop', 'rock'], 128],
  ['uk-smooth', 'Smooth Radio UK', 'https://media-ice.musicradio.com/SmoothUKMP3', 'Pop & Hits', 'UK', 'English', ['easy listening', 'soft pop'], 128],
  ['uk-lbc', 'LBC News & Talk UK', 'https://media-ice.musicradio.com/LBCUKMP3', 'News & Public', 'UK', 'English', ['news', 'talk', 'uk'], 128],

  // ── Germany & Netherlands Public & FM (10 channels) ──
  ['de-dlf', 'Deutschlandfunk FM', 'https://st01.sslstream.dlf.de/dlf/01/128/mp3/stream.mp3', 'News & Public', 'Germany', 'German', ['news', 'culture', 'fm'], 128],
  ['de-dlf-nova', 'Deutschlandfunk Nova', 'https://st03.sslstream.dlf.de/dlf/03/128/mp3/stream.mp3', 'Indie & Rock', 'Germany', 'German', ['indie', 'pop', 'culture'], 128],
  ['de-flux-live', 'FluxFM 100.6 Berlin', 'https://streams.fluxfm.de/live/mp3-128/audio/', 'Indie & Rock', 'Germany', 'German', ['berlin', 'indie', 'fm'], 128],
  ['de-flux-chillhop', 'FluxFM Chillhop', 'https://streams.fluxfm.de/Chillhop/mp3-128/audio/', 'Chill & Lofi', 'Germany', 'Instrumental', ['chillhop', 'lofi', 'beats'], 128],
  ['de-flux-jazz', 'FluxFM Jazzradio', 'https://streams.fluxfm.de/jazz/mp3-128/audio/', 'Jazz & Soul', 'Germany', 'Instrumental', ['jazz', 'berlin', 'smooth'], 128],
  ['de-flux-club', 'FluxFM Clubsandwich', 'https://streams.fluxfm.de/clubsandwich/mp3-128/audio/', 'Electronic & Synth', 'Germany', 'Instrumental', ['club', 'house', 'berlin'], 128],
  ['de-radioeins', 'Radioeins 95.8 FM Berlin', 'https://dispatcher.rndfnk.com/rbb/radioeins/live/mp3/mid', 'Indie & Rock', 'Germany', 'German', ['alternative', 'berlin', 'fm'], 128],
  ['nl-3fm', 'NPO 3FM Netherlands', 'https://icecast.omroep.nl/3fm-bb-mp3', 'Pop & Hits', 'Netherlands', 'Dutch', ['pop', 'indie', 'fm'], 192],
  ['nl-radio2', 'NPO Radio 2 Netherlands', 'https://icecast.omroep.nl/radio2-bb-mp3', 'Pop & Hits', 'Netherlands', 'Dutch', ['classic hits', 'pop', 'fm'], 192],
  ['nl-klassiek', 'NPO Klassiek', 'https://icecast.omroep.nl/radio4-bb-mp3', 'Classical', 'Netherlands', 'Dutch', ['classical', 'public', 'fm'], 192],

  // ── 1.FM Global Channels & Indian / World Streams (12 channels) ──
  ['1fm-bombay', '1.FM Bombay Beats', 'https://strm112.1.fm/bombaybeats_mobile_mp3', 'World & Indian', 'India / Global', 'Hindi', ['bollywood', 'indian', 'hindi'], 128],
  ['1fm-chillout', '1.FM Chillout Lounge', 'https://strm112.1.fm/chilloutlounge_mobile_mp3', 'Chill & Lofi', 'Switzerland', 'Instrumental', ['chillout', 'lounge', 'relax'], 128],
  ['1fm-deephouse', '1.FM Deep House', 'https://strm112.1.fm/deephouse_mobile_mp3', 'Electronic & Synth', 'Switzerland', 'English', ['deep house', 'club'], 128],
  ['1fm-trance', '1.FM Amsterdam Trance', 'https://strm112.1.fm/atr_mobile_mp3', 'Electronic & Synth', 'Netherlands', 'English', ['trance', 'uplifting', 'edm'], 128],
  ['1fm-ajazz', '1.FM Adore Jazz', 'https://strm112.1.fm/ajazz_mobile_mp3', 'Jazz & Soul', 'Switzerland', 'Instrumental', ['jazz', 'vocal jazz', 'smooth'], 128],
  ['1fm-baroque', "1.FM Otto's Baroque", 'https://strm112.1.fm/baroque_mobile_mp3', 'Classical', 'Switzerland', 'Instrumental', ['baroque', 'bach', 'vivaldi'], 128],
  ['1fm-top40', '1.FM Absolute Top 40', 'https://strm112.1.fm/top40_mobile_mp3', 'Pop & Hits', 'Switzerland', 'English', ['top 40', 'pop', 'charts'], 128],
  ['1fm-crock', '1.FM Classic Rock', 'https://strm112.1.fm/crock_mobile_mp3', 'Indie & Rock', 'Switzerland', 'English', ['classic rock', 'guitars'], 128],
  ['1fm-80s90s', '1.FM Back to the 80s', 'https://strm112.1.fm/back280s_mobile_mp3', 'Pop & Hits', 'Switzerland', 'English', ['80s', 'retro', 'pop'], 128],
  ['in-air-vb', 'AIR Vividh Bharati', 'https://air.pc.cdn.bitgravity.com/air/live/pbaudio001/playlist.m3u8', 'World & Indian', 'India', 'Hindi', ['all india radio', 'hindi', 'classic'], 128, 'HLS'],
  ['in-air-rainbow', 'AIR FM Rainbow', 'https://airhlspush.pc.cdn.bitgravity.com/httppush/hlspbaudio004/hlspbaudio00464kbps.m3u8', 'World & Indian', 'India', 'Hindi / English', ['all india radio', 'fm', 'india'], 64, 'HLS'],
  ['in-air-kochi', 'AIR Kochi FM 102.3', 'https://air.pc.cdn.bitgravity.com/air/live/pbaudio045/playlist.m3u8', 'World & Indian', 'India', 'Malayalam', ['kerala', 'malayalam', 'fm'], 64, 'HLS'],
  ['in-air-chennai', 'AIR Chennai FM Rainbow', 'https://air.pc.cdn.bitgravity.com/air/live/pbaudio022/playlist.m3u8', 'World & Indian', 'India', 'Tamil', ['chennai', 'tamil', 'fm'], 64, 'HLS'],

  // ── Lo-Fi, Ambient, Focus, Bass & Game / Chiptune (11 channels) ──
  ['lofi-chillsky', 'Chillsky Lo-Fi Beats', 'https://lfhh.radioca.st/stream', 'Chill & Lofi', 'Global', 'Instrumental', ['lofi', 'study', 'hip-hop'], 128],
  ['lofi-streamafrica', 'LoFi 24/7 Chill Radio', 'https://play.streamafrica.net/lofiradio', 'Chill & Lofi', 'Global', 'Instrumental', ['lofi', 'beats', 'relax'], 128],
  ['amb-sleepingpill', 'Ambient Sleeping Pill', 'https://radio.stereoscenic.com/asp-s', 'Ambient & Focus', 'USA', 'Instrumental', ['sleep', 'ambient', 'calm'], 128],
  ['amb-modern', 'Stereoscenic Modern Ambient', 'https://radio.stereoscenic.com/mod-s', 'Ambient & Focus', 'USA', 'Instrumental', ['ambient', 'minimal', 'focus'], 128],
  ['amb-radioart-piano', 'Radio Art — Solo Piano', 'https://live.radioart.com/fSolo_piano.mp3', 'Ambient & Focus', 'Greece', 'Instrumental', ['piano', 'focus', 'relax'], 128],
  ['dnb-bassdrive', 'Bassdrive Drum & Bass', 'https://chi.bassdrive.co/stream', 'Electronic & Synth', 'USA', 'English', ['drum and bass', 'dnb', 'liquid'], 128],
  ['rw-game', 'Rainwave — Video Game OST', 'https://relay.rainwave.cc/game.mp3', 'Game & Retro', 'Canada', 'Instrumental', ['vgm', 'soundtrack', 'gaming'], 128],
  ['rw-chiptune', 'Rainwave — Chiptune 8-Bit', 'https://relay.rainwave.cc/chiptune.mp3', 'Game & Retro', 'Canada', 'Instrumental', ['chiptune', '8-bit', 'retro'], 128],
  ['rw-ocremix', 'Rainwave — OverClocked ReMix', 'https://relay.rainwave.cc/ocremix.mp3', 'Game & Retro', 'Canada', 'Instrumental', ['ocremix', 'game remix'], 128],
  ['rw-covers', 'Rainwave — Game Covers', 'https://relay.rainwave.cc/covers.mp3', 'Game & Retro', 'Canada', 'Instrumental', ['covers', 'orchestral', 'vgm'], 128],
  ['rw-all', 'Rainwave — All Game Radio', 'https://relay.rainwave.cc/all.mp3', 'Game & Retro', 'Canada', 'Instrumental', ['vgm', 'chiptune', 'remix'], 128],
]

export const CURATED_ONLINE_STATIONS: OnlineStation[] = RAW_CURATED_STATIONS.map(
  ([id, name, url, category, country, language, tags, bitrate, codec]) => ({
    id,
    name,
    url,
    category,
    country,
    language,
    tags,
    bitrate,
    codec: codec ?? 'MP3',
  }),
)
