import { useCallback, useEffect, useState } from 'react'
import {
  PART_A_THRESHOLD,
  QUESTIONS,
  SCALE,
  isComplete,
  partAScore,
} from '../types/asrs'
import type { Answer, Answers } from '../types/asrs'
import { asrsHistory, saveAsrs } from '../lib/db'
import type { AsrsRecord } from '../lib/db'
import { failure } from '../lib/ipc'
import { formatDate } from './format'

type View = { kind: 'form'; answers: Answers } | { kind: 'result'; record: AsrsRecord }

export function Asrs(): JSX.Element {
  const [view, setView] = useState<View>({ kind: 'form', answers: {} })
  const [history, setHistory] = useState<AsrsRecord[]>([])
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const records = await asrsHistory()
      setHistory(records)
      const latest = records[0]
      if (latest !== undefined) setView({ kind: 'result', record: latest })
    } catch (e: unknown) {
      setError(failure('ne mogu da učitam', e))
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const submit = useCallback(
    async (answers: Answers): Promise<void> => {
      try {
        await saveAsrs(answers, partAScore(answers))
        await refresh()
        window.scrollTo(0, 0)
      } catch (e: unknown) {
        setError(failure('nije sačuvano', e))
      }
    },
    [refresh],
  )

  if (view.kind === 'result') {
    return (
      <Result
        record={view.record}
        history={history}
        error={error}
        onRetake={() => setView({ kind: 'form', answers: {} })}
      />
    )
  }

  return (
    <Form
      answers={view.answers}
      error={error}
      onAnswer={(number, value) =>
        setView({ kind: 'form', answers: { ...view.answers, [number]: value } })
      }
      onSubmit={() => void submit(view.answers)}
    />
  )
}

function Form({
  answers,
  error,
  onAnswer,
  onSubmit,
}: {
  answers: Answers
  error: string | null
  onAnswer: (number: number, value: Answer) => void
  onSubmit: () => void
}): JSX.Element {
  const answered = QUESTIONS.filter((q) => answers[q.number] !== undefined).length
  const complete = isComplete(answers)

  return (
    <div>
      <header className="header">
        <h1>upitnik</h1>
        <span className="count">
          {answered} / {QUESTIONS.length}
        </span>
      </header>

      <p className="lede">
        ASRS v1.1. Odgovaraj na osnovu poslednjih šest meseci.
      </p>

      {error !== null && <p className="error">{error}</p>}

      <ol className="questions">
        {QUESTIONS.map((question) => (
          <li key={question.number} className="question">
            <div className="question-text">
              <span className="question-number">{question.number}.</span>
              {question.text}
            </div>
            {/*
              The original wording, kept visible under the translation. This is a
              clinical instrument answered through a translation that is mine and
              not the validated Serbian version, and the difference between an
              ASRS score and an approximation of one is whether the person
              answering could check what was actually asked.
            */}
            <div className="question-original">{question.original}</div>
            <div className="scale">
              {SCALE.map((option) => {
                const selected = answers[question.number] === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={selected ? 'option selected' : 'option'}
                    onClick={() => onAnswer(question.number, option.value)}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          </li>
        ))}
      </ol>

      <div className="actions">
        <button type="button" className="primary" disabled={!complete} onClick={onSubmit}>
          sačuvaj
        </button>
        {!complete && <span className="meta">ostalo {QUESTIONS.length - answered}</span>}
      </div>
    </div>
  )
}

function Result({
  record,
  history,
  error,
  onRetake,
}: {
  record: AsrsRecord
  history: AsrsRecord[]
  error: string | null
  onRetake: () => void
}): JSX.Element {
  return (
    <div>
      <header className="header">
        <h1>upitnik</h1>
        <span className="count">{formatDate(record.taken_at)}</span>
      </header>

      {error !== null && <p className="error">{error}</p>}

      <div className="score">
        <span className="score-value">{record.part_a_score}</span>
        <span className="score-of">od 6</span>
      </div>
      <p className="meta">
        Deo A, {record.part_a_score >= PART_A_THRESHOLD ? 'četiri ili više' : 'manje od četiri'} od
        šest.
      </p>

      {/*
        The only interpretation this screen is permitted to make. It says what
        the instrument is and what the next step is, and stops. Anything that
        reads as a verdict, in either direction, would be a diagnosis this app
        has no standing to give, and a reassurance it has no standing to give
        either.
      */}
      <div className="framing">
        <p>
          Ovo je upitnik za probir, ne dijagnoza. Ne može da postavi dijagnozu i ne isključuje je.
        </p>
        <p>Odnesi rezultat psihijatru.</p>
      </div>

      <div className="actions">
        <button type="button" onClick={onRetake}>
          popuni ponovo
        </button>
      </div>

      {history.length > 1 && (
        <div className="history">
          <h2>ranije</h2>
          <ul>
            {history.slice(1).map((entry) => (
              <li key={entry.id}>
                <span className="meta">{formatDate(entry.taken_at)}</span>
                <span>{entry.part_a_score} / 6</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
