import { useMemo } from 'react'
import type { Topic } from '@/content'
import { SpeakButton } from '@/components/SpeakButton'
import { ReviewPickerBar, ReviewPickerConfirm, ReviewToggle } from '@/features/srs/ReviewPicker'
import { useReviewPicker } from '@/features/srs/useReviewPicker'
import { Pt } from '@/features/words/Pt'
import { exampleCardSpecs } from './persist'

/** Topic examples: play, capture words, and pick the ones worth reviewing (one by one or several at once). */
export function ExamplesSection({ topic }: { topic: Topic }) {
  const specs = useMemo(() => exampleCardSpecs(topic), [topic])
  const picker = useReviewPicker(specs)

  return (
    <div className="space-y-3">
      <ReviewPickerBar picker={picker} noun={['примера', 'примеров', 'примеров']} />
      <ul className="card divide-y divide-line p-0">
        {topic.examples.map((ex, i) => (
          <li key={i} className="flex items-start gap-3 py-3 pr-2 pl-3 sm:pl-4">
            <SpeakButton text={ex.pt} />
            <div className="min-w-0 flex-1 pt-1">
              <Pt
                as="p"
                id={`ex-${i}`}
                src={{ kind: 'topic', id: topic.id, part: 'examples', index: i }}
                ru={ex.ru}
                className="scroll-mt-28 text-base leading-snug font-semibold"
              >
                {ex.pt}
              </Pt>
              <p className="mt-0.5 text-sm text-ink-muted">{ex.ru}</p>
              {/* Phones: the button sits under the translation, so it never squeezes the text. */}
              <div className="mt-1.5 sm:hidden">
                <ReviewToggle picker={picker} id={specs[i].id} name={ex.pt} />
              </div>
            </div>
            <div className="max-sm:hidden">
              <ReviewToggle picker={picker} id={specs[i].id} name={ex.pt} />
            </div>
          </li>
        ))}
      </ul>
      <ReviewPickerConfirm picker={picker} />
    </div>
  )
}
