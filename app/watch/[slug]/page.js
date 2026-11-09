"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Player from "@/components/Player";
import { getSource } from "@/config/site";

export default function Watch() {
  const { slug } = useParams();
  const [v, setV] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch(`${getSource()}/api/videos?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setV)
      .catch(() => setErr("Không tìm thấy video."));
  }, [slug]);

  if (err) return <p className="text-red-400">{err}</p>;
  if (!v) return <p className="text-zinc-400">Đang tải...</p>;
  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/" className="text-sm text-zinc-400 hover:text-rose-400">← Quay lại</Link>
      <h1 className="mb-4 mt-2 text-xl font-bold md:text-2xl">{v.title}</h1>
      <Player servers={v.servers} />
      {v.description && <p className="mt-4 text-zinc-300">{v.description}</p>}
    </div>
  );
}
