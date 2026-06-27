import { StreamnNav } from "@/components/streamn/streamn-nav";

function SkeletonRow() {
  return (
    <div className='mx-auto mb-8 w-full max-w-[1500px] px-5 md:px-10'>
      <div className='mb-4 h-6 w-40 rounded-full bg-white/8' />
      <div className='discover-skeleton-row'>
        {Array.from({ length: 6 }).map((_, index) => (
          <div className='discover-skeleton-card' key={index} />
        ))}
      </div>
    </div>
  );
}

export default function DiscoverLoading() {
  return (
    <main className='discover-skeleton pb-24 md:pb-20'>
      <div className='morph-bg' />
      <div className='grain' />
      <StreamnNav />
      <div className='discover-skeleton-banner' />
      <div className='relative z-10 space-y-2 pt-8'>
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    </main>
  );
}
