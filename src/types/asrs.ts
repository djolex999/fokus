/**
 * ASRS v1.1, the WHO Adult ADHD Self-Report Scale.
 *
 * The Part A rubric is not a sum. Each item counts one point only if the answer
 * falls in that item's darkly shaded range on the printed form, and the range
 * differs per item: questions 1 to 3 count from "Sometimes" upward, questions 4
 * to 6 only from "Often" upward. Four or more of six is the screening threshold.
 *
 * Thresholds below were read off the official form
 * (Adult ADHD Self-Report Scale (ASRS-v1.1) Symptom Checklist), not recalled.
 * Part B is recorded but has no scoring rule; it exists to give a clinician
 * further probes, and inventing a score for it would be inventing a measure.
 */

export const SCALE = [
  { value: 0, label: 'nikada' },
  { value: 1, label: 'retko' },
  { value: 2, label: 'ponekad' },
  { value: 3, label: 'često' },
  { value: 4, label: 'vrlo često' },
] as const

export type Answer = 0 | 1 | 2 | 3 | 4

export type AsrsQuestion = {
  /** 1 based, matching the printed form. */
  number: number
  part: 'A' | 'B'
  /** Serbian, what the user actually answers. */
  text: string
  /** The official wording, carried through to the printed page so a clinician
   *  can see exactly what was asked rather than trusting a translation. */
  original: string
  /** Lowest answer value that falls in this item's shaded range. */
  threshold: 2 | 3
}

export const QUESTIONS: AsrsQuestion[] = [
  {
    number: 1,
    part: 'A',
    text: 'Koliko često imaš problem da završiš poslednje detalje na zadatku, kada je teži deo već gotov?',
    original:
      'How often do you have trouble wrapping up the final details of a project, once the challenging parts have been done?',
    threshold: 2,
  },
  {
    number: 2,
    part: 'A',
    text: 'Koliko često ti je teško da dovedeš stvari u red kada radiš nešto što traži organizaciju?',
    original:
      'How often do you have difficulty getting things in order when you have to do a task that requires organization?',
    threshold: 2,
  },
  {
    number: 3,
    part: 'A',
    text: 'Koliko često imaš problem da se setiš zakazanih obaveza?',
    original: 'How often do you have problems remembering appointments or obligations?',
    threshold: 2,
  },
  {
    number: 4,
    part: 'A',
    text: 'Kada te čeka zadatak koji traži dosta razmišljanja, koliko često ga izbegavaš ili odlažeš?',
    original:
      'When you have a task that requires a lot of thought, how often do you avoid or delay getting started?',
    threshold: 3,
  },
  {
    number: 5,
    part: 'A',
    text: 'Koliko često vrpoljiš ruke ili noge kada moraš da sediš duže vreme?',
    original:
      'How often do you fidget or squirm with your hands or feet when you have to sit down for a long time?',
    threshold: 3,
  },
  {
    number: 6,
    part: 'A',
    text: 'Koliko često se osećaš preterano aktivno, kao da te nešto tera, kao da imaš motor u sebi?',
    original:
      'How often do you feel overly active and compelled to do things, like you were driven by a motor?',
    threshold: 3,
  },
  {
    number: 7,
    part: 'B',
    text: 'Koliko često praviš greške iz nepažnje kada radiš na dosadnom ili teškom zadatku?',
    original:
      'How often do you make careless mistakes when you have to work on a boring or difficult project?',
    threshold: 3,
  },
  {
    number: 8,
    part: 'B',
    text: 'Koliko često ti je teško da održiš pažnju dok radiš dosadan ili repetitivan posao?',
    original:
      'How often do you have difficulty keeping your attention when you are doing boring or repetitive work?',
    threshold: 3,
  },
  {
    number: 9,
    part: 'B',
    text: 'Koliko često ti je teško da se skoncentrišeš na to što ti neko govori, čak i kada se obraća direktno tebi?',
    original:
      'How often do you have difficulty concentrating on what people say to you, even when they are speaking to you directly?',
    threshold: 2,
  },
  {
    number: 10,
    part: 'B',
    text: 'Koliko često zagubiš stvari ili ti je teško da ih nađeš, kod kuće ili na poslu?',
    original: 'How often do you misplace or have difficulty finding things at home or at work?',
    threshold: 3,
  },
  {
    number: 11,
    part: 'B',
    text: 'Koliko često te omete kretanje ili buka oko tebe?',
    original: 'How often are you distracted by activity or noise around you?',
    threshold: 3,
  },
  {
    number: 12,
    part: 'B',
    text: 'Koliko često ustaneš sa mesta na sastanku ili u drugoj situaciji u kojoj se očekuje da ostaneš da sediš?',
    original:
      'How often do you leave your seat in meetings or other situations in which you are expected to remain seated?',
    threshold: 2,
  },
  {
    number: 13,
    part: 'B',
    text: 'Koliko često se osećaš nemirno?',
    original: 'How often do you feel restless or fidgety?',
    threshold: 3,
  },
  {
    number: 14,
    part: 'B',
    text: 'Koliko često ti je teško da se opustiš kada imaš vremena za sebe?',
    original:
      'How often do you have difficulty unwinding and relaxing when you have time to yourself?',
    threshold: 3,
  },
  {
    number: 15,
    part: 'B',
    text: 'Koliko često primetiš da pričaš previše u društvu?',
    original: 'How often do you find yourself talking too much when you are in social situations?',
    threshold: 3,
  },
  {
    number: 16,
    part: 'B',
    text: 'Kada razgovaraš sa nekim, koliko često mu dovršiš rečenicu pre nego što je on sam završi?',
    original:
      "When you're in a conversation, how often do you find yourself finishing the sentences of the people you are talking to, before they can finish them themselves?",
    threshold: 2,
  },
  {
    number: 17,
    part: 'B',
    text: 'Koliko često ti je teško da sačekaš svoj red u situacijama gde se red poštuje?',
    original:
      'How often do you have difficulty waiting your turn in situations when turn taking is required?',
    threshold: 3,
  },
  {
    number: 18,
    part: 'B',
    text: 'Koliko često prekineš druge kada su zauzeti?',
    original: 'How often do you interrupt others when they are busy?',
    threshold: 2,
  },
]

export const PART_A = QUESTIONS.filter((q) => q.part === 'A')

/** Four or more of six is the threshold at which the form says further
 *  investigation is warranted. It is not a diagnosis and not a cut off for one. */
export const PART_A_THRESHOLD = 4

export type Answers = Record<number, Answer>

/** One point per Part A item whose answer reaches that item's own threshold. */
export function partAScore(answers: Answers): number {
  return PART_A.reduce((score, question) => {
    const answer = answers[question.number]
    return answer !== undefined && answer >= question.threshold ? score + 1 : score
  }, 0)
}

export function isComplete(answers: Answers): boolean {
  return QUESTIONS.every((q) => answers[q.number] !== undefined)
}
