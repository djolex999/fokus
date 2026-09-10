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
import { LOCALE, fill, t } from '../lib/i18n'
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
      setError(failure(t.errCannotLoad, e))
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
        setError(failure(t.errNotSaved, e))
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
        <h1>{t.tabQuestionnaire}</h1>
        <span className="count">
          {answered} / {QUESTIONS.length}
        </span>
      </header>

      <p className="lede">{t.questionnaireLede}</p>
      {/* Before the questions, not after the score. A disclaimer that only
          appears once you have a number has already let you read the number as
          a verdict. */}
      <p className="disclaimer">{t.disclaimer}</p>

      {error !== null && <p className="error">{error}</p>}

      <ol className="questions">
        {QUESTIONS.map((question) => (
          <li key={question.number} className="question">
            <div className="question-text">
              <span className="question-number">{question.number}.</span>
              {LOCALE === 'sr' ? question.text : question.original}
            </div>
            {/*
              Shown only in Serbian, where the question above it is a translation
              of mine rather than the validated instrument. In English the
              official wording is already the question, so there is nothing to
              check it against.
            */}
            {LOCALE === 'sr' && <div className="question-original">{question.original}</div>}
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
          {t.save}
        </button>
        {!complete && (
          <span className="meta">{fill(t.remaining, { n: QUESTIONS.length - answered })}</span>
        )}
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
        <h1>{t.tabQuestionnaire}</h1>
        <span className="count">{formatDate(record.taken_at)}</span>
      </header>

      {error !== null && <p className="error">{error}</p>}

      <div className="score">
        <span className="score-value">{record.part_a_score}</span>
        <span className="score-of">{t.outOfSix}</span>
      </div>
      <p className="meta">
        {record.part_a_score >= PART_A_THRESHOLD ? t.partAFour : t.partAUnderFour}
      </p>

      {/*
        The only interpretation this screen is permitted to make. It says what
        the instrument is and what the next step is, and stops. Anything that
        reads as a verdict, in either direction, would be a diagnosis this app
        has no standing to give, and a reassurance it has no standing to give
        either.
      */}
      {/*
        Body size, not fine print. This is part of reading the score, and a
        disclaimer set smaller than the text around it gets skipped by exactly
        the person who most needs to read it.
      */}
      <div className="framing">
        <p>{t.resultFraming}</p>
      </div>

      <div className="actions">
        <button type="button" onClick={onRetake}>
          {t.retake}
        </button>
      </div>

      {history.length > 1 && (
        <div className="history">
          <h2>{t.earlier}</h2>
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
