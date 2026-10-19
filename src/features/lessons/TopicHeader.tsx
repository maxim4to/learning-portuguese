import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { getModule, getTopic, type Topic } from '@/content'
import type { TopicProgress } from '@/data'
import { LessonHeader } from '@/components/LessonHeader'
import { STATUS } from '@/components/status'
import { cx } from '@/components/cx'

/**
 * Topic title: one compact line (back · level · title) on every tab, so the lesson content fits the screen.
 * `details` (Theory tab): a quiet second line with the Portuguese title and the prerequisites.
 */
export function TopicHeader({
  topic,
  progress,
  details = false,
}: {
  topic: Topic
  progress: Map<string, TopicProgress>
  details?: boolean
}) {
  const mod = getModule(topic.module)
  return (
    <LessonHeader
      back={{ to: '/syllabus', label: 'Курс', title: mod ? `Курс · ${mod.module.title}` : 'Курс' }}
      level={topic.level}
      title={topic.title}
      below={
        details && (
          <>
            <span className="font-pt" lang="pt-PT">
              {topic.titlePt}
            </span>
            {topic.requires.length > 0 && (
              <span>
                Сначала:{' '}
                {topic.requires.map((id, i) => {
                  const st = progress.get(id)?.status ?? 'not-started'
                  return (
                    <Fragment key={id}>
                      {i > 0 && ', '}
                      <Link to={`/topic/${id}`} className="inline-flex items-center gap-1.5 font-semibold">
                        <i aria-hidden className={cx('inline-block size-2 shrink-0 rounded-full', STATUS[st].dot)} />
                        {getTopic(id)?.title ?? id}
                        <span className="sr-only"> ({STATUS[st].label})</span>
                      </Link>
                    </Fragment>
                  )
                })}
              </span>
            )}
          </>
        )
      }
    />
  )
}
