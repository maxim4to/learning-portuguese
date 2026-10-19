/**
 * Poster illustration <img>: lazy, width-descriptor srcset (the browser picks a file from `sizes` × DPR),
 * intrinsic aspect ratio (no layout shift). Data in ./illustrations.ts.
 */
import { cx } from './cx'
import { ART, type IllustrationName } from './illustrations'

const url = (name: IllustrationName, w: number) => `${import.meta.env.BASE_URL}illustrations/${name}-${w}.webp`

export function Illustration({
  name,
  alt = '',
  sizes = '(min-width: 768px) 320px, 50vw',
  cover,
  eager,
  className,
}: {
  name: IllustrationName
  /** Empty for decorative art (default). */
  alt?: string
  /** Rendered CSS width of the image (for `cover`, the width of the cropped-in image box); the browser multiplies it by DPR to pick a file. */
  sizes?: string
  /** Fill the parent (absolute, object-cover) instead of keeping the intrinsic aspect ratio. */
  cover?: boolean
  /** Above-the-fold art: skip lazy loading. */
  eager?: boolean
  className?: string
}) {
  const a = ART[name]
  return (
    <img
      src={url(name, a.src)}
      srcSet={a.widths.map((w) => `${url(name, w)} ${w}w`).join(', ')}
      sizes={sizes}
      width={a.w}
      height={a.h}
      alt={alt}
      aria-hidden={alt ? undefined : true}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
      style={cover ? undefined : { aspectRatio: `${a.w} / ${a.h}` }}
      className={cx('illus block select-none', cover ? 'absolute inset-0 size-full object-cover' : 'h-auto max-w-full', className)}
    />
  )
}
