/**
 * Language follows the operating system. There is no switch, because a switch
 * would be a setting, and `CLAUDE.md` allows none beyond the shortcut remap.
 * Serbian was the only language while this was one person's tool; English exists
 * because other people are going to run it.
 *
 * Hand written rather than pulled from an i18n package: two languages and about
 * sixty strings do not justify a dependency. Both tables are typed as `Strings`,
 * so a key missing from either one is a compile error, which is the only mistake
 * a library would have caught anyway.
 */

export type Locale = 'sr' | 'en'

/**
 * Follows the system language, primary entry only.
 *
 * A wider rule was tried first, Serbian if Serbian appeared anywhere in the
 * preference list, on the reasoning that this machine lists
 * ("en-US", "sr-Latn-US", "sr-US") and its owner wrote the Serbian copy. He
 * wanted English. Reading the primary language is both the standard behaviour
 * and, as it turns out, the correct one: someone whose system is set to English
 * is telling you they want English, and a second entry in the list is not a
 * contradiction of that.
 */
export function detectLocale(): Locale {
  const tag = typeof navigator === 'undefined' ? '' : navigator.language
  return tag.toLowerCase().startsWith('sr') ? 'sr' : 'en'
}

type Strings = {
  // widget
  taskPlaceholder: string
  capturePlaceholder: string
  newSession: string
  durationHint: string
  /** `{n}` is the number of the return. */
  returnCount: string
  // widget errors
  errDatabase: string
  errNotSaved: string
  errSessionNotStarted: string
  errSessionNotClosed: string
  errFocusNotReturned: string
  errCannotLoad: string
  // navigation
  tabCaptures: string
  tabQuestionnaire: string
  tabStats: string
  printAction: string
  // review list
  nothingPending: string
  resolveDone: string
  resolveScheduled: string
  resolveDelete: string
  // questionnaire
  questionnaireLede: string
  save: string
  /** `{n}` is how many questions are left. */
  remaining: string
  outOfSix: string
  partAFour: string
  partAUnderFour: string
  framingNotDiagnosis: string
  framingTakeIt: string
  retake: string
  earlier: string
  // statistics
  statCompletion: string
  statAbandon: string
  statCapturesPerSession: string
  statTimeOfDay: string
  statReturns: string
  noAbandoned: string
  /** `{n}` is the median in minutes. */
  medianAbandon: string
  legendStarted: string
  legendAbandoned: string
  /** `{n}` is how many more sessions are needed. */
  notEnoughSessions: string
  /** `{a}` this week, `{b}` last week. */
  returnsWeek: string
  minutes: string
  // clearing
  clearSessions: string
  clearWarning: string
  clearConfirm: string
  clearCancel: string
  errNotDeleted: string
  // printed page
  printRange: string
  printAsrsHeading: string
  printNoAsrs: string
  printSessionsHeading: string
  printNoSessions: string
  printShaded: string
  printNote: string
  // tray, sent to Rust
  trayOpen: string
  trayAbandon: string
  trayMusic: string
  trayQuit: string
}

const sr: Strings = {
  taskPlaceholder: 'na čemu radiš',
  capturePlaceholder: 'zapiši misao',
  newSession: 'nova sesija',
  durationHint: 'tab',
  returnCount: '{n}. povratak',
  errDatabase: 'baza nije otvorena',
  errNotSaved: 'nije sačuvano',
  errSessionNotStarted: 'sesija nije počela',
  errSessionNotClosed: 'sesija nije zatvorena',
  errFocusNotReturned: 'fokus nije vraćen',
  errCannotLoad: 'ne mogu da učitam',
  tabCaptures: 'zapisano',
  tabQuestionnaire: 'upitnik',
  tabStats: 'statistika',
  printAction: 'pripremi za pregled',
  nothingPending: 'nema ništa',
  resolveDone: 'uradi',
  resolveScheduled: 'zakaži',
  resolveDelete: 'obriši',
  questionnaireLede: 'ASRS v1.1. Odgovaraj na osnovu poslednjih šest meseci.',
  save: 'sačuvaj',
  remaining: 'ostalo {n}',
  outOfSix: 'od 6',
  partAFour: 'Deo A, četiri ili više od šest.',
  partAUnderFour: 'Deo A, manje od četiri od šest.',
  framingNotDiagnosis:
    'Ovo je upitnik za probir, ne dijagnoza. Ne može da postavi dijagnozu i ne isključuje je.',
  framingTakeIt: 'Odnesi rezultat psihijatru.',
  retake: 'popuni ponovo',
  earlier: 'ranije',
  statCompletion: 'završeno po dužini',
  statAbandon: 'prekid',
  statCapturesPerSession: 'povrataka po sesiji',
  statTimeOfDay: 'po dobu dana',
  statReturns: 'povratci',
  noAbandoned: 'nema prekinutih sesija',
  medianAbandon: '{n} min do prekida, medijana',
  legendStarted: 'počelo',
  legendAbandoned: 'prekinuto',
  notEnoughSessions: 'Treba još {n} pre nego što brojevi počnu da znače nešto.',
  returnsWeek: '{a} ove nedelje, {b} prošle',
  minutes: 'min',
  clearSessions: 'obriši sve sesije',
  clearWarning: 'briše i sve zapisano, ne i upitnik',
  clearConfirm: 'obriši',
  clearCancel: 'otkaži',
  errNotDeleted: 'nije obrisano',
  printRange: 'do',
  printAsrsHeading: 'ASRS v1.1, deo A',
  printNoAsrs: 'Upitnik nije popunjen.',
  printSessionsHeading: 'Sesije',
  printNoSessions: 'Nema sesija.',
  printShaded: '{n} od šest stavki u osenčenom opsegu.',
  printNote:
    'Upitnik za probir, ne dijagnoza. Ne postavlja dijagnozu i ne isključuje je. Stavke su date u prevodu na srpski, ne u zvaničnoj validovanoj verziji.',
  trayOpen: 'Zapisano',
  trayAbandon: 'Prekini sesiju',
  trayMusic: 'Muzika',
  trayQuit: 'Izađi',
}

const en: Strings = {
  taskPlaceholder: 'what are you working on',
  capturePlaceholder: 'write the thought down',
  newSession: 'new session',
  durationHint: 'tab',
  returnCount: 'return {n}',
  errDatabase: 'database did not open',
  errNotSaved: 'not saved',
  errSessionNotStarted: 'session did not start',
  errSessionNotClosed: 'session did not close',
  errFocusNotReturned: 'focus was not returned',
  errCannotLoad: 'cannot load',
  tabCaptures: 'captured',
  tabQuestionnaire: 'questionnaire',
  tabStats: 'statistics',
  printAction: 'prepare for appointment',
  nothingPending: 'nothing here',
  resolveDone: 'do it',
  resolveScheduled: 'schedule',
  resolveDelete: 'delete',
  questionnaireLede: 'ASRS v1.1. Answer for the past six months.',
  save: 'save',
  remaining: '{n} left',
  outOfSix: 'of 6',
  partAFour: 'Part A, four or more of six.',
  partAUnderFour: 'Part A, fewer than four of six.',
  framingNotDiagnosis:
    'This is a screener, not a diagnosis. It cannot make one and it cannot rule one out.',
  framingTakeIt: 'Take the result to a psychiatrist.',
  retake: 'take it again',
  earlier: 'earlier',
  statCompletion: 'completed by length',
  statAbandon: 'breaking off',
  statCapturesPerSession: 'returns per session',
  statTimeOfDay: 'by time of day',
  statReturns: 'returns',
  noAbandoned: 'no sessions broken off',
  medianAbandon: '{n} min to breaking off, median',
  legendStarted: 'started',
  legendAbandoned: 'broken off',
  notEnoughSessions: '{n} more before the numbers mean anything.',
  returnsWeek: '{a} this week, {b} last week',
  minutes: 'min',
  clearSessions: 'delete all sessions',
  clearWarning: 'also deletes everything captured, not the questionnaire',
  clearConfirm: 'delete',
  clearCancel: 'cancel',
  errNotDeleted: 'not deleted',
  printRange: 'to',
  printAsrsHeading: 'ASRS v1.1, Part A',
  printNoAsrs: 'The questionnaire has not been filled in.',
  printSessionsHeading: 'Sessions',
  printNoSessions: 'No sessions.',
  printShaded: '{n} of six items in the shaded range.',
  printNote:
    'A screening questionnaire, not a diagnosis. It does not make one and does not rule one out.',
  trayOpen: 'Captured',
  trayAbandon: 'End session',
  trayMusic: 'Music',
  trayQuit: 'Quit',
}

const TABLES: Record<Locale, Strings> = { sr, en }

export const LOCALE: Locale = detectLocale()
export const t: Strings = TABLES[LOCALE]

/** Substitutes `{name}` placeholders. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  )
}

/**
 * Serbian counts by the last digit except in the teens. English does not count
 * at all. Both live here so no caller has to know which language it is in.
 */
export function sessionsWord(count: number): string {
  if (LOCALE === 'en') return count === 1 ? 'session' : 'sessions'
  const lastTwo = count % 100
  if (lastTwo >= 11 && lastTwo <= 14) return 'sesija'
  const last = count % 10
  if (last === 1) return 'sesija'
  return last >= 2 && last <= 4 ? 'sesije' : 'sesija'
}

/** The tag used for dates and times. Serbian is shown in Latin script. */
export const DATE_LOCALE = LOCALE === 'sr' ? 'sr-Latn' : 'en-GB'

export { TABLES as LOCALE_TABLES }
