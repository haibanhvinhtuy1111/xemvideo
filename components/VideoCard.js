import Link from "next/link";

export default function VideoCard({ v }) {
  return (
    <Link href={`/watch/${v.slug}`} className="group block overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 hover:border-rose-500">
      <div className="relative aspect-video bg-gradient-to-br from-zinc-800 to-zinc-900">
        {v.thumbnail && <img src={v.thumbnail} alt={v.title} loading="lazy" className="h-full w-full object-cover" />}
        <span className="absolute left-2 top-2 rounded bg-black/70 px-2 py-0.5 text-xs uppercase">{v.category}</span>
      </div>
      <h3 className="line-clamp-2 p-3 text-sm font-medium group-hover:text-rose-400">{v.title}</h3>
    </Link>
  );
}
