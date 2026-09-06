import { SkeletonBlock, SkeletonLines } from '@/components/ui/states'

/**
 * A loading state that matches the shape of the screen it replaces reads as
 * fast. A centred spinner reads as broken.
 */
export default function StudioLoading() {
  return (
    <div aria-busy="true">
      <div className="border-b border-v3 bg-v1 px-5 py-6 sm:px-8">
        <SkeletonBlock className="h-8 w-56" />
        <div className="mt-4 max-w-md">
          <SkeletonLines rows={2} />
        </div>
      </div>

      <div className="border-b border-v3 bg-v0 px-5 py-6 sm:px-8">
        <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i}>
              <SkeletonBlock className="h-9 w-16" />
              <div className="mt-3">
                <SkeletonLines rows={1} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="px-5 py-6 sm:px-8">
        <SkeletonBlock className="h-10 w-full" />
        <div className="mt-4 space-y-px border border-v3">
          {Array.from({ length: 8 }, (_, i) => (
            <SkeletonBlock key={i} className="h-16 w-full border-0 border-b border-v3" />
          ))}
        </div>
      </div>
      <span className="sr-only">Loading the cohort</span>
    </div>
  )
}
