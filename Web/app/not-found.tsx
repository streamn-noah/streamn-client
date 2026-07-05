import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black text-white p-6 text-center">
      <h1 className="text-6xl font-extrabold text-[#e50914] mb-4">404</h1>
      <h2 className="text-2xl font-bold mb-2">Page Not Found</h2>
      <p className="text-white/60 mb-6">The page you are looking for does not exist or has been moved.</p>
      <Link
        href="/discover"
        className="px-6 py-2 bg-[#e50914] text-white font-semibold rounded hover:bg-[#b80710] transition-colors"
      >
        Return Home
      </Link>
    </div>
  );
}
