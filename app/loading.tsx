export default function Loading() {
  return (
    <div className="shell grid min-h-[60vh] items-start gap-6 py-10 md:grid-cols-[240px_minmax(0,1fr)]">
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-12 rounded-lg" />
        ))}
      </div>
      <div>
        <div className="skeleton h-8 w-1/3 rounded" />
        <div className="mt-6 grid grid-cols-2 gap-5 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton aspect-[4/5] rounded-xl" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
