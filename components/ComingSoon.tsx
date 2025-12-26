import Image from "next/image";
export default function ComingSoon() {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <div className="max-w-2xl w-full text-center px-4">
          <div className="mb-8 flex justify-center">
            <Image
              src="/lost.png"
              alt="Lost in the sauce"
              width={300}
              height={300}
              className="object-contain"
              priority
            />
          </div>

          <h1 className="text-5xl md:text-7xl font-bold text-white mb-4">
            Coming soon...
          </h1>

          <div className="max-w-md mx-auto space-y-4">
            <p className="text-lg text-zinc-400">
              this will be a place for you to store all your hack club memories
            </p>
            <p className="text-base text-zinc-500 italic">
              ask deployor if u wanna know more bout it! :)
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
